// Execution service — runs a session's tasks inline (HTTP path when Redis is absent).
import { getSession, saveSession } from "../repositories/sessions";
import { geminiAdapters } from "../lib/ai/provider";
import { stackTextOf } from "../lib/pipeline/gates";
import { recordToLedger } from "./ledger";
import { checkExternalReferences } from "../lib/verification/external";
import { escalationFloorFor, selfAuditThreshold, verificationDepthFor } from "../lib/thresholds";
import { updateFromOutcome } from "./reputation";
import { alternateModelOf, modelCostOf } from "../schemas/pipeline";
import { codeArtifactOf, type ExecutionResult, type PipelineSession } from "../schemas/pipeline";
import { forecastTaskFailure } from "./forecast";
import { initialTrustBudget, trustCostFor } from "../lib/trust-budget";
import { certificateFor } from "../lib/certificates";


/** Sessions whose execution loop is currently running in this process. */
const executing = new Set<string>();

/**
 * Kick off execution WITHOUT blocking the HTTP response — the route returns the
 * session with gateStatus="running" and the UI polls until review is ready.
 * Prevents double-starts from repeated clicks (the loop itself also skips
 * already-executed tasks).
 */
export async function startExecution(orgId: string, sessionId: string): Promise<{ session: PipelineSession }> {
  const session = await getSession(orgId, sessionId);
  if (!session) throw Object.assign(new Error("Session not found"), { statusCode: 404 });
  if (!session.routing || !session.workflow || !session.algorithms) {
    throw Object.assign(new Error("Pipeline not ready for execution"), { statusCode: 409 });
  }
  session.gate = "execution";
  session.gateStatus = "running";
  session.trustBudget ??= { initial: initialTrustBudget(), remaining: initialTrustBudget(), consumed: 0, status: "active" };
  await saveSession(orgId, session);

  // With Redis configured, actOnPipeline already enqueued this session to BullMQ —
  // the worker owns the run; running inline here too would execute tasks twice.
  if (process.env.REDIS_URL) {
    return { session };
  }

  if (!executing.has(sessionId)) {
    executing.add(sessionId);
    void runExecution(orgId, sessionId)
      .catch(async (err) => {
        console.error(`[execution] failed for ${sessionId}:`, err);
        try {
          const s = await getSession(orgId, sessionId);
          if (s) {
            s.gateStatus = "failed";
            await saveSession(orgId, s);
          }
        } catch {
          /* best-effort failure marker */
        }
      })
      .finally(() => executing.delete(sessionId));
  }
  return { session };
}

