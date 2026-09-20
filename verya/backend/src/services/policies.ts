import { listLedger } from "../repositories/ledger";
import { createPolicySuggestion, decidePolicySuggestion, listPolicySuggestions, type PolicySuggestion } from "../repositories/policies";

export async function detectPolicySuggestions(orgId: string): Promise<PolicySuggestion[]> {
  const entries = await listLedger({ orgId, limit: 500 });
  const failures = new Map<string, { model: string; category: string; count: number; sessions: Set<string> }>();
  for (const entry of entries) {
    if (entry.eventType !== "task_execution" && entry.eventType !== "task_failed") continue;
    const detail = entry.detail as { taskCategory?: string; summary?: string };
    const summary = String(detail.summary ?? "").toLowerCase();
    if (!/flagged|failed|escalated/.test(summary) && entry.eventType !== "task_failed") continue;
    const model = entry.model ?? "unknown";
    const category = detail.taskCategory ?? "unknown";
    const key = `${model}::${category}`;
    const current = failures.get(key) ?? { model, category, count: 0, sessions: new Set<string>() };
    current.count += 1;
    if (entry.sessionId) current.sessions.add(entry.sessionId);
    failures.set(key, current);
  }
  const existing = await listPolicySuggestions(orgId);
  const suggestions: PolicySuggestion[] = [];
  for (const failure of failures.values()) {
    if (failure.count < 3 || failure.sessions.size < 2) continue;
    const rule = `Require human review for ${failure.category} tasks routed to ${failure.model}.`;
    if (existing.some((item) => item.rule === rule && item.status !== "rejected")) continue;
    suggestions.push(await createPolicySuggestion({
      orgId,
      version: 0,
      rule,
      rationale: `${failure.model} produced ${failure.count} flagged, failed, or escalated ${failure.category} result(s) across ${failure.sessions.size} workflow(s).`,
      evidence: { model: failure.model, taskCategory: failure.category, failures: failure.count, workflows: failure.sessions.size },
      status: "pending",
    }));
  }
  return suggestions;
}

export async function decidePolicy(orgId: string, id: number, status: "approved" | "rejected") {
  return decidePolicySuggestion(orgId, id, status);
}

export { listPolicySuggestions };