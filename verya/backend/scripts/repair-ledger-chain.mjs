// One-time repair: recompute ledger chain_hash/prev_hash for every org using the
// fixed canonical serializer (sorted-key JSON). Needed because Postgres jsonb
// normalizes object key order, so hashes written with plain JSON.stringify no
// longer verify after the row round-trips through the database.
// Idempotent: on a healthy chain it rewrites identical values. Event content is
// NEVER modified — only chain_hash and prev_hash columns.
import "dotenv/config";
import dotenv from "dotenv";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), "../.env.local") });

const databaseUrl = process.env.DATABASE_URL || process.env.neon_db;
if (!databaseUrl) {
  console.error("DATABASE_URL/neon_db not set — nothing to repair.");
  process.exit(1);
}

// Mirror of repositories/ledger.ts stableStringify (kept self-contained so the
// script cannot drift with app code accidentally — intentional duplication).
function stableStringify(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return String(value);
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

const entry = (r, prev) =>
  stableStringify({
    orgId: r.org_id,
    sessionId: r.session_id ?? null,
    gate: r.gate,
    eventType: r.event_type,
    actor: r.actor ?? "ai",
    model: r.model ?? null,
    taskId: r.task_id ?? null,
    correctionOf: r.correction_of ?? null,
    detail: r.detail ?? {},
    verification: r.verification ?? null,
    humanEdit: r.human_edit ?? null,
    createdAt: new Date(r.created_at).toISOString(),
    prevHash: prev,
  });

const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 1 });
const client = await pool.connect();
try {
  const orgs = (await client.query(`SELECT DISTINCT org_id FROM ledger_entries ORDER BY org_id`)).rows;
  let fixed = 0;
  for (const { org_id } of orgs) {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [org_id]);
    const rows = (await client.query(`SELECT * FROM ledger_entries WHERE org_id = $1 ORDER BY seq ASC`, [org_id])).rows;
    let prev = "GENESIS";
    for (const r of rows) {
      const hash = createHash("sha256").update(entry(r, prev)).digest("hex");
      if (hash !== r.chain_hash || prev !== r.prev_hash) {
        await client.query(`UPDATE ledger_entries SET chain_hash = $2, prev_hash = $3 WHERE org_id = $1 AND seq = ${r.seq}`, [org_id, hash, prev]);
        fixed++;
      }
      prev = hash;
    }
    await client.query("COMMIT");
    console.log(`${org_id}: ${rows.length} rows, chain recomputed`);
  }
  console.log(`DONE — ${fixed} row(s) rewritten.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("repair failed:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
