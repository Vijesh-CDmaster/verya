// Explain My Decision (F22c) — a plain-language query surface over the Trust Ledger.
// Retrieves the actual logged records for a session/gate/task/model and asks a model
// to explain the reasoning from that evidence — never from imagination.
import { listLedger, type LedgerEntry } from "../repositories/ledger";
import { runModelText } from "../lib/ai/provider";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

function entryLine(e: LedgerEntry): string {
  const bits = [
    `#${e.seq}`,
    `gate=${e.gate}`,
    `event=${e.eventType}`,
    e.actor ? `actor=${e.actor}` : null,
    e.model ? `model=${e.model}` : null,
    e.taskId ? `task=${e.taskId}` : null,
    e.detail && typeof e.detail.summary === "string" ? `— ${e.detail.summary}` : null,
  ].filter(Boolean);
  return bits.join(" ");
}

export async function explainDecision(input: {
  orgId?: string;
  question: string;
  sessionId?: string;
  taskId?: string;
  model?: string;
}): Promise<{ answer: string; recordsUsed: number }> {
  // Pull the most relevant ledger slice (newest first, capped for prompt size).
  // Strictly org-scoped: explain answers never cross tenant boundaries.
  const records = await listLedger({
    orgId: input.orgId || ORG_ID,
    sessionId: input.sessionId,
    taskId: input.taskId,
    model: input.model,
    limit: 60,
  });

  if (records.length === 0) {
    return {
      answer:
        "No ledger records match that query yet. The Trust Ledger fills in as workflows run — try again after executing a pipeline, or broaden your question.",
      recordsUsed: 0,
    };
  }

  const evidence = records.slice(0, 40).map(entryLine).join("\n");

  const system =
    "You are Verya's decision-explainer. You answer questions about why the system made pipeline " +
    "decisions (model routing, algorithm choice, stack pick, escalations) using ONLY the provided " +
    "ledger evidence. Quote the specific records (their #seq numbers) you relied on. If the evidence " +
    "does not contain the answer, say exactly that — never speculate.";

  const user = `LEDGER EVIDENCE (newest first):\n${evidence}\n\nQUESTION: ${input.question}\n\n` +
    "Answer in plain language, 3-6 sentences, citing record numbers.";

  // Strong open-weights model on Groq; runModelText fails over across the whole pool.
  const res = await runModelText(process.env.EXPLAIN_MODEL || "openai/gpt-oss-120b", system, user, "verification");

  return { answer: res.text.trim(), recordsUsed: records.length };
}
