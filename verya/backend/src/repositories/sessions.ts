// Session repository — persistence for gated pipeline sessions.
// When DATABASE_URL is unset, persistence falls back to the file-backed dev store
// (backend/.devstore) with identical semantics; Neon Postgres takes over wholly
// the moment the connection string is configured.
import { query, requireDb, isDbConfigured } from "../db/pool";
import * as dev from "../db/devstore";
import type { PipelineSession } from "../schemas/pipeline";

type SessionRow = {
  id: string;
  org_id: string;
  created_at: Date;
  updated_at: Date;
  title: string;
  gate: string;
  gate_status: string;
  state: PipelineSession;
};

function titleOf(session: PipelineSession): string {
  return (session.workflow?.title ?? session.input.slice(0, 60) ?? "Untitled project").slice(0, 120);
}

export async function createSession(orgId: string, session: PipelineSession): Promise<void> {
  if (!isDbConfigured()) return dev.devCreateSession(orgId, session);
  requireDb();
  await query(
    `INSERT INTO sessions (id, org_id, title, gate, gate_status, state)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [session.id, orgId, titleOf(session), session.gate, session.gateStatus, JSON.stringify(session)]
  );
}

export async function saveSession(orgId: string, session: PipelineSession): Promise<void> {
  if (!isDbConfigured()) return dev.devSaveSession(orgId, session);
  requireDb();
  await query(
    `UPDATE sessions
        SET title = $3, gate = $4, gate_status = $5, state = $6, updated_at = now()
      WHERE id = $1 AND org_id = $2`,
    [session.id, orgId, titleOf(session), session.gate, session.gateStatus, JSON.stringify(session)]
  );
}

export async function getSession(orgId: string, id: string): Promise<PipelineSession | null> {
  if (!isDbConfigured()) return dev.devGetSession(orgId, id);
  requireDb();
  const rows = await query<SessionRow>(
    `SELECT id, org_id, created_at, updated_at, title, gate, gate_status, state
       FROM sessions WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  );
  const row = rows[0];
  return row ? row.state : null;
}

export async function listSessions(
  orgId: string,
  limit = 50
): Promise<Array<Pick<PipelineSession, "id" | "gate" | "gateStatus"> & { title: string; updatedAt: string }>> {
  if (!isDbConfigured()) return dev.devListSessions(orgId, limit);
  requireDb();
  const rows = await query<SessionRow>(
    `SELECT id, org_id, created_at, updated_at, title, gate, gate_status, state
       FROM sessions WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [orgId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    gate: r.gate as PipelineSession["gate"],
    gateStatus: r.gate_status as PipelineSession["gateStatus"],
    title: r.title,
    updatedAt: r.updated_at.toISOString(),
  }));
}
