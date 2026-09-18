// Leads repository — append-only marketing lead capture.
import { query, requireDb } from "../db/pool";

export type LeadRecord = {
  id: number;
  orgId: string;
  name: string;
  email: string;
  phone: string | null;
  source: string;
  createdAt: string;
};

export async function insertLead(input: {
  orgId: string;
  name: string;
  email: string;
  phone?: string;
  source?: string;
}): Promise<LeadRecord> {
  requireDb();
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO leads (org_id, name, email, phone, source, accepted_terms_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id, org_id, name, email, phone, source, created_at`,
    [input.orgId, input.name, input.email, input.phone || null, input.source || "website"]
  );
  return rowToLead(rows[0] as Record<string, unknown>);
}

export async function listLeads(orgId: string, limit = 100): Promise<LeadRecord[]> {
  requireDb();
  const rows = await query<Record<string, unknown>>(
    `SELECT id, org_id, name, email, phone, source, created_at
       FROM leads WHERE org_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [orgId, Math.min(limit, 500)]
  );
  return rows.map(rowToLead);
}

function rowToLead(r: Record<string, unknown>): LeadRecord {
  return {
    id: Number(r.id),
    orgId: String(r.org_id),
    name: String(r.name),
    email: String(r.email),
    phone: (r.phone as string) ?? null,
    source: String(r.source),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}
