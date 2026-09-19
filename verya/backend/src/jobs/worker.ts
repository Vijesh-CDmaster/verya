// BullMQ worker — consumes execution jobs, writes results + ledger entries.
// Run: npm run worker   (requires REDIS_URL; the API degrades to inline execution without it)
import "dotenv/config";
import { Worker } from "bullmq";
import { EXECUTION_QUEUE } from "./queues";
import { getSession, saveSession } from "../repositories/sessions";
import { geminiAdapters } from "../lib/ai/provider";
import { stackTextOf } from "../lib/pipeline/gates";
import { recordToLedger } from "../services/ledger";
import { checkExternalReferences } from "../lib/verification/external";
import { escalationFloorFor } from "../lib/thresholds";
import { updateFromOutcome } from "../services/reputation";
import { modelCostOf } from "../schemas/pipeline";
import { codeArtifactOf, type ExecutionResult, type PipelineSession } from "../schemas/pipeline";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

async function executeSession(sessionId: string): Promise<void> {
  const session: PipelineSession | null = await getSession(ORG_ID, sessionId);
  if (!session || !session.routing || !session.workflow || !session.algorithms) return;

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

      const external = await checkExternalReferences(exec.output);
      if (!external.passed) {
        verification.passed = false;
        verification.issues = [
          ...verification.issues,
          ...external.unsupported.map((p) => `References non-existent npm package "${p}" (registry check).`),
        ].slice(0, 12);
        verification.checkedBy = `${verification.checkedBy} + npm_registry`;
      }

      const floor = escalationFloorFor(task.risk);
      const confidence = verification.passed ? 0.82 : 0.4;
      const status: ExecutionResult["status"] = verification.passed
        ? confidence >= floor ? "verified" : "escalated"
        : "flagged";
      const result: ExecutionResult = {
        taskId: task.id,
        model,
        output: exec.output,
        code: codeArtifactOf(exec.output, task.title),
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

      const outcome: "verified" | "flagged" | "escalated" | "rejected" =
        status === "verified" ? "verified" : status === "flagged" ? "flagged" : status === "escalated" ? "escalated" : "rejected";
      await updateFromOutcome({ orgId: ORG_ID, model, taskCategory: task.category, outcome }).catch(() => undefined);

      await recordToLedger({
        orgId: ORG_ID,
        sessionId,
        gate: "execution",
        eventType: "task_execution",
        taskId: task.id,
        model,
        detail: {
          summary: `${task.title} executed by ${exec.servedBy ?? model} — ${status}`,
          latencyMs: exec.latencyMs,
          tokens: exec.tokens,
          servedBy: exec.servedBy ?? model,
          costUnits: modelCostOf(model),
          externalChecked: external.checked.length,
          externalUnsupported: external.unsupported,
          escalationFloor: floor,
        },
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
      await updateFromOutcome({ orgId: ORG_ID, model, taskCategory: task.category, outcome: "rejected" }).catch(() => undefined);
      await recordToLedger({
        orgId: ORG_ID,
        sessionId,
        gate: "execution",
        eventType: "task_failed",
        taskId: task.id,
        model,
        detail: { summary: `${task.title} failed: ${message}`, latencyMs: Date.now() - started },
        verification: { passed: false, issues: [message] },
      });
    }
    await saveSession(ORG_ID, session);
  }

  session.gate = "review";
  session.gateStatus = "awaiting_user";
  await saveSession(ORG_ID, session);
}

export function startWorker(): Worker {
  const worker = new Worker(
    EXECUTION_QUEUE,
    async (job) => {
      const { sessionId } = job.data as { sessionId: string; orgId: string };
      console.log(`[worker] executing session ${sessionId}`);
      await executeSession(sessionId);
      console.log(`[worker] finished session ${sessionId}`);
    },
    { connection: { url: process.env.REDIS_URL! }, concurrency: Number(process.env.WORKER_CONCURRENCY || 2) }
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });
  return worker;
}

if (require.main === module) {
  if (!process.env.REDIS_URL) {
    console.error("[worker] REDIS_URL is not set. The worker requires Redis. The API runs inline execution without it.");
    process.exit(1);
  }
  startWorker();
  console.log("[worker] execution worker running");
}
