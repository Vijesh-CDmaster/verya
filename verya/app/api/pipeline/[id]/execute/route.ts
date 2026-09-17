import { NextRequest } from "next/server";
import { getSession, saveSession } from "@/lib/store/sessions";
import { geminiAdapters } from "@/lib/pipeline/provider";
import { stackTextOf } from "@/lib/pipeline/gates";
import { rateLimit, clientKey } from "@/lib/middleware";
import { recordToLedger } from "@/lib/store/ledger";
import type { ExecutionResult, PipelineSession } from "@/lib/pipeline/types";
import { CHEAP_MODEL_ID } from "@/lib/pipeline/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

const ESCALATION_FLOOR = Number(process.env.VERYA_ESCALATION_FLOOR || 0.55);

function taskIdOfRoute(session: PipelineSession, i: number): string | null {
  return session.routing?.routes[i]?.taskId ?? null;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(`execute:${clientKey(req)}`, 5, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const sessionId =
    new URL(req.url).pathname.match(/pipeline\/([^/]+)\/execute/)?.[1] ?? null;
  if (!sessionId) return Response.json({ error: "Session id required" }, { status: 400 });

  const session = await getSession(sessionId, ORG_ID);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });
  if (!session.routing || !session.workflow || !session.algorithms) {
    return Response.json({ error: "Pipeline not ready for execution" }, { status: 409 });
  }

  const stackText = stackTextOf(session);
  const results: ExecutionResult[] = [];

  // Respect dependency order: simple topological pass over the confirmed tasks.
  const tasks = [...session.workflow.tasks];
  const ordered: typeof tasks = [];
  const done = new Set<string>(session.executions.map((e) => e.taskId));
  let guard = 0;
  while (ordered.length < tasks.length && guard++ < tasks.length * 2) {
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      if ((t.dependsOn ?? []).every((d: string) => done.has(d))) {
        ordered.push(t);
        done.add(t.id);
      }
    }
  }

  session.gate = "execution";
  session.gateStatus = "running";
  await saveSession(session, ORG_ID);

  try {
    for (const task of ordered) {
      if (results.some((r) => r.taskId === task.id)) continue;
      const route = session.routing.routes.find((r) => r.taskId === task.id);
      const algo = session.algorithms.tasks.find((a) => a.taskId === task.id);
      const model = route?.selectedModel ?? CHEAP_MODEL_ID;
      const algorithm = algo?.selected ?? "direct implementation";

      const started = Date.now();
      try {
        const exec = await geminiAdapters.executeTask({
          task,
          algorithm,
          stack: stackText,
          workflow: session.workflow,
          model,
        });
        // F13: verification depth scales with task risk — rules-only for low-risk
        // tasks (fast, cheap), rules + independent second model otherwise.
        const needsSecondModel = task.risk !== "low";
        const verification = needsSecondModel
          ? await geminiAdapters.verifyOutput({ task, algorithm, output: exec.output, model })
          : await geminiAdapters.verifyRulesOnly({ task, output: exec.output });

        const confidence = verification.passed ? 0.82 : 0.4;
        const status: ExecutionResult["status"] = verification.passed
          ? confidence >= ESCALATION_FLOOR
            ? "verified"
            : "escalated"
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
        results.push(result);
        session.executions.push(result);

        await recordToLedger({
          orgId: ORG_ID,
          sessionId,
          gate: "execution",
          eventType: "task_execution",
          taskId: task.id,
          model,
          detail: {
            summary: `${task.title} executed by ${model} — ${status}`,
            latencyMs: exec.latencyMs,
            tokens: exec.tokens,
          },
          verification: {
            passed: verification.passed,
            issues: verification.issues,
          },
        });

        await saveSession(session, ORG_ID);
      } catch (taskErr) {
        const message = taskErr instanceof Error ? taskErr.message : "Task failed";
        const failed: ExecutionResult = {
          taskId: task.id,
          model,
          output: "",
          verification: {
            method: "rules",
            passed: false,
            issues: [message],
            checkedBy: CHEAP_MODEL_ID,
          },
          status: "failed",
          confidence: 0,
          latencyMs: Date.now() - started,
          tokens: { input: 0, output: 0 },
        };
        results.push(failed);
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
        await saveSession(session, ORG_ID);
      }
    }

    session.gate = "review";
    session.gateStatus = "awaiting_user";
    await saveSession(session, ORG_ID);
    return Response.json({ session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Execution failed";
    session.gateStatus = "failed";
    await saveSession(session, ORG_ID);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    void taskIdOfRoute;
  }
}
