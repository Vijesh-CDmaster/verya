// Pipeline service — orchestrates the gated pipeline on Postgres-backed sessions.
// Preserves the exact gate semantics from the monolith: suitability → flaws → stack →
// tasks → algorithms → models → execution → review, with F8 tie-breaks enforced.
import type { GateAction, PipelineSession } from "../schemas/pipeline";
import { modelCostOf } from "../schemas/pipeline";
import { processGate, applyGateAction } from "../lib/pipeline/gates";
import { geminiAdapters, type StageAdapters } from "../lib/ai/provider";
import { createSession as repoCreate, saveSession as repoSave, getSession as repoGet, listSessions as repoList } from "../repositories/sessions";
import { recordToLedger } from "./ledger";
import { recordMemory } from "./memory";
import { updateFromOutcome } from "./reputation";
import { enqueueExecution } from "../jobs/queues";
import { describeScan, scanInjection } from "../lib/security/injection";

export async function startPipeline(input: {
  orgId?: string;
  input: string;
  statedStack: string;
  policy: "lowest_cost" | "highest_accuracy" | "balanced" | "org_approved";
}): Promise<PipelineSession> {
  const session: PipelineSession = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    input: input.input,
    statedStack: input.statedStack,
    policy: input.policy,
    uploads: [],
    gate: "suitability",
    gateStatus: "running", // route responds immediately; the gate runs in background
    suitability: null,
    suggestedWorkflow: null,
    workflow: null,
    flawReport: null,
    flawConsensus: null,
    flawResolutions: [],
    stackGate: null,
    algorithms: null,
    routing: null,
    executions: [],
    humanFeedback: { ratings: {} },
  };
  // F40: intake text is untrusted input. Scan it once, keep the findings on the
  // session as audit evidence, and ledger it. The original text is preserved (the
  // user sees exactly what they submitted); hardening happens at the prompt boundary.
  const scan = scanInjection(session.input);
  session.inputSecurity = {
    risk: scan.risk,
    findings: scan.findings,
    neutralized: scan.neutralized,
    scannedAt: new Date().toISOString(),
  };
  const orgId = input.orgId || process.env.VERYA_ORG_ID || "default-org";
  await repoCreate(orgId, session);
  await recordToLedger({
    orgId,
    sessionId: session.id,
    gate: "intake",
    eventType: scan.findings.length > 0 ? "injection_scan_flagged" : "injection_scan_clean",
    actor: "system",
    detail: {
      summary: describeScan(scan),
      risk: scan.risk,
      findings: scan.findings.map((f) => ({ rule: f.rule, category: f.category, severity: f.severity })),
    },
  });
  kickGateProcessing(orgId, session.id);
  return session;
}

/** Sessions whose gate AI is currently processing in this process. */
const inFlight = new Set<string>();

/**
 * Kick off AI processing for the current gate WITHOUT blocking the HTTP response.
 * The UI polls GET /pipeline/:id every 2.5s while gateStatus === "running". On
 * failure the session is marked "failed" so the UI shows an error instead of
 * spinning forever. In-process guard prevents duplicate concurrent processing.
 */
