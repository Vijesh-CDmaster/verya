// Verya — file-backed development store (backend/.devstore/, git-ignored).
// ACTIVE ONLY WHEN DATABASE_URL IS UNSET — the "build now, connect later" mode.
// The same real application records (sessions, hash-chained ledger, org memory,
// reputation) are persisted to local JSON files with identical semantics, then
// wholly replaced by Neon Postgres the moment DATABASE_URL is set and
// `npm run migrate` runs. Nothing here fabricates data.
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import type { PipelineSession } from "../schemas/pipeline";
import type { LedgerInput, LedgerEntry, LedgerQuery } from "../repositories/ledger";
import type { MemoryInput, MemoryRow } from "../repositories/memory";
import type { ReputationEntry } from "../repositories/reputation";

const DIR = path.join(process.cwd(), ".devstore");
const FILES = {
  sessions: "sessions.json",
  ledger: "ledger.json",
  memory: "memory.json",
  reputation: "reputation.json",
  leads: "leads.json",
} as const;

let warned = false;
function warnOnce(): void {
  if (!warned) {
    warned = true;
    console.warn("[devstore] DATABASE_URL not set — persisting to backend/.devstore (dev mode).");
  }
}

// ---------- low-level JSON IO with per-file write locks ----------
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(file: string, data: T): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const target = path.join(DIR, file);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1), "utf8");
  await fs.rename(tmp, target);
}

const locks = new Map<string, Promise<unknown>>();
function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const next = (locks.get(file) ?? Promise.resolve()).then(fn, fn);
  locks.set(file, next.catch(() => {}));
  return next;
}

// ---------- sessions ----------
type StoredSession = {
  id: string;
  orgId: string;
  title: string;
  gate: string;
  gateStatus: string;
  createdAt: string;
  updatedAt: string;
  state: PipelineSession;
};

function titleOf(s: PipelineSession): string {
  return (s.workflow?.title ?? s.input.slice(0, 60) ?? "Untitled project").slice(0, 120);
}

export async function devCreateSession(orgId: string, session: PipelineSession): Promise<void> {
  warnOnce();
  await withLock(FILES.sessions, async () => {
    const rows = await readJson<StoredSession[]>(FILES.sessions, []);
    const now = new Date().toISOString();
    rows.push({
      id: session.id,
      orgId,
      title: titleOf(session),
      gate: session.gate,
      gateStatus: session.gateStatus,
      createdAt: now,
      updatedAt: now,
      state: session,
    });
    await writeJson(FILES.sessions, rows);
  });
}

export async function devSaveSession(orgId: string, session: PipelineSession): Promise<void> {
  await withLock(FILES.sessions, async () => {
    const rows = await readJson<StoredSession[]>(FILES.sessions, []);
    const row = rows.find((r) => r.id === session.id && r.orgId === orgId);
    if (!row) return; // create-first contract: saveSession only updates existing rows
    row.title = titleOf(session);
    row.gate = session.gate;
    row.gateStatus = session.gateStatus;
    row.state = session;
    row.updatedAt = new Date().toISOString();
    await writeJson(FILES.sessions, rows);
  });
}

export async function devGetSession(orgId: string, id: string): Promise<PipelineSession | null> {
  const rows = await readJson<StoredSession[]>(FILES.sessions, []);
  return rows.find((r) => r.id === id && r.orgId === orgId)?.state ?? null;
}

export async function devListSessions(
  orgId: string,
  limit = 50
): Promise<Array<Pick<PipelineSession, "id" | "gate" | "gateStatus"> & { title: string; updatedAt: string }>> {
  const rows = await readJson<StoredSession[]>(FILES.sessions, []);
  return rows
    .filter((r) => r.orgId === orgId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      gate: r.gate as PipelineSession["gate"],
      gateStatus: r.gateStatus as PipelineSession["gateStatus"],
      title: r.title,
      updatedAt: r.updatedAt,
    }));
}

