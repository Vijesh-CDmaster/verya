// Organization memory repository (F9) — Postgres + pgvector.
// Every AI interaction + outcome is stored per org with a 1536-dim embedding;
// routing pulls similar past tasks via cosine similarity. Strict tenant isolation.
import { query, requireDb, pool, isDbConfigured } from "../db/pool";
import * as dev from "../db/devstore";

export type MemoryInput = {
  orgId: string;
  sessionId?: string;
  taskCategory: string;
  model: string;
  outcome: "accepted" | "edited" | "rejected" | "escalated" | "verified" | "flagged";
  title: string;
  content: string;
  embedding: number[] | null;
  meta?: Record<string, unknown>;
};

export type MemoryRow = MemoryInput & { id: number; createdAt: string; similarity?: number };

export async function insertMemory(input: MemoryInput): Promise<void> {
  if (!isDbConfigured()) return dev.devInsertMemory(input);
  requireDb();
  const emb = input.embedding
    ? `[${input.embedding.map((n) => Number.isFinite(n) ? n : 0).join(",")}]`
    : null;
  await query(
    `INSERT INTO org_memory (org_id, session_id, task_category, model, outcome, title, content, embedding, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector,$9::jsonb)`,
    [
      input.orgId,
      input.sessionId ?? null,
      input.taskCategory,
      input.model,
      input.outcome,
      input.title.slice(0, 200),
      input.content.slice(0, 4000),
      emb,
      JSON.stringify(input.meta ?? {}),
    ]
  );
}

export async function searchMemory(
  orgId: string,
  embedding: number[],
  opts: { taskCategory?: string; limit?: number }
): Promise<MemoryRow[]> {
  if (!isDbConfigured()) return dev.devSearchMemory(orgId, embedding, opts);
  requireDb();
  const emb = `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
  const params: unknown[] = [orgId, emb];
  let categoryClause = "";
  if (opts.taskCategory) {
    params.push(opts.taskCategory);
    categoryClause = `AND task_category = $${params.length}`;
  }
  const rows = await query<Record<string, unknown>>(
    `SELECT id, org_id, session_id, task_category, model, outcome, title, content, meta, created_at,
            1 - (embedding <=> $2::vector) AS similarity
       FROM org_memory
      WHERE org_id = $1 ${categoryClause}
      ORDER BY embedding <=> $2::vector
      LIMIT ${Math.min(opts.limit ?? 5, 20)}`,
    params
  );
  return rows.map((r) => ({
    id: Number(r.id),
    orgId: String(r.org_id),
    sessionId: (r.session_id as string) ?? undefined,
    taskCategory: String(r.task_category),
    model: String(r.model),
    outcome: String(r.outcome) as MemoryRow["outcome"],
    title: String(r.title),
    content: String(r.content),
    embedding: null,
    meta: (r.meta as Record<string, unknown>) ?? {},
    createdAt: new Date(r.created_at as string).toISOString(),
    similarity: Number(r.similarity),
  }));
}

/** Aggregate skill map: trust per model x task category from outcome history. */
export async function skillMap(orgId: string): Promise<Array<{ model: string; taskCategory: string; trustScore: number; samples: number }>> {
  if (!isDbConfigured()) return dev.devSkillMap(orgId);
  requireDb();
  const rows = await query<{ model: string; task_category: string; avg_score: string; samples: string }>(
    `SELECT model, task_category,
            AVG(CASE outcome
                  WHEN 'accepted'  THEN 90
                  WHEN 'verified'  THEN 80
                  WHEN 'edited'    THEN 65
                  WHEN 'escalated' THEN 45
                  WHEN 'flagged'   THEN 30
                  WHEN 'rejected'  THEN 15
                END) AS avg_score,
            COUNT(*) AS samples
       FROM org_memory
      WHERE org_id = $1
      GROUP BY model, task_category
      ORDER BY avg_score DESC`,
    [orgId]
  );
  return rows.map((r) => ({
    model: r.model,
    taskCategory: r.task_category,
    trustScore: Math.round(Number(r.avg_score) * 10) / 10,
    samples: Number(r.samples),
  }));
}

export async function exportMemory(orgId: string): Promise<MemoryRow[]> {
  if (!isDbConfigured()) return dev.devExportMemory(orgId);
  requireDb();
  const rows = await query<Record<string, unknown>>(
    `SELECT id, org_id, session_id, task_category, model, outcome, title, content, meta, created_at
       FROM org_memory WHERE org_id = $1 ORDER BY created_at ASC`,
    [orgId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    orgId: String(r.org_id),
    sessionId: (r.session_id as string) ?? undefined,
    taskCategory: String(r.task_category),
    model: String(r.model),
    outcome: String(r.outcome) as MemoryRow["outcome"],
    title: String(r.title),
    content: String(r.content),
    embedding: null,
    meta: (r.meta as Record<string, unknown>) ?? {},
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export async function deleteMemory(orgId: string): Promise<number> {
  if (!isDbConfigured()) return dev.devDeleteMemory(orgId);
  requireDb();
  const res = await pool.query("DELETE FROM org_memory WHERE org_id = $1", [orgId]);
  return res.rowCount ?? 0;
}
