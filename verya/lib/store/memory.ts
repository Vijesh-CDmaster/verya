// Verya — Organization Memory Engine (F9)
// Stores every AI interaction + outcome for the org; builds the private skill map
// used by routing; strictly per-org isolated. File-backed now, Neon/pgvector later.

import { promises as fs } from "fs";
import path from "path";

export type MemoryRecord = {
  id: string;
  orgId: string;
  sessionId: string;
  taskCategory: string;
  taskTitle: string;
  model: string;
  algorithm: string;
  stack: string;
  outcome: "accepted" | "edited" | "rejected" | "escalated" | "verified" | "flagged";
  accepted: boolean | null;
  rating: number | null;
  note: string;
  verificationPassed: boolean | null;
  timestamp: string;
};

const DATA_DIR = path.join(process.cwd(), ".data", "memory");

type OrgMemoryFile = { records: MemoryRecord[] };

async function readOrg(orgId: string): Promise<OrgMemoryFile> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${orgId}.json`), "utf8");
    return JSON.parse(raw) as OrgMemoryFile;
  } catch {
    return { records: [] };
  }
}

async function writeOrg(orgId: string, data: OrgMemoryFile): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, `${orgId}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

export async function remember(input: Omit<MemoryRecord, "id" | "timestamp">): Promise<MemoryRecord> {
  const org = await readOrg(input.orgId);
  const record: MemoryRecord = {
    ...input,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
  org.records.push(record);
  await writeOrg(input.orgId, org);
  return record;
}

export type SkillEntry = {
  taskCategory: string;
  model: string;
  samples: number;
  acceptanceRate: number;
  avgRating: number;
  verificationPassRate: number;
  trustScore: number; // 0-100
};

/**
 * The org's private skill map (F9): per task-category × model trust profile.
 * Used by the router as "historical performance for similar tasks".
 */
export async function getSkillMap(orgId: string): Promise<SkillEntry[]> {
  const { records } = await readOrg(orgId);
  const groups = new Map<string, MemoryRecord[]>();
  for (const r of records) {
    const key = `${r.taskCategory}::${r.model}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const entries: SkillEntry[] = [];
  for (const [key, list] of groups) {
    const [taskCategory, model] = key.split("::");
    const n = list.length;
    const accepted = list.filter((r) => r.accepted === true).length;
    const rated = list.filter((r) => typeof r.rating === "number");
    const verified = list.filter((r) => r.verificationPassed === true).length;
    const avgRating =
      rated.length > 0 ? rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length : 0;
    const acceptanceRate = accepted / n;
    const verificationPassRate = verified / n;
    // Weighted trust: acceptance 40%, verification 40%, human rating 20% (1-5 → 0-1).
    const trustScore = Math.round(
      (acceptanceRate * 0.4 + verificationPassRate * 0.4 + (avgRating / 5) * 0.2) * 100
    );
    entries.push({
      taskCategory,
      model,
      samples: n,
      acceptanceRate,
      avgRating,
      verificationPassRate,
      trustScore,
    });
  }
  return entries.sort((a, b) => b.trustScore - a.trustScore);
}

/** Routing lookup: trust for a given task category, per model (defaults neutral). */
export async function getCategoryTrust(
  orgId: string,
  taskCategory: string
): Promise<Record<string, { trust: number; samples: number }>> {
  const skill = await getSkillMap(orgId);
  const out: Record<string, { trust: number; samples: number }> = {};
  for (const e of skill) {
    if (e.taskCategory === taskCategory) {
      out[e.model] = { trust: e.trustScore / 100, samples: e.samples };
    }
  }
  return out;
}

/** Full export / deletion support (F9 requirement). */
export async function exportOrgMemory(orgId: string): Promise<string> {
  const org = await readOrg(orgId);
  return JSON.stringify(org, null, 2);
}

export async function deleteOrgMemory(orgId: string): Promise<void> {
  try {
    await fs.rm(path.join(DATA_DIR, `${orgId}.json`));
  } catch {
    /* nothing to delete */
  }
}