// ---------- ledger (append-only, hash-chained) ----------
function canonicalLedger(input: LedgerInput, prevHash: string, ts: string): string {
  return JSON.stringify({
    orgId: input.orgId,
    sessionId: input.sessionId ?? null,
    gate: input.gate,
    eventType: input.eventType,
    actor: input.actor ?? "ai",
    model: input.model ?? null,
    taskId: input.taskId ?? null,
    detail: input.detail ?? {},
    verification: input.verification ?? null,
    humanEdit: input.humanEdit ?? null,
    createdAt: ts,
    prevHash,
  });
}

export async function devRecordLedger(input: LedgerInput): Promise<LedgerEntry> {
  warnOnce();
  return withLock(FILES.ledger, async () => {
    const rows = await readJson<LedgerEntry[]>(FILES.ledger, []);
    const orgRows = rows.filter((r) => r.orgId === input.orgId).sort((a, b) => a.seq - b.seq);
    const prevHash = orgRows.length ? orgRows[orgRows.length - 1].chainHash : "GENESIS";
    const seq = orgRows.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
    const createdAt = new Date().toISOString();
    const chainHash = createHash("sha256").update(canonicalLedger(input, prevHash, createdAt)).digest("hex");
    const entry: LedgerEntry = { ...input, seq, prevHash, chainHash, createdAt };
    rows.push(entry);
    await writeJson(FILES.ledger, rows);
    return entry;
  });
}

export async function devListLedger(q: LedgerQuery): Promise<LedgerEntry[]> {
  const rows = await readJson<LedgerEntry[]>(FILES.ledger, []);
  const filtered = rows.filter(
    (r) =>
      r.orgId === q.orgId &&
      (!q.sessionId || r.sessionId === q.sessionId) &&
      (!q.model || r.model === q.model) &&
      (!q.eventType || r.eventType === q.eventType) &&
      (!q.gate || r.gate === q.gate) &&
      (!q.from || r.createdAt >= q.from) &&
      (!q.to || r.createdAt <= q.to)
  );
  return filtered.sort((a, b) => b.seq - a.seq).slice(0, Math.min(q.limit ?? 100, 500));
}

export async function devVerifyChain(orgId: string): Promise<{ valid: boolean; brokenAt?: number; checked: number }> {
  const rows = await readJson<LedgerEntry[]>(FILES.ledger, []);
  const orgRows = rows.filter((r) => r.orgId === orgId).sort((a, b) => a.seq - b.seq);
  let prev = "GENESIS";
  for (const entry of orgRows) {
    const expected = createHash("sha256").update(canonicalLedger(entry, prev, entry.createdAt)).digest("hex");
    if (entry.chainHash !== expected) return { valid: false, brokenAt: entry.seq, checked: orgRows.length };
    prev = entry.chainHash;
  }
  return { valid: true, checked: orgRows.length };
}

// ---------- org memory (local cosine similarity stands in for pgvector) ----------
type StoredMemory = MemoryInput & { id: number; createdAt: string };

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function devInsertMemory(input: MemoryInput): Promise<void> {
  warnOnce();
  await withLock(FILES.memory, async () => {
    const rows = await readJson<StoredMemory[]>(FILES.memory, []);
    const id = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    rows.push({ ...input, id, createdAt: new Date().toISOString() });
    await writeJson(FILES.memory, rows);
  });
}

export async function devSearchMemory(
  orgId: string,
  embedding: number[],
  opts: { taskCategory?: string; limit?: number }
): Promise<MemoryRow[]> {
  const rows = await readJson<StoredMemory[]>(FILES.memory, []);
  return rows
    .filter((r) => r.orgId === orgId && r.embedding && (!opts.taskCategory || r.taskCategory === opts.taskCategory))
    .map((r) => ({ row: r, similarity: cosine(embedding, r.embedding as number[]) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.min(opts.limit ?? 5, 20))
    .map(({ row, similarity }) => ({
      ...row,
      embedding: null,
      similarity: Math.round(similarity * 1000) / 1000,
    }));
}

const OUTCOME_SCORE: Record<string, number> = {
  accepted: 90,
  verified: 80,
  edited: 65,
  escalated: 45,
  flagged: 30,
  rejected: 15,
};

export async function devSkillMap(
  orgId: string
): Promise<Array<{ model: string; taskCategory: string; trustScore: number; samples: number }>> {
  const rows = await readJson<StoredMemory[]>(FILES.memory, []);
  const agg = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.orgId !== orgId) continue;
    const key = `${r.model}::${r.taskCategory}`;
    const cur = agg.get(key) ?? { sum: 0, n: 0 };
    cur.sum += OUTCOME_SCORE[r.outcome] ?? 50;
    cur.n += 1;
    agg.set(key, cur);
  }
  return Array.from(agg.entries())
    .map(([key, { sum, n }]) => {
      const [model, taskCategory] = key.split("::");
      return { model, taskCategory, trustScore: Math.round((sum / n) * 10) / 10, samples: n };
    })
    .sort((a, b) => b.trustScore - a.trustScore);
}