export async function runExecution(orgId: string, sessionId: string): Promise<{ session: PipelineSession }> {
  const session = await getSession(orgId, sessionId);
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
  await saveSession(orgId, session);

  for (const task of ordered) {
    if (session.executions.some((r) => r.taskId === task.id)) continue;
    const budgetCost = trustCostFor(task.risk);
    if (!session.trustBudget || session.trustBudget.remaining < budgetCost) {
      session.trustBudget = { ...(session.trustBudget ?? { initial: initialTrustBudget(), remaining: 0, consumed: 0 }), status: "exhausted" };
      session.gateStatus = "awaiting_user";
      await recordToLedger({ orgId, sessionId, gate: "execution", eventType: "trust_budget_exhausted", actor: "system", detail: { summary: `Trust budget paused before ${task.title}`, required: budgetCost, budget: session.trustBudget } });
      await saveSession(orgId, session);
      return { session };
    }
    session.trustBudget.remaining -= budgetCost;
    session.trustBudget.consumed += budgetCost;
    await recordToLedger({ orgId, sessionId, gate: "execution", eventType: "trust_budget_consumed", actor: "system", taskId: task.id, detail: { summary: `${budgetCost} trust units consumed by ${task.title}`, risk: task.risk, remaining: session.trustBudget.remaining } });
    const route = session.routing.routes.find((r) => r.taskId === task.id);
    const algo = session.algorithms.tasks.find((a) => a.taskId === task.id);
    const model = route?.selectedModel ?? "openai/gpt-oss-20b";
    const algorithm = algo?.selected ?? "direct implementation";
    const started = Date.now();
    try {
      const challengerModel = task.risk === "high" ? alternateModelOf(model) : undefined;
      const failureForecast = await forecastTaskFailure({ orgId, model, taskCategory: task.category, risk: task.risk, injectionRisk: session.inputSecurity?.risk });
      const [exec, challenger] = await Promise.all([
        geminiAdapters.executeTask({ task, algorithm, stack: stackText, workflow: session.workflow, model }),
        challengerModel
          ? geminiAdapters.executeTask({ task, algorithm, stack: stackText, workflow: session.workflow, model: challengerModel })
          : Promise.resolve(undefined),
      ]);
      const verificationDepth = verificationDepthFor(task.risk);
      const needsSecondModel = verificationDepth === "second_model";
      const verification = needsSecondModel
        ? await geminiAdapters.verifyOutput({ task, algorithm, output: exec.output, model })
        : await geminiAdapters.verifyRulesOnly({ task, output: exec.output });
      // F14: high-risk outputs get a bounded, provider-independent adversarial pass.
      // This is additive to verification: an audit can escalate, but never silently
      // changes the existing verification verdict.
      const selfAudit = task.risk === "high"
        ? await geminiAdapters.selfAudit({ task, output: exec.output, executorModel: model })
        : undefined;

      // F13 third method: external-knowledge check (npm registry) for code-bearing outputs.
      const external = await checkExternalReferences(exec.output);
      if (!external.passed) {
        verification.passed = false;
        verification.issues = [
          ...verification.issues,
          ...external.unsupported.map((p) => `References non-existent npm package "${p}" (registry check).`),
        ].slice(0, 12);
        verification.checkedBy = `${verification.checkedBy} + npm_registry`;
      }

      // F11: per-risk escalation floor (env-tunable per department/workflow type).
      const floor = escalationFloorFor(task.risk);
      const confidence = verification.passed ? 0.82 : 0.4;
      const auditEscalated = selfAudit !== undefined && selfAudit.riskScore >= selfAuditThreshold();
      const status: ExecutionResult["status"] = auditEscalated
        ? "escalated"
        : verification.passed
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
        selfAudit,
        status,
        confidence,
        rationale: auditEscalated
          ? `Escalated because the adversarial audit risk ${(selfAudit?.riskScore ?? 0) * 100}% exceeded the configured threshold.`
          : verification.passed
            ? `Verification passed at the ${task.risk}-risk escalation floor (${floor}).`
            : `Flagged because verification found ${verification.issues.length} issue(s).`,
        alternatives: (route?.options ?? []).filter((option) => option.model !== model).map((option) => option.model).slice(0, 4),
        battleA: challenger ? { model, output: exec.output, latencyMs: exec.latencyMs, tokens: exec.tokens } : undefined,
        battleB: challenger && challengerModel ? { model: challengerModel, output: challenger.output, latencyMs: challenger.latencyMs, tokens: challenger.tokens } : undefined,
        failureForecast,
        latencyMs: exec.latencyMs,
        tokens: exec.tokens,
      };
      result.certificate = certificateFor(session, result);
      session.executions.push(result);

      // F12: reputation updates continuously from execution outcomes, not just feedback.
      const outcome: "verified" | "flagged" | "escalated" | "rejected" =
        status === "verified" ? "verified" : status === "flagged" ? "flagged" : status === "escalated" ? "escalated" : "rejected";
      await updateFromOutcome({ orgId, model, taskCategory: task.category, outcome }).catch(() => undefined);

      const costUnits = modelCostOf(model);
      await recordToLedger({
        orgId,
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
          costUnits,
          taskCategory: task.category,
          verificationDepth,
          battleAuto: Boolean(challenger),
          failureForecast,
          externalChecked: external.checked.length,
          externalUnsupported: external.unsupported,
          escalationFloor: floor,
          selfAudit: selfAudit
            ? { riskScore: selfAudit.riskScore, issues: selfAudit.issues, checks: selfAudit.checks, threshold: selfAuditThreshold() }
            : undefined,
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
        rationale: `Execution failed before verification: ${message}`,
        alternatives: (route?.options ?? []).filter((option) => option.model !== model).map((option) => option.model).slice(0, 4),
        latencyMs: Date.now() - started,
        tokens: { input: 0, output: 0 },
      };
      session.executions.push(failed);
      await updateFromOutcome({ orgId, model, taskCategory: task.category, outcome: "rejected" }).catch(() => undefined);
      await recordToLedger({
        orgId,
        sessionId,
        gate: "execution",
        eventType: "task_failed",
        taskId: task.id,
        model,
        detail: { summary: `${task.title} failed: ${message}`, latencyMs: Date.now() - started, taskCategory: task.category, costUnits: modelCostOf(model) },
        verification: { passed: false, issues: [message] },
      });
    }
    await saveSession(orgId, session);
  }

  session.gate = "review";
  session.gateStatus = "awaiting_user";
  await saveSession(orgId, session);
  return { session };
}
