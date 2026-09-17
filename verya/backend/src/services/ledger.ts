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

/** Aggregate cost/latency/token analytics per model (F21). */
export async function ledgerAnalytics(orgId: string) {
  const entries = await repoList({ orgId, limit: 500 });
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
  };
}
