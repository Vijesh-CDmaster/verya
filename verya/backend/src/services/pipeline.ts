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

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

export function defaultOrg(): string {
  return ORG_ID;
}

export async function startPipeline(input: {
  input: string;
  statedStack: string;
  policy: "lowest_cost" | "highest_accuracy" | "balanced";
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
    gateStatus: "pending",
    suitability: null,
    suggestedWorkflow: null,
    workflow: null,
    flawReport: null,
    flawResolutions: [],
    stackGate: null,
    algorithms: null,
    routing: null,
    executions: [],
    humanFeedback: { ratings: {} },
  };
  const processed = await processGate(session, geminiAdapters as StageAdapters);
  await repoCreate(ORG_ID, processed);
  await repoSave(ORG_ID, processed);
  return processed;
}

export async function getPipeline(id: string): Promise<PipelineSession | null> {
  return repoGet(ORG_ID, id);
}

export async function listPipelines(limit = 50) {
  return repoList(ORG_ID, limit);
}

export async function actOnPipeline(id: string, action: GateAction): Promise<PipelineSession> {
  const session = await repoGet(ORG_ID, id);
  if (!session) throw Object.assign(new Error("Session not found"), { statusCode: 404 });

  const updated = await applyGateAction(session, action, geminiAdapters as StageAdapters);
  updated.updatedAt = new Date().toISOString();
  await repoSave(ORG_ID, updated);

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

      if (edited) {
        exec.output = action.editedOutput!; // human edit becomes the canonical output
        exec.verification.issues = [
          ...exec.verification.issues,
          "Output edited by human after verification.",
        ].slice(0, 12);
      }
      if (action.rating != null) exec.humanRating = action.rating;
      if (action.note) exec.humanNote = action.note;

      await recordMemory({
        orgId: ORG_ID,
        sessionId: updated.id,
        taskCategory: task?.category ?? "other",
        model: exec.model,
        outcome,
        title: task?.title ?? exec.taskId,
        content: exec.output.slice(0, 2000),
        meta: { rating: action.rating ?? null, note: action.note ?? null, edited },
      });
      await updateFromOutcome({
        orgId: ORG_ID,
        model: exec.model,
        taskCategory: task?.category ?? "other",
        outcome,
        latencyMs: exec.latencyMs,
        costUnits: modelCostOf(exec.model),
      });
      await recordToLedger({
        orgId: ORG_ID,
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
        },
        humanEdit: edited ? { editedOutputChars: action.editedOutput!.length } : undefined,
      });
    }
  }

  // Execution is long-running: dispatch to BullMQ when Redis is configured (F43).
  const needsExecution = updated.gate === "execution" && updated.gateStatus === "pending";
  if (needsExecution && process.env.REDIS_URL) {
    await enqueueExecution({ sessionId: updated.id, orgId: ORG_ID });
    await recordToLedger({
      orgId: ORG_ID,
      sessionId: updated.id,
      gate: "execution",
      eventType: "execution_queued",
      detail: { summary: "Execution dispatched to background worker queue" },
    });
  }
  return updated;
}
