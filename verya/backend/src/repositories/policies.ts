import { query, requireDb, pool, isDbConfigured } from "../db/pool";
import * as dev from "../db/devstore";

export type PolicySuggestion = {
  id: number;
  orgId: string;
  version: number;
  rule: string;
  rationale: string;
  evidence: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
};

export async function listPolicySuggestions(orgId: string): Promise<PolicySuggestion[]> {
  if (!isDbConfigured()) return dev.devListPolicySuggestions(orgId);
  requireDb();
  const rows = await query<Record<string, unknown>>(
    `SELECT id, org_id, version, rule, rationale, evidence, status, created_at, decided_at
       FROM policy_suggestions WHERE org_id = $1 ORDER BY version DESC LIMIT 100`,
    [orgId]
  );
  return rows.map(rowToPolicy);
}

export async function createPolicySuggestion(input: Omit<PolicySuggestion, "id" | "createdAt" | "decidedAt">): Promise<PolicySuggestion> {
  if (!isDbConfigured()) return dev.devCreatePolicySuggestion(input);
  requireDb();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const version = await client.query<{ version: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM policy_suggestions WHERE org_id = $1",
      [input.orgId]
    );
    const res = await client.query<Record<string, unknown>>(
      `INSERT INTO policy_suggestions (org_id, version, rule, rationale, evidence, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, org_id, version, rule, rationale, evidence, status, created_at, decided_at`,
      [input.orgId, version.rows[0].version, input.rule, input.rationale, JSON.stringify(input.evidence), input.status]
    );
    await client.query("COMMIT");
    return rowToPolicy(res.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function decidePolicySuggestion(orgId: string, id: number, status: "approved" | "rejected"): Promise<PolicySuggestion | null> {
  if (!isDbConfigured()) return dev.devDecidePolicySuggestion(orgId, id, status);
  requireDb();
  const rows = await query<Record<string, unknown>>(
    `UPDATE policy_suggestions SET status = $3, decided_at = now()
      WHERE org_id = $1 AND id = $2 RETURNING id, org_id, version, rule, rationale, evidence, status, created_at, decided_at`,
    [orgId, id, status]
  );
  return rows[0] ? rowToPolicy(rows[0]) : null;
}

function rowToPolicy(row: Record<string, unknown>): PolicySuggestion {
  return {
    id: Number(row.id),
    orgId: String(row.org_id),
    version: Number(row.version),
    rule: String(row.rule),
    rationale: String(row.rationale),
    evidence: (row.evidence as Record<string, unknown>) ?? {},
    status: String(row.status) as PolicySuggestion["status"],
    createdAt: new Date(row.created_at as string).toISOString(),
    decidedAt: row.decided_at ? new Date(row.decided_at as string).toISOString() : undefined,
  };
}
