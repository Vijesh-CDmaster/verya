// Verya — AI Reputation System (F12)
// Living trust scores per model × task category; continuous updates from feedback.
// File-backed now; Neon Postgres in production.

import { promises as fs } from "fs";
import path from "path";
import type { SkillEntry } from "./memory";

const DATA_DIR = path.join(process.cwd(), ".data", "reputation");

export type ReputationEntry = {
  model: string;
  taskCategory: string;
  trustScore: number; // 0-100, moves continuously
  samples: number;
  lastUpdated: string;
  trend: "up" | "flat" | "down";
};

type ReputationFile = { entries: ReputationEntry[] };

async function readAll(): Promise<ReputationFile> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "reputation.json"), "utf8");
    return JSON.parse(raw) as ReputationFile;
  } catch {
    return { entries: [] };
  }
}

async function writeAll(data: ReputationFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "reputation.json"), JSON.stringify(data, null, 2), "utf8");
}

/**
 * Update reputation from a single feedback/verification event (continuous, not scheduled).
 * alpha = learning rate; small so one event nudges but never flips a score.
 */
export async function updateReputation(input: {
  model: string;
  taskCategory: string;
  outcome: "accepted" | "edited" | "rejected" | "escalated" | "verified" | "flagged";
}): Promise<ReputationEntry> {
  const data = await readAll();
  const now = new Date().toISOString();
  let entry = data.entries.find(
    (e) => e.model === input.model && e.taskCategory === input.taskCategory
  );
  const alpha = 0.15;

  const outcomeDelta: Record<typeof input.outcome, number> = {
    accepted: 1,
    verified: 0.6,
    edited: 0.2,
    escalated: -0.2,
    rejected: -1,
    flagged: -0.8,
  };

  if (!entry) {
    // Neutral start (50) pulled one step toward the outcome signal.
    entry = {
      model: input.model,
      taskCategory: input.taskCategory,
      trustScore: Math.round((50 + outcomeDelta[input.outcome] * 10 * alpha * 10) * 10) / 10,
      samples: 1,
      lastUpdated: now,
      trend: outcomeDelta[input.outcome] > 0 ? "up" : outcomeDelta[input.outcome] < 0 ? "down" : "flat",
    };
    data.entries.push(entry);
  } else {
    const prev = entry.trustScore;
    const target = 50 + outcomeDelta[input.outcome] * 50;
    entry.trustScore = Math.round((prev + alpha * (target - prev)) * 10) / 10;
    entry.samples += 1;
    entry.trend = entry.trustScore > prev ? "up" : entry.trustScore < prev ? "down" : "flat";
    entry.lastUpdated = now;
  }
  await writeAll(data);
  return entry;
}

/** Leaderboard for the dashboard (F22): global org view over per-category scores. */
export async function getLeaderboard(orgId?: string): Promise<ReputationEntry[]> {
  const data = await readAll();
  // orgId currently unused (single-tenant file), reserved for multi-tenant scoping.
  void orgId;
  return [...data.entries].sort((a, b) => b.trustScore - a.trustScore);
}

/** Merge helper for dashboard: combine reputation + org skill map. */
export function mergeSkillAndReputation(skill: SkillEntry[], reputation: ReputationEntry[]) {
  const map = new Map<string, { trustScore: number; samples: number }>();
  for (const e of reputation) map.set(`${e.model}::${e.taskCategory}`, { trustScore: e.trustScore, samples: e.samples });
  return skill.map((s) => {
    const rep = map.get(`${s.model}::${s.taskCategory}`);
    return {
      ...s,
      reputationScore: rep?.trustScore ?? s.trustScore,
      samples: Math.max(s.samples, rep?.samples ?? s.samples),
    };
  });
}
