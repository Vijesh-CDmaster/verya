// Verya — F44: system latency accounting.
//
// The Trust Ledger already records provider latency (token/latency per execution).
// This module measures the OTHER half: how long Verya's own stage work takes —
// workflow repair, tie-break evaluation, memory retrieval, task-DNA refresh, consensus
// merge — and how many provider calls the stage needed. One `stage_timing` ledger row
// per AI stage keeps the measurement durable, queryable, and auditable.
import { providerCallStats } from "./ai/provider";
import { recordToLedger } from "../services/ledger";

export type StageTiming = {
  gate: string;
  stageMs: number;
  providerMs: number;
  providerCalls: number;
  overheadMs: number;
};

/** Gates that actually call models — user-action gates are not worth a timing row. */
const TIMED_GATES = new Set(["suitability", "flaws", "stack", "algorithms", "models"]);

export function isTimedGate(gate: string): boolean {
  return TIMED_GATES.has(gate);
}

/**
 * Run one pipeline stage and record its timing breakdown to the ledger.
 * Timing failure never affects the stage result: the ledger write is best-effort.
 */
export async function timeStage<T>(
  gate: string,
  ctx: { orgId: string; sessionId?: string },
  fn: () => Promise<T>
): Promise<T> {
  if (!isTimedGate(gate)) return fn();

  const before = providerCallStats();
  const started = Date.now();
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    await recordTiming(gate, ctx, before, started, "failed");
    throw err;
  }
  await recordTiming(gate, ctx, before, started, "ok");
  return result;
}

function timingOf(
  gate: string,
  before: { count: number; totalMs: number },
  startedAt: number
): StageTiming {
  const after = providerCallStats();
  const stageMs = Date.now() - startedAt;
  const providerMs = Math.max(0, after.totalMs - before.totalMs);
  return {
    gate,
    stageMs,
    providerMs,
    providerCalls: Math.max(0, after.count - before.count),
    // Provider time can exceed wall clock when calls overlap (consensus fan-out), so
    // clamp instead of reporting a negative overhead.
    overheadMs: Math.max(0, stageMs - providerMs),
  };
}

async function recordTiming(
  gate: string,
  ctx: { orgId: string; sessionId?: string },
  before: { count: number; totalMs: number },
  startedAt: number,
  outcome: "ok" | "failed"
): Promise<void> {
  const timing = timingOf(gate, before, startedAt);
  try {
    await recordToLedger({
      orgId: ctx.orgId,
      sessionId: ctx.sessionId,
      gate,
      eventType: "stage_timing",
      actor: "system",
      detail: {
        summary: `${gate} stage: ${timing.stageMs}ms total, ${timing.providerMs}ms provider, ${timing.overheadMs}ms Verya overhead (${timing.providerCalls} provider call(s))`,
        ...timing,
        outcome,
      },
    });
  } catch {
    // Observability must never break the pipeline.
  }
}
