import { NextRequest } from "next/server";
import { GateActionSchema } from "@/lib/pipeline/types";
import { saveSession, getSession } from "@/lib/store/sessions";
import { applyGateAction } from "@/lib/pipeline/gates";
import { geminiAdapters } from "@/lib/pipeline/provider";
import { rateLimit, clientKey } from "@/lib/middleware";
import { recordToLedger } from "@/lib/store/ledger";

export const runtime = "nodejs";
export const maxDuration = 300;

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

export async function POST(req: NextRequest) {
  const rl = rateLimit(`action:${clientKey(req)}`, 30, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const sessionId = (req as NextRequest & { params?: { id?: string } }).params?.id
    ?? new URL(req.url).pathname.match(/pipeline\/([^/]+)\/action/)?.[1];
  if (!sessionId) {
    return Response.json({ error: "Session id required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = GateActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", issues: parsed.error.issues.map((i) => i.message) },
      { status: 422 }
    );
  }

  try {
    const session = await getSession(sessionId, ORG_ID);
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
    const updated = await applyGateAction(session, parsed.data, geminiAdapters);
    await saveSession(updated, ORG_ID);
    return Response.json({ session: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    await recordToLedger({
      orgId: ORG_ID,
      sessionId,
      gate: "system",
      eventType: "error",
      detail: { summary: message },
    }).catch(() => {});
    return Response.json({ error: message }, { status: 500 });
  }
}
