// Reputation service (F12) — continuous trust scoring per model x task category.
import {
  updateReputation as repoUpdate,
  getReputation as repoGet,
  getReputationFor as repoGetFor,
  type ReputationEntry,
} from "../repositories/reputation";
import { getSkillMap } from "./memory";
import { MODEL_POOL } from "../schemas/pipeline";

export async function updateFromOutcome(input: {
  orgId: string;
  model: string;
  taskCategory: string;
  outcome: "accepted" | "edited" | "rejected" | "escalated" | "verified" | "flagged";
  latencyMs?: number;
  costUnits?: number;
}): Promise<ReputationEntry> {
  return repoUpdate(input);
}

export async function leaderboard(orgId: string): Promise<ReputationEntry[]> {
  return repoGet(orgId);
}

export async function cheapestTrustedModels(orgId: string) {
  const threshold = Number(process.env.VERYA_TRUST_BAR || 70);
  const minSamples = Number(process.env.VERYA_TRUST_BAR_MIN_SAMPLES || 1);
  const entries = await repoGet(orgId);
  const categories = [...new Set(entries.map((entry) => entry.taskCategory))];
  return {
    trustBar: threshold,
    minSamples,
    recommendations: categories.map((taskCategory) => {
      const eligible = entries
        .filter((entry) => entry.taskCategory === taskCategory && entry.trustScore >= threshold && entry.samples >= minSamples)
        .map((entry) => ({ entry, pool: MODEL_POOL.find((model) => model.id === entry.model) }))
        .filter((candidate): candidate is { entry: ReputationEntry; pool: (typeof MODEL_POOL)[number] } => Boolean(candidate.pool))
        .sort((a, b) => a.pool.costPerTask - b.pool.costPerTask || b.entry.trustScore - a.entry.trustScore);
      const winner = eligible[0];
      return {
        taskCategory,
        model: winner?.entry.model ?? null,
        costUnits: winner?.pool.costPerTask ?? null,
        trustScore: winner?.entry.trustScore ?? null,
        samples: winner?.entry.samples ?? 0,
        reason: winner
          ? `Lowest-cost model at or above the ${threshold} trust bar.`
          : `No model has reached the ${threshold} trust bar with ${minSamples} sample(s).`,
      };
    }),
  };
}

/** Inline badge lookup: trust for one model × category (F22). */
export async function badgeFor(orgId: string, model: string, taskCategory: string) {
  return repoGetFor(orgId, model, taskCategory);
}

/** Skill-map heatmap merged with reputation scores (F22 dashboard). */
export async function skillHeatmap(orgId: string) {
  const [rep, skill] = await Promise.all([repoGet(orgId), getSkillMap(orgId)]);
  const rows = new Map<string, { model: string; taskCategory: string; trustScore: number; samples: number }>();
  for (const s of skill) {
    rows.set(`${s.model}::${s.taskCategory}`, { ...s });
  }
  for (const r of rep) {
    const key = `${r.model}::${r.taskCategory}`;
    const existing = rows.get(key);
    rows.set(key, {
      model: r.model,
      taskCategory: r.taskCategory,
      trustScore: existing ? Math.round(((existing.trustScore + r.trustScore) / 2) * 10) / 10 : r.trustScore,
      samples: Math.max(existing?.samples ?? 0, r.samples),
    });
  }
  return Array.from(rows.values()).sort((a, b) => b.trustScore - a.trustScore);
}
