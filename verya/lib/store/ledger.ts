// Verya — Trust Ledger (F10)
// Append-only. Records are never edited or deleted; corrections are new linked entries.
// Storage: JSONL under .data/ledger/ (Neon Postgres in production per STACK.md).

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export type LedgerEntry = {
  seq: number;
  id: string;
  sessionId: string;
  orgId: string;
  gate: string;
  eventType: string;
  actor: "system" | "human";
  taskId?: string;
  model?: string;
  detail: Record<string, unknown>;
  promptRef?: string;
  outputRef?: string;
  verification?: { passed: boolean; issues: string[] };
  humanEdit?: Record<string, unknown>;
  prevHash: string;
  hash: string;
  timestamp: string;
  version: string;
};

const DATA_DIR = path.join(process.cwd(), ".data", "ledger");
const VERSION = "ledger-v1";

function hashEntry(entry: Omit<LedgerEntry, "hash">): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        seq: entry.seq,
        id: entry.id,
        sessionId: entry.sessionId,
        orgId: entry.orgId,
        gate: entry.gate,
        eventType: entry.eventType,
        actor: entry.actor,
        taskId: entry.taskId,
        model: entry.model,
        detail: entry.detail,
        timestamp: entry.timestamp,
        prevHash: entry.prevHash,
      })
    )
    .digest("hex");
}

async function readAll(orgId: string): Promise<LedgerEntry[]> {
  const file = path.join(DATA_DIR, `${orgId}.jsonl`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LedgerEntry);
  } catch {
    return [];
  }
}

async function appendEntry(orgId: string, entry: LedgerEntry): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${orgId}.jsonl`);
  await fs.appendFile(file, JSON.stringify(entry) + "\n", "utf8");
}

export async function recordToLedger(input: {
  orgId: string;
  sessionId: string;
  gate: string;
  eventType: string;
  actor?: "system" | "human";
  taskId?: string;
  model?: string;
  detail: Record<string, unknown>;
  verification?: { passed: boolean; issues: string[] };
  humanEdit?: Record<string, unknown>;
}): Promise<LedgerEntry> {
  const existing = await readAll(input.orgId);
  const prevHash = existing.length > 0 ? existing[existing.length - 1].hash : "GENESIS";
  const seq = existing.length + 1;
  const base: Omit<LedgerEntry, "hash"> = {
    seq,
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    orgId: input.orgId,
    gate: input.gate,
    eventType: input.eventType,
    actor: input.actor ?? "system",
    taskId: input.taskId,
    model: input.model,
    detail: input.detail,
    verification: input.verification,
    humanEdit: input.humanEdit,
    prevHash,
    timestamp: new Date().toISOString(),
    version: VERSION,
  };
  const entry: LedgerEntry = { ...base, hash: hashEntry(base) };
  await appendEntry(input.orgId, entry);
  return entry;
}

export type LedgerQuery = {
  orgId: string;
  sessionId?: string;
  model?: string;
  gate?: string;
  eventType?: string;
  actor?: "system" | "human";
  since?: string;
  until?: string;
  limit?: number;
};

export async function queryLedger(query: LedgerQuery): Promise<LedgerEntry[]> {
  let entries = await readAll(query.orgId);
  if (query.sessionId) entries = entries.filter((e) => e.sessionId === query.sessionId);
  if (query.model) entries = entries.filter((e) => e.model === query.model);
  if (query.gate) entries = entries.filter((e) => e.gate === query.gate);
  if (query.eventType) entries = entries.filter((e) => e.eventType === query.eventType);
  if (query.actor) entries = entries.filter((e) => e.actor === query.actor);
  if (query.since) entries = entries.filter((e) => e.timestamp >= query.since!);
  if (query.until) entries = entries.filter((e) => e.timestamp <= query.until!);
  const limit = query.limit ?? 500;
  return entries.slice(-limit);
}

/** Compliance/audit export: one-click artifact from the ledger (F10). */
export async function exportLedgerReport(orgId: string, sessionId?: string): Promise<Buffer> {
  const entries = await queryLedger({ orgId, sessionId, limit: 100000 });
  const lines: string[] = [
    "Verya Trust Ledger — Compliance Export",
    `Generated: ${new Date().toISOString()}`,
    `Org: ${orgId}`,
    sessionId ? `Session: ${sessionId}` : "Session: (all)",
    `Entries: ${entries.length}`,
    "",
    "seq\ttimestamp\tsession\tgate\tevent\tactor\ttask\tmodel\tsummary",
  ];
  for (const e of entries) {
    const summary = summarize(e);
    lines.push(
      [e.seq, e.timestamp, e.sessionId.slice(0, 8), e.gate, e.eventType, e.actor, e.taskId ?? "-", e.model ?? "-", summary].join("\t")
    );
  }
  lines.push("", `Chain integrity: hash-linked entries, ${VERSION}.`);
  return Buffer.from(lines.join("\n"), "utf8");
}

function summarize(e: LedgerEntry): string {
  const d = e.detail ?? {};
  if (typeof d.summary === "string") return d.summary;
  if (e.eventType === "task_execution") {
    const v = e.verification;
    return `executed by ${e.model}${v ? `, verification ${v.passed ? "passed" : "FAILED"}` : ""}`;
  }
  return JSON.stringify(d).slice(0, 120);
}