export async function devExportMemory(orgId: string): Promise<MemoryRow[]> {
  const rows = await readJson<StoredMemory[]>(FILES.memory, []);
  return rows.filter((r) => r.orgId === orgId).map((r) => ({ ...r, embedding: null }));
}

export async function devDeleteMemory(orgId: string): Promise<number> {
  return withLock(FILES.memory, async () => {
    const rows = await readJson<StoredMemory[]>(FILES.memory, []);
    const kept = rows.filter((r) => r.orgId !== orgId);
    await writeJson(FILES.memory, kept);
    return rows.length - kept.length;
  });
}

// ---------- reputation (same EMA math as the Postgres repo) ----------
const REP_TARGET: Record<string, number> = {
  accepted: 100,
  verified: 80,
  edited: 60,
  escalated: 40,
  flagged: 20,
  rejected: 0,
};

export async function devUpdateReputation(input: {
  orgId: string;
  model: string;
  taskCategory: string;
  outcome: "accepted" | "edited" | "rejected" | "escalated" | "verified" | "flagged";
}): Promise<ReputationEntry> {
  warnOnce();
  return withLock(FILES.reputation, async () => {
    const rows = await readJson<ReputationEntry[]>(FILES.reputation, []);
    const existing = rows.find(
      (r) => r.orgId === input.orgId && r.model === input.model && r.taskCategory === input.taskCategory
    );
    const alpha = 0.15;
    const score = existing?.trustScore ?? 50;
    const samples = existing?.samples ?? 0;
    const next = Math.round((score + alpha * ((REP_TARGET[input.outcome] ?? 50) - score)) * 10) / 10;
    const trend = next > score ? "up" : next < score ? "down" : "flat";
    const entry: ReputationEntry = {
      orgId: input.orgId,
      model: input.model,
      taskCategory: input.taskCategory,
      trustScore: next,
      samples: samples + 1,
      trend,
      lastUpdated: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, entry);
    else rows.push(entry);
    await writeJson(FILES.reputation, rows);
    return entry;
  });
}

export async function devGetReputation(orgId: string): Promise<ReputationEntry[]> {
  const rows = await readJson<ReputationEntry[]>(FILES.reputation, []);
  return rows.filter((r) => r.orgId === orgId).sort((a, b) => b.trustScore - a.trustScore);
}

// ---------- leads (marketing capture; same shape as the Postgres repo) ----------
type StoredLead = {
  id: number;
  orgId: string;
  name: string;
  email: string;
  phone: string | null;
  source: string;
  createdAt: string;
};

export async function devInsertLead(input: {
  orgId: string;
  name: string;
  email: string;
  phone?: string;
  source?: string;
}): Promise<StoredLead> {
  warnOnce();
  return withLock(FILES.leads, async () => {
    const rows = await readJson<StoredLead[]>(FILES.leads, []);
    const lead: StoredLead = {
      id: rows.reduce((m, r) => Math.max(m, r.id), 0) + 1,
      orgId: input.orgId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      source: input.source || "website",
      createdAt: new Date().toISOString(),
    };
    rows.push(lead);
    await writeJson(FILES.leads, rows);
    return lead;
  });
}

export async function devListLeads(orgId: string, limit = 100): Promise<StoredLead[]> {
  const rows = await readJson<StoredLead[]>(FILES.leads, []);
  return rows
    .filter((r) => r.orgId === orgId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.min(limit, 500));
}
