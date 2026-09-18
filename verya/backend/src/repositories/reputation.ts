// Model reputation repository (F12) — living trust scores per model x task category.
// Continuous updates (not scheduled): every verification/feedback event nudges the score.
import { query, requireDb, isDbConfigured } from "../db/pool";
import * as dev from "../db/devstore";

export type ReputationEntry = {
  orgId: string;
  model: string;
  taskCategory: string;
  trustScore: number;
  samples: number;
  trend: "up" | "flat" | "down";
  lastUpdated: string;
};

const OUTCOME_TARGET: Record<ReputationEntry["trend"] | string, number> = {
  accepted: 100,
  verified: 80,
  edited: 60,
  escalated: 40,
  flagged: 20,
  rejected: 0,
};

export async function updateReputation(input: {
  orgId: string;
  model: string;
  taskCategory: string;
  outcome: "accepted" | "edited" | "rejected" | "escalated" | "verified" | "flagged";
}): Promise<ReputationEntry> {
  if (!isDbConfigured()) return dev.devUpdateReputation(input);
  requireDb();
  const alpha = 0.15;
  const target = OUTCOME_TARGET[input.outcome] ?? 50;
  const rows = await query<{ trust_score: number; samples: number }>(
    `SELECT trust_score, samples FROM model_reputation
      WHERE org_id = $1 AND model = $2 AND task_category = $3`,
    [input.orgId, input.model, input.taskCategory]
  );
  let score = 50;
  let samples = 0;
  if (rows[0]) {
    score = rows[0].trust_score;
    samples = rows[0].samples;
  }
  const next = Math.round((score + alpha * (target - score)) * 10) / 10;
  const trend = next > score ? "up" : next < score ? "down" : "flat";
  await query(
    `INSERT INTO model_reputation (org_id, model, task_category, trust_score, samples, trend, last_updated)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (org_id, model, task_category)
     DO UPDATE SET trust_score = $4, samples = $5, trend = $6, last_updated = now()`,
    [input.orgId, input.model, input.taskCategory, next, samples + 1, trend]
  );
  return {
    orgId: input.orgId,
    model: input.model,
    taskCategory: input.taskCategory,
    trustScore: next,
    samples: samples + 1,
    trend,
    lastUpdated: new Date().toISOString(),
  };
}

export async function getReputation(orgId: string): Promise<ReputationEntry[]> {
  if (!isDbConfigured()) return dev.devGetReputation(orgId);
  requireDb();
  const rows = await query<Record<string, unknown>>(
    `SELECT org_id, model, task_category, trust_score, samples, trend, last_updated
       FROM model_reputation WHERE org_id = $1
      ORDER BY trust_score DESC`,
    [orgId]
  );
  return rows.map((r) => ({
    orgId: String(r.org_id),
    model: String(r.model),
    taskCategory: String(r.task_category),
    trustScore: Number(r.trust_score),
    samples: Number(r.samples),
    trend: String(r.trend) as ReputationEntry["trend"],
    lastUpdated: new Date(r.last_updated as string).toISOString(),
  }));
}
