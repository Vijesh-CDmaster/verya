// Ledger service — business layer over the append-only ledger repository.
import {
  recordToLedger as repoRecord,
  listLedger as repoList,
  verifyChain as repoVerify,
  type LedgerInput,
  type LedgerEntry,
} from "../repositories/ledger";

export { type LedgerEntry } from "../repositories/ledger";

export async function recordToLedger(input: LedgerInput): Promise<LedgerEntry> {
  return repoRecord(input);
}

export async function listLedger(q: {
  orgId: string;
  sessionId?: string;
  model?: string;
  eventType?: string;
  gate?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<LedgerEntry[]> {
  return repoList(q);
}

export async function verifyLedger(orgId: string) {
  return repoVerify(orgId);
}

/** Aggregate cost/latency/token analytics per model (F21) + routing overhead (F44). */
export async function ledgerAnalytics(orgId: string) {
  const [entries, timings] = await Promise.all([
    repoList({ orgId, limit: 500 }),
    repoList({ orgId, eventType: "stage_timing", limit: 500 }),
  ]);
  const execs = entries.filter((e) => e.gate === "execution" && e.detail?.latencyMs != null);
  const byModel = new Map<string, { tasks: number; latencyMs: number; tokens: number }>();
  for (const e of execs) {
    const model = e.model ?? "unknown";
    const detail = e.detail as { latencyMs?: number; tokens?: { input: number; output: number } };
    const agg = byModel.get(model) ?? { tasks: 0, latencyMs: 0, tokens: 0 };
    agg.tasks += 1;
    agg.latencyMs += detail.latencyMs ?? 0;
    agg.tokens += (detail.tokens?.input ?? 0) + (detail.tokens?.output ?? 0);
    byModel.set(model, agg);
  }
  return {
    totalEvents: entries.length,
    executions: execs.length,
    byModel: Array.from(byModel.entries()).map(([model, v]) => ({
      model,
      tasks: v.tasks,
      avgLatencyMs: v.tasks ? Math.round(v.latencyMs / v.tasks) : 0,
      tokens: v.tokens,
    })),
    routingOverhead: aggregateStageTimings(timings),
  };
}

/**
 * F44: split the time Verya itself adds (workflow repair, tie-breaks, memory lookup,
 * DNA refresh, consensus merge) from time spent waiting on providers.
 */
export function aggregateStageTimings(entries: LedgerEntry[]) {
  const stages = entries.filter((e) => e.detail && (e.detail as { stageMs?: number }).stageMs != null);
  const byGateMap = new Map<string, { runs: number; stageMs: number; providerMs: number; overheadMs: number }>();
  let stageMs = 0;
  let providerMs = 0;
  let overheadMs = 0;
  for (const entry of stages) {
    const detail = entry.detail as { stageMs: number; providerMs?: number; overheadMs?: number };
    stageMs += detail.stageMs;
    providerMs += detail.providerMs ?? 0;
    overheadMs += detail.overheadMs ?? 0;
    const agg = byGateMap.get(entry.gate) ?? { runs: 0, stageMs: 0, providerMs: 0, overheadMs: 0 };
    agg.runs += 1;
    agg.stageMs += detail.stageMs;
    agg.providerMs += detail.providerMs ?? 0;
    agg.overheadMs += detail.overheadMs ?? 0;
    byGateMap.set(entry.gate, agg);
  }
  const avg = (total: number) => (stages.length ? Math.round(total / stages.length) : 0);
  return {
    stages: stages.length,
    avgStageMs: avg(stageMs),
    avgProviderMs: avg(providerMs),
    avgOverheadMs: avg(overheadMs),
    overheadShare: stageMs > 0 ? Number((overheadMs / stageMs).toFixed(3)) : 0,
    byGate: Array.from(byGateMap.entries()).map(([gate, v]) => ({
      gate,
      runs: v.runs,
      avgStageMs: Math.round(v.stageMs / v.runs),
      avgProviderMs: Math.round(v.providerMs / v.runs),
      avgOverheadMs: Math.round(v.overheadMs / v.runs),
    })),
  };
}
