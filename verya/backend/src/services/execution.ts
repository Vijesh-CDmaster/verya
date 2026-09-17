// Execution service — runs a session's tasks inline (HTTP path when Redis is absent).
import { getSession, saveSession } from "../repositories/sessions";
import { geminiAdapters } from "../lib/ai/provider";
import { stackTextOf } from "../lib/pipeline/gates";
import { recordToLedger } from "./ledger";
import type { ExecutionResult, PipelineSession } from "../schemas/pipeline";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";
const ESCALATION_FLOOR = Number(process.env.VERYA_ESCALATION_FLOOR || 0.55);

export async function runExecution(sessionId: string): Promise<{ session: PipelineSession }> {
  const session = await getSession(ORG_ID, sessionId);
  if (!session) throw Object.assign(new Error("Session not found"), { statusCode: 404 });
  if (!session.routing || !session.workflow || !session.algorithms) {
    throw Object.assign(new Error("Pipeline not ready for execution"), { statusCode: 409 });
  }

  const stackText = stackTextOf(session);
  const done = new Set(session.executions.map((e) => e.taskId));
  const ordered: typeof session.workflow.tasks = [];
  const all = [...session.workflow.tasks];
  let guard = 0;
  while (ordered.length < all.length && guard++ < all.length * 2) {
    for (const t of all) {
      if (done.has(t.id)) continue;
      if ((t.dependsOn ?? []).every((d) => done.has(d))) {
        ordered.push(t);
        done.add(t.id);
      }
    }
  }

  session.gate = "execution";
  session.gateStatus = "running";
  await saveSession(ORG_ID, session);

  for (const task of ordered) {
    if (session.executions.some((r) => r.taskId === task.id)) continue;
    const route = session.routing.routes.find((r) => r.taskId === task.id);
    const algo = session.algorithms.tasks.find((a) => a.taskId === task.id);
    const model = route?.selectedModel ?? "openai/gpt-oss-20b";
    const algorithm = algo?.selected ?? "direct implementation";
    const started = Date.now();
    try {
      const exec = await geminiAdapters.executeTask({ task, algorithm, stack: stackText, workflow: session.workflow, model });
      const needsSecondModel = task.risk !== "low";
      const verification = needsSecondModel
        ? await geminiAdapters.verifyOutput({ task, algorithm, output: exec.output, model })
        : await geminiAdapters.verifyRulesOnly({ task, output: exec.output });
      const confidence = verification.passed ? 0.82 : 0.4;
      const status: ExecutionResult["status"] = verification.passed
        ? confidence >= ESCALATION_FLOOR ? "verified" : "escalated"
        : "flagged";
      const result: ExecutionResult = {
        taskId: task.id,
        model,
        output: exec.output,
        verification: {
          method: needsSecondModel ? "second_model" : "rules",
          passed: verification.passed,
          issues: verification.issues,
          checkedBy: verification.checkedBy || "rules",
        },
        status,
        confidence,
        latencyMs: exec.latencyMs,
        tokens: exec.tokens,
      };
      session.executions.push(result);
      await recordToLedger({
        orgId: ORG_ID,
        sessionId,
        gate: "execution",
        eventType: "task_execution",
        taskId: task.id,
        model,
        detail: { summary: `${task.title} executed by ${exec.servedBy ?? model} — ${status}`, latencyMs: exec.latencyMs, tokens: exec.tokens, servedBy: exec.servedBy ?? model },
        verification: { passed: verification.passed, issues: verification.issues },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Task failed";
      const failed: ExecutionResult = {
        taskId: task.id,
        model,
        output: "",
        verification: { method: "rules", passed: false, issues: [message], checkedBy: "rules" },
        status: "failed",
        confidence: 0,
        latencyMs: Date.now() - started,
        tokens: { input: 0, output: 0 },
      };
      session.executions.push(failed);
      await recordToLedger({
        orgId: ORG_ID,
        sessionId,
        gate: "execution",
        eventType: "task_failed",
        taskId: task.id,
        model,
        detail: { summary: `${task.title} failed: ${message}` },
        verification: { passed: false, issues: [message] },
      });
    }
    await saveSession(ORG_ID, session);
  }

  session.gate = "review";
  session.gateStatus = "awaiting_user";
  await saveSession(ORG_ID, session);
  return { session };
}