function kickGateProcessing(orgId: string, sessionId: string): void {
  const key = `${orgId}:${sessionId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  void (async () => {
    try {
      // Gates can auto-advance (e.g. algorithms with no ties → models): keep
      // processing while the session lands on an AI gate marked "running".
      for (let hop = 0; hop < 5; hop++) {
        const fresh = await repoGet(orgId, sessionId);
        if (!fresh) return;
        const processed = await processGate(fresh, geminiAdapters as StageAdapters, orgId);
        processed.updatedAt = new Date().toISOString();
        await repoSave(orgId, processed);
        if (!(processed.gateStatus === "running" && processed.gate !== "execution")) break;
      }
    } catch (err) {
      console.error(`[pipeline] gate processing failed for ${sessionId}:`, err);
      try {
        const fresh = await repoGet(orgId, sessionId);
        if (fresh) {
          fresh.gateStatus = "failed";
          fresh.error =
            err instanceof Error
              ? err.message
              : "The analysis could not be completed. Check the backend configuration and try again.";
          fresh.updatedAt = new Date().toISOString();
          await repoSave(orgId, fresh);
        }
      } catch {
        /* best-effort failure marker */
      }
    } finally {
      inFlight.delete(key);
    }
  })();
}

export async function getPipeline(orgIdOrId: string, maybeId?: string): Promise<PipelineSession | null> {
  const orgId = maybeId ? orgIdOrId : process.env.VERYA_ORG_ID || "default-org";
  return repoGet(orgId, maybeId ?? orgIdOrId);
}

export async function listPipelines(orgId: string, limit = 50) {
  return repoList(orgId, limit);
}

export async function actOnPipeline(orgId: string, id: string, action: GateAction): Promise<PipelineSession> {
  const session = await repoGet(orgId, id);
  if (!session) throw Object.assign(new Error("Session not found"), { statusCode: 404 });

  const updated = await applyGateAction(session, action, geminiAdapters as StageAdapters, orgId);
  updated.updatedAt = new Date().toISOString();
  await repoSave(orgId, updated);

  // AI gates set gateStatus="running" and expect background processing (the UI
  // polls until the gate flips to awaiting_user/failed).
  if (updated.gateStatus === "running") kickGateProcessing(orgId, updated.id);

  // Feedback (F16): every accept/reject/rate/edit feeds memory + reputation + ledger.
  if (action.action === "feedback") {
    const exec = updated.executions.find((e) => e.taskId === action.taskId);
    if (exec) {
      const task = updated.workflow?.tasks.find((t) => t.id === action.taskId);
      const edited = typeof action.editedOutput === "string" && action.editedOutput.trim().length > 0;
      const outcome: "accepted" | "edited" | "rejected" = !action.accepted
        ? "rejected"
        : edited || (action.rating != null && action.rating < 4)
          ? "edited"
          : "accepted";

      const editCheck = edited && task
        ? await geminiAdapters.verifyRulesOnly({ task, output: action.editedOutput! })
        : null;

      if (edited) {
        exec.output = action.editedOutput!; // human edit becomes the canonical output
        exec.verification.issues = [
          ...exec.verification.issues,
          "Output edited by human after verification.",
        ].slice(0, 12);
        exec.editQuality = {
          passed: editCheck?.passed ?? false,
          improved: Boolean(editCheck && editCheck.issues.length <= exec.verification.issues.length),
          issues: editCheck?.issues ?? ["Edited output could not be checked."],
          checkedBy: editCheck?.checkedBy ?? "unavailable",
        };
      }
      if (action.rating != null) exec.humanRating = action.rating;
      if (action.note) exec.humanNote = action.note;

      await recordMemory({
        orgId,
        sessionId: updated.id,
        taskCategory: task?.category ?? "other",
        model: exec.model,
        outcome,
        title: task?.title ?? exec.taskId,
        content: exec.output.slice(0, 2000),
        meta: { rating: action.rating ?? null, note: action.note ?? null, edited },
      });
      await updateFromOutcome({
        orgId,
        model: exec.model,
        taskCategory: task?.category ?? "other",
        outcome,
        latencyMs: exec.latencyMs,
        costUnits: modelCostOf(exec.model),
      });
      await recordToLedger({
      orgId,
        sessionId: updated.id,
        gate: "review",
        eventType: "human_feedback",
        actor: "human",
        taskId: action.taskId,
        model: exec.model,
        detail: {
          summary: `${task?.title ?? action.taskId}: ${outcome}${action.rating != null ? ` (rated ${action.rating}/5)` : ""}`,
          rating: action.rating ?? null,
          note: action.note ?? null,
          edited,
          editQuality: exec.editQuality,
        },
        humanEdit: edited ? { editedOutputChars: action.editedOutput!.length } : undefined,
      });
    }
  }

  // Execution is long-running: dispatch to BullMQ when Redis is configured (F43).
  const needsExecution = updated.gate === "execution" && updated.gateStatus === "pending";
  if (needsExecution && process.env.REDIS_URL) {
    await enqueueExecution({ sessionId: updated.id, orgId });
    await recordToLedger({
      orgId,
      sessionId: updated.id,
      gate: "execution",
      eventType: "execution_queued",
      detail: { summary: "Execution dispatched to background worker queue" },
    });
  }
  return updated;
}
