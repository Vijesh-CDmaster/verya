// Reputation service (F12) — continuous trust scoring per model x task category.
import {
  updateReputation as repoUpdate,
  getReputation as repoGet,
  getReputationFor as repoGetFor,
  type ReputationEntry,
} from "../repositories/reputation";
import { getSkillMap } from "./memory";

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
