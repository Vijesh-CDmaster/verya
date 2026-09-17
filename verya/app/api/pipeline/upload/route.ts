import { NextRequest } from "next/server";
import { rateLimit, clientKey, sanitizeInput } from "@/lib/middleware";
import { createSession, saveSession } from "@/lib/store/sessions";
import { processGate } from "@/lib/pipeline/gates";
import { geminiAdapters } from "@/lib/pipeline/provider";
import { recordToLedger } from "@/lib/store/ledger";

export const runtime = "nodejs";
export const maxDuration = 300;

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB per file
const MAX_FILES = 5;
const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".log"];

/**
 * Intake with file upload (F1.3): multipart form with `input` text plus up to 5
 * text-like attachments (txt/md/csv/json/yaml/log). PDF/DOCX arrive with the
 * dedicated parser wave; rejected with a clear message for now.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`upload:${clientKey(req)}`, 6, 60_000);
  if (!rl.ok) {
    return Response.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const input = sanitizeInput(String(form.get("input") ?? ""));
  const statedStack = sanitizeInput(String(form.get("statedStack") ?? ""));
  const policyRaw = String(form.get("policy") ?? "balanced");
  const policy = (["lowest_cost", "highest_accuracy", "balanced"] as const).includes(
    policyRaw as never
  )
    ? (policyRaw as "lowest_cost" | "highest_accuracy" | "balanced")
    : "balanced";

  if (input.trim().length < 20) {
    return Response.json(
      { error: "Give at least a couple of sentences describing the project." },
      { status: 422 }
    );
  }

  const uploads: { name: string; chars: number }[] = [];
  const parts: string[] = [];
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length > MAX_FILES) {
    return Response.json({ error: `Max ${MAX_FILES} files per submission.` }, { status: 422 });
  }

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return Response.json(
        {
          error: `${file.name}: unsupported type. Text files (txt, md, csv, json, yaml, log) are accepted; PDF/DOCX support is coming.`,
        },
        { status: 422 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: `${file.name}: too large (max 2MB).` },
        { status: 422 }
      );
    }
    const text = sanitizeInput(await file.text());
    if (text.length === 0) {
      return Response.json({ error: `${file.name}: empty or unreadable.` }, { status: 422 });
    }
    uploads.push({ name: file.name, chars: text.length });
    parts.push(`\n\n--- ATTACHED FILE: ${file.name} ---\n${text.slice(0, 40000)}`);
  }

  const combined = input + parts.join("");

  const session = await createSession({
    orgId: ORG_ID,
    input: combined,
    statedStack,
    policy,
    uploads,
  });
  session.gate = "suitability";

  try {
    const processed = await processGate(session, geminiAdapters);
    await saveSession(processed, ORG_ID);

    await recordToLedger({
      orgId: ORG_ID,
      sessionId: session.id,
      gate: "intake",
      eventType: "submission",
      detail: {
        summary: `New submission${uploads.length ? ` with ${uploads.length} attachment(s)` : ""}`,
        uploads,
        policy,
      },
    }).catch(() => {});

    return Response.json({ session: processed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    await recordToLedger({
      orgId: ORG_ID,
      sessionId: session.id,
      gate: "system",
      eventType: "error",
      detail: { summary: message },
    }).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
}
