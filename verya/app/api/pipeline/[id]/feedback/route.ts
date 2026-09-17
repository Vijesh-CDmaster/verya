import { NextRequest } from "next/server";
import { z } from "zod";
import { getSession, saveSession } from "@/lib/store/sessions";
import { rateLimit, clientKey } from "@/lib/middleware";
import { recordToLedger } from "@/lib/store/ledger";
import { remember } from "@/lib/store/memory";
import { updateReputation } from "@/lib/store/reputation";

export const runtime = "nodejs";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

const BodySchema = z.object({
  taskId: z.string().min(1),
  accepted: z.boolean(),
  rating: z.number().min(1).max(5).optional(),
  note: z.string().max(400).optional(),
});

export async function POST(req: NextRequest) {
  const rl = rateLimit(`feedback:${clientKey(req)}`, 60, 60_000);
  if (!rl.ok) return Response.json({ error: "Rate limit exceeded." }, { status: 429 });

  const sessionId = new URL(req.url).pathname.match(/pipeline\/([^/]+)\/feedback/)?.[1];
  if (!sessionId) return Response.json({ error: "Session id required" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed" }, { status: 422 });
  }

  const session = await getSession(sessionId, ORG_ID);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const { taskId, accepted, rating, note } = parsed.data;
  const task = session.workflow?.tasks.find((t) => t.id === taskId);
  const exec = session.executions.find((e) => e.taskId === taskId);
  const algo = session.algorithms?.tasks.find((a) => a.taskId === taskId);
  const route = session.routing?.routes.find((r) => r.taskId === taskId);

  // F16: store the feedback on the session.
  session.humanFeedback.ratings[taskId] = { accepted, rating, note };
  await saveSession(session, ORG_ID);

  // F9: remember the interaction outcome for this org (private skill map).
  await remember({
    orgId: ORG_ID,
    sessionId,
    taskCategory: task?.category ?? "other",
    taskTitle: task?.title ?? taskId,
    model: exec?.model ?? route?.selectedModel ?? "unknown",
    algorithm: algo?.selected ?? "unknown",
    stack: session.stackGate?.selected ?? session.statedStack,
    outcome: accepted ? "accepted" : "rejected",
    accepted,
    rating: rating ?? null,
    note: note ?? "",
    verificationPassed: exec?.verification.passed ?? null,
  });

  // F12: nudge the living reputation score for model × category.
  if (exec?.model) {
    await updateReputation({
      model: exec.model,
      taskCategory: task?.category ?? "other",
      outcome: accepted ? "accepted" : "rejected",
    });
  }

  await recordToLedger({
    orgId: ORG_ID,
    sessionId,
    gate: "review",
    eventType: "human_feedback",
    actor: "human",
    taskId,
    model: exec?.model,
    detail: { summary: `User ${accepted ? "accepted" : "rejected"} output for ${task?.title ?? taskId}`, rating, note },
  });

  return Response.json({ session });
}
