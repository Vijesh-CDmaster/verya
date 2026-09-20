// Delegation Repository — persistence for organization-scoped capability delegations (F23 Phase 4).
import { query, requireDb, isDbConfigured } from "../db/pool";
import * as dev from "../db/devstore";
import type { Delegation, DelegationStatus, ResourceConstraint } from "../schemas/delegation";

type DelegationRow = {
  delegation_id: string;
  org_id: string;
  delegator_user_id: string;
  agent_id: string;
  parent_delegation_id: string | null;
  purpose: string;
  allowed_actions: string[];
  allowed_tools: string[];
  allowed_resources: ResourceConstraint[];
  data_scope: string;
  maximum_risk: string;
  constraints: Record<string, unknown>;
  can_delegate: boolean;
  issued_at: Date;
  expires_at: Date;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
};

function rowToDelegation(r: DelegationRow): Delegation {
  return {
    delegationId: r.delegation_id,
    orgId: r.org_id,
    delegatorUserId: r.delegator_user_id,
    agentId: r.agent_id,
    parentDelegationId: r.parent_delegation_id,
    purpose: r.purpose,
    allowedActions: r.allowed_actions ?? [],
    allowedTools: r.allowed_tools ?? [],
    allowedResources: r.allowed_resources ?? [],
    dataScope: r.data_scope as Delegation["dataScope"],
    maximumRisk: r.maximum_risk as Delegation["maximumRisk"],
    constraints: r.constraints ?? {},
    canDelegate: r.can_delegate,
    issuedAt: r.issued_at instanceof Date ? r.issued_at.toISOString() : String(r.issued_at),
    expiresAt: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
    status: r.status as DelegationStatus,
    version: r.version,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function createDelegation(delegation: Delegation): Promise<void> {
  if (!isDbConfigured()) return dev.devCreateDelegation(delegation);
  requireDb();
  await query(
    `INSERT INTO delegations (
       delegation_id, org_id, delegator_user_id, agent_id, parent_delegation_id,
       purpose, allowed_actions, allowed_tools, allowed_resources, data_scope,
       maximum_risk, constraints, can_delegate, issued_at, expires_at, status,
       version, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
     )`,
    [
      delegation.delegationId,
      delegation.orgId,
      delegation.delegatorUserId,
      delegation.agentId,
      delegation.parentDelegationId ?? null,
      delegation.purpose,
      JSON.stringify(delegation.allowedActions),
      JSON.stringify(delegation.allowedTools),
      JSON.stringify(delegation.allowedResources),
      delegation.dataScope,
      delegation.maximumRisk,
      JSON.stringify(delegation.constraints),
      delegation.canDelegate,
      delegation.issuedAt,
      delegation.expiresAt,
      delegation.status,
      delegation.version,
      delegation.createdAt,
      delegation.updatedAt,
    ]
  );
}

export async function getDelegation(orgId: string, delegationId: string): Promise<Delegation | null> {
  if (!isDbConfigured()) return dev.devGetDelegation(orgId, delegationId);
  requireDb();
  const rows = await query<DelegationRow>(
    `SELECT delegation_id, org_id, delegator_user_id, agent_id, parent_delegation_id,
            purpose, allowed_actions, allowed_tools, allowed_resources, data_scope,
            maximum_risk, constraints, can_delegate, issued_at, expires_at, status,
            version, created_at, updated_at
       FROM delegations
      WHERE delegation_id = $1 AND org_id = $2`,
    [delegationId, orgId]
  );
  const row = rows[0];
  return row ? rowToDelegation(row) : null;
}

export async function listDelegations(
  orgId: string,
  filter?: { agentId?: string; status?: DelegationStatus }
): Promise<Delegation[]> {
  if (!isDbConfigured()) return dev.devListDelegations(orgId, filter);
  requireDb();
  const conditions = ["org_id = $1"];
  const params: unknown[] = [orgId];

  if (filter?.agentId) {
    params.push(filter.agentId);
    conditions.push(`agent_id = $${params.length}`);
  }
  if (filter?.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }

  const rows = await query<DelegationRow>(
    `SELECT delegation_id, org_id, delegator_user_id, agent_id, parent_delegation_id,
            purpose, allowed_actions, allowed_tools, allowed_resources, data_scope,
            maximum_risk, constraints, can_delegate, issued_at, expires_at, status,
            version, created_at, updated_at
       FROM delegations
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC`,
    params
  );
  return rows.map(rowToDelegation);
}

export async function saveDelegation(orgId: string, delegation: Delegation): Promise<void> {
  if (!isDbConfigured()) return dev.devSaveDelegation(orgId, delegation);
  requireDb();
  await query(
    `UPDATE delegations
        SET purpose = $3, allowed_actions = $4, allowed_tools = $5, allowed_resources = $6,
            data_scope = $7, maximum_risk = $8, constraints = $9, can_delegate = $10,
            expires_at = $11, status = $12, version = $13, updated_at = $14
      WHERE delegation_id = $1 AND org_id = $2`,
    [
      delegation.delegationId,
      orgId,
      delegation.purpose,
      JSON.stringify(delegation.allowedActions),
      JSON.stringify(delegation.allowedTools),
      JSON.stringify(delegation.allowedResources),
      delegation.dataScope,
      delegation.maximumRisk,
      JSON.stringify(delegation.constraints),
      delegation.canDelegate,
      delegation.expiresAt,
      delegation.status,
      delegation.version,
      delegation.updatedAt,
    ]
  );
}
