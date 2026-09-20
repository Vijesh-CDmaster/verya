// Trust Ledger repository (F10) — append-only, hash-chained in Postgres.
// Each row's chain_hash = SHA-256(prev_hash || canonical payload). Normal application
// flow only ever INSERTs; corrections are new rows referencing the original.
import { createHash } from "crypto";
import { query, requireDb, pool, isDbConfigured } from "../db/pool";
import * as dev from "../db/devstore";

export type LedgerInput = {
  orgId: string;
  sessionId?: string;
  gate: string;
  eventType: string;
  actor?: "ai" | "human" | "system";
  model?: string;
  taskId?: string;
  correctionOf?: number;
  detail?: Record<string, unknown>;
  verification?: { passed: boolean; issues: string[] };
  humanEdit?: Record<string, unknown>;
};

export type LedgerEntry = LedgerInput & {
  seq: number;
  prevHash: string;
  chainHash: string;
  createdAt: string;
};

/**
 * Deterministic JSON with RECURSIVELY SORTED object keys (RFC 8785-style JCS,
 * simplified). Required because Postgres `jsonb` does NOT preserve object key
 * order — it normalizes to sorted — so a plain JSON.stringify of `detail` hashes
 * differently at write time (in-memory insertion order) than at verify time
 * (jsonb-normalized order), silently breaking the chain (observed: verify failed
 * at seq 1 the moment the Postgres path went live). Arrays keep their order —
 * element order is semantic; only object key order is normalized.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return String(value);
  if (value === undefined) return "null"; // matches JSON.stringify inside arrays
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined) // JSON.stringify drops undefined values
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** The exact byte payload a ledger row's chain_hash commits to. */
export function canonical(entry: LedgerInput, prevHash: string, ts: string): string {
  return stableStringify({
    orgId: entry.orgId,
    sessionId: entry.sessionId ?? null,
    gate: entry.gate,
    eventType: entry.eventType,
    actor: entry.actor ?? "ai",
    model: entry.model ?? null,
    taskId: entry.taskId ?? null,
    correctionOf: entry.correctionOf ?? null,
    detail: entry.detail ?? {},
    verification: entry.verification ?? null,
    humanEdit: entry.humanEdit ?? null,
    createdAt: ts,
    prevHash,
  });
}

export async function recordToLedger(input: LedgerInput): Promise<LedgerEntry> {
  if (!isDbConfigured()) return dev.devRecordLedger(input);
  requireDb();
  const client = await pool.connect();
  try {
    // Serialize appends per org so the chain has no forks under concurrency.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.orgId]);
    const prev = await client.query<{ chain_hash: string }>(
      `SELECT chain_hash FROM ledger_entries WHERE org_id = $1 ORDER BY seq DESC LIMIT 1`,
      [input.orgId]
    );
    const prevHash = prev.rows[0]?.chain_hash ?? "GENESIS";
    const createdAt = new Date().toISOString();
    const chainHash = createHash("sha256")
      .update(canonical(input, prevHash, createdAt))
      .digest("hex");

    const res = await client.query<{ seq: number }>(
      `INSERT INTO ledger_entries
         (org_id, session_id, gate, event_type, actor, model, task_id,
           correction_of, detail, verification, human_edit, prev_hash, chain_hash, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING seq`,
      [
        input.orgId,
        input.sessionId ?? null,
        input.gate,
        input.eventType,
        input.actor ?? "ai",
        input.model ?? null,
        input.taskId ?? null,
        input.correctionOf ?? null,
        JSON.stringify(input.detail ?? {}),
        input.verification ? JSON.stringify(input.verification) : null,
        input.humanEdit ? JSON.stringify(input.humanEdit) : null,
        prevHash,
        chainHash,
        createdAt,
      ]
    );
    return {
      ...input,
      seq: res.rows[0].seq,
      prevHash,
      chainHash,
      createdAt,
    };
  } finally {
    client.release();
  }
}

export type LedgerQuery = {
  orgId: string;
  sessionId?: string;
  model?: string;
  eventType?: string;
  gate?: string;
  taskId?: string;
  correctionOf?: number;
  from?: string;
  to?: string;
  limit?: number;
};

export async function listLedger(q: LedgerQuery): Promise<LedgerEntry[]> {
  if (!isDbConfigured()) return dev.devListLedger(q);
  requireDb();
  const clauses: string[] = ["org_id = $1"];
  const params: unknown[] = [q.orgId];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    clauses.push(clause.replace("$?", `$${params.length}`));
  };
  if (q.sessionId) add("session_id = $?", q.sessionId);
  if (q.model) add("model = $?", q.model);
  if (q.eventType) add("event_type = $?", q.eventType);
  if (q.gate) add("gate = $?", q.gate);
  if (q.taskId) add("task_id = $?", q.taskId);
  if (q.correctionOf != null) add("correction_of = $?", q.correctionOf);
  if (q.from) add("created_at >= $?", q.from);
  if (q.to) add("created_at <= $?", q.to);

  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ledger_entries WHERE ${clauses.join(" AND ")} ORDER BY seq DESC LIMIT ${Math.min(q.limit ?? 100, 500)}`,
    params
  );
  return rows.map(rowToEntry);
}

function rowToEntry(r: Record<string, unknown>): LedgerEntry {
  return {
    seq: Number(r.seq),
    orgId: String(r.org_id),
    sessionId: (r.session_id as string) ?? undefined,
    gate: String(r.gate),
    eventType: String(r.event_type),
    actor: String(r.actor) as LedgerEntry["actor"],
    model: (r.model as string) ?? undefined,
    taskId: (r.task_id as string) ?? undefined,
    correctionOf: r.correction_of == null ? undefined : Number(r.correction_of),
    detail: (r.detail as Record<string, unknown>) ?? {},
    verification: (r.verification as LedgerEntry["verification"]) ?? undefined,
    humanEdit: (r.human_edit as Record<string, unknown>) ?? undefined,
    prevHash: String(r.prev_hash),
    chainHash: String(r.chain_hash),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/** Verify the org's hash chain end-to-end; returns first broken seq if tampered. */
export async function verifyChain(orgId: string): Promise<{ valid: boolean; brokenAt?: number; checked: number }> {
  if (!isDbConfigured()) return dev.devVerifyChain(orgId);
  requireDb();
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ledger_entries WHERE org_id = $1 ORDER BY seq ASC`,
    [orgId]
  );
  let prev = "GENESIS";
  for (const r of rows) {
    const entry = rowToEntry(r);
    const expected = createHash("sha256").update(canonical(entry, prev, entry.createdAt)).digest("hex");
    if (entry.chainHash !== expected) return { valid: false, brokenAt: entry.seq, checked: rows.length };
    prev = entry.chainHash;
  }
  return { valid: true, checked: rows.length };
}
