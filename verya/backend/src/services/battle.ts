// Battle service (F22 AI Battle Mode + F15 counterfactual comparison seed).
// Runs the same task on two models and records the human's verdict; the winner
// feeds reputation so routing learns from direct comparisons, not just feedback.
import { modelCostOf, type ExecutionResult, type ModelId, type PipelineSession, type Task } from "../schemas/pipeline";
import { geminiAdapters } from "../lib/ai/provider";
import { stackTextOf } from "../lib/pipeline/gates";
import { recordToLedger } from "./ledger";
import { updateFromOutcome } from "./reputation";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

export async function runBattle(input: {
  session: PipelineSession;
  taskId: string;
  modelA: ModelId;
  modelB: ModelId;
}): Promise<ExecutionResult | null> {
  const { session, taskId, modelA, modelB } = input;
  const task = session.workflow?.tasks.find((t) => t.id === taskId);
  const algo = session.algorithms?.tasks.find((a) => a.taskId === taskId);
  if (!task || !session.workflow) return null;

  const algorithm = algo?.selected ?? "direct implementation";
  const stack = stackTextOf(session);
  const started = Date.now();
  void started;

  const [resA, resB] = await Promise.all([
    geminiAdapters.executeTask({ task, algorithm, stack, workflow: session.workflow, model: modelA }),
    geminiAdapters.executeTask({ task, algorithm, stack, workflow: session.workflow, model: modelB }),
  ]);

  const exec = session.executions.find((e) => e.taskId === taskId);
  const result: ExecutionResult = exec ?? {
    taskId,
    model: modelA,
    output: "",
    verification: { method: "rules", passed: true, issues: [], checkedBy: "battle" },
    status: "pending",
    confidence: 0.5,
    latencyMs: 0,
    tokens: { input: 0, output: 0 },
  };

  result.battleA = { model: modelA, output: resA.output, latencyMs: resA.latencyMs, tokens: resA.tokens };
  result.battleB = { model: modelB, output: resB.output, latencyMs: resB.latencyMs, tokens: resB.tokens };
  result.battleWinner = undefined;
  if (!exec) session.executions.push(result);

  await recordToLedger({
    orgId: ORG_ID,
    sessionId: session.id,
    gate: "review",
    eventType: "battle_run",
    taskId,
    model: `${modelA} vs ${modelB}`,
    detail: {
      summary: `AI Battle: ${task.title} — ${modelA} (${resA.latencyMs}ms) vs ${modelB} (${resB.latencyMs}ms)`,
      modelA,
      modelB,
      latencyA: resA.latencyMs,
      latencyB: resB.latencyMs,
      tokensA: resA.tokens,
      tokensB: resB.tokens,
    },
  });
  return result;
}

export async function pickBattleWinner(input: {
  session: PipelineSession;
  taskId: string;
  winner: "a" | "b";
}): Promise<void> {
  const { session, taskId, winner } = input;
  const exec = session.executions.find((e) => e.taskId === taskId);
  const task: Task | undefined = session.workflow?.tasks.find((t) => t.id === taskId);
  if (!exec?.battleA || !exec.battleB) return;

  exec.battleWinner = winner;
  const winnerModel = winner === "a" ? exec.battleA.model : exec.battleB.model;
  const loserModel = winner === "a" ? exec.battleB.model : exec.battleA.model;
  const category = task?.category ?? "other";

  // Winner earns accepted, loser earns rejected — direct comparative signal.
  await Promise.all([
    updateFromOutcome({ orgId: ORG_ID, model: winnerModel, taskCategory: category, outcome: "accepted" }).catch(() => undefined),
    updateFromOutcome({ orgId: ORG_ID, model: loserModel, taskCategory: category, outcome: "rejected" }).catch(() => undefined),
  ]);

  await recordToLedger({
    orgId: ORG_ID,
    sessionId: session.id,
    gate: "review",
    eventType: "battle_pick",
    actor: "human",
    taskId,
    model: winnerModel,
    detail: {
      summary: `Battle verdict for ${task?.title ?? taskId}: ${winnerModel} wins over ${loserModel}`,
      winner: winnerModel,
      loser: loserModel,
    },
  });
}

export function battleCostOf(exec: ExecutionResult): number {
  if (!exec.battleA || !exec.battleB) return 0;
  return modelCostOf(exec.battleA.model) + modelCostOf(exec.battleB.model);
}
