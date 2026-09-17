import { NextRequest } from "next/server";
import { StartRequestSchema, GateActionSchema } from "@/lib/pipeline/types";
import { createSession, saveSession, getSession } from "@/lib/store/sessions";
import { processGate, applyGateAction } from "@/lib/pipeline/gates";
import { geminiAdapters } from "@/lib/pipeline/provider";
import { rateLimit, clientKey, sanitizeInput } from "@/lib/middleware";
import { recordToLedger } from "@/lib/store/ledger";

export const runtime = "nodejs";
export const maxDuration = 300;

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

// POST /api/pipeline        -> start a new session (runs suitability gate)
// POST /api/pipeline/<id>   -> apply a gate action to an existing session
export async function POST(req: NextRequest) {
  // Rate limit (F39): 10 pipeline ops per minute per IP.
  const rl = rateLimit(`pipeline:${clientKey(req)}`, 10, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = new URL(req.url);
  const sessionId = url.pathname.split("/")[3]; // /api/pipeline/<id>

  try {
    if (!sessionId) {
      // ---- Start: intake (G0) then run the suitability gate (G1) ----
      const parsed = StartRequestSchema.safeParse(body);
      if (!parsed.success) {
        return Response.json(
          { error: "Validation failed", issues: parsed.error.issues.map((i) => i.message) },
          { status: 422 }
        );
      }
      const input = sanitizeInput(parsed.data.input);
      const session = await createSession({
        orgId: ORG_ID,
        input,
        statedStack: sanitizeInput(parsed.data.statedStack ?? ""),
      });
      session.gate = "suitability";
      const processed = await processGate(session, geminiAdapters);
      await saveSession(processed, ORG_ID);
      return Response.json({ session: processed });
    }

    // ---- Gate action on existing session ----
    const session = await getSession(sessionId, ORG_ID);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    const parsed = GateActionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", issues: parsed.error.issues.map((i) => i.message) },
        { status: 422 }
      );
    }
    const updated = await applyGateAction(session, parsed.data, geminiAdapters);
    await saveSession(updated, ORG_ID);
    return Response.json({ session: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    await recordToLedger({
      orgId: ORG_ID,
      sessionId: sessionId ?? "unknown",
      gate: "system",
      eventType: "error",
      detail: { summary: message },
    }).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET /api/pipeline/<id> -> fetch session state (polling fallback)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.pathname.split("/")[3];
  if (!sessionId) {
    return Response.json({ error: "Session id required" }, { status: 400 });
  }
  const session = await getSession(sessionId, ORG_ID);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }
  return Response.json({ session });
}
