// Agent Repository — persistence for organization-scoped agents (F23).
import { query, requireDb, isDbConfigured } from "../db/pool";
import * as dev from "../db/devstore";
import type { Agent, AgentStatus, AgentType } from "../schemas/agent";

type AgentRow = {
  agent_id: string;
  org_id: string;
  owner: string;
  name: string;
  description: string;
  purpose: string;
  agent_type: string;
  autonomy_level: string;
  allowed_models: string[];
  allowed_tools: string[];
  allowed_actions: string[];
  data_scope: string;
  risk_level: string;
  status: string;
  version: number;
  parent_agent_id: string | null;
  delegation_chain: string[];
  created_at: Date;
  updated_at: Date;
};

function rowToAgent(r: AgentRow): Agent {
  return {
    agentId: r.agent_id,
    orgId: r.org_id,
    owner: r.owner,
    name: r.name,
    description: r.description,
    purpose: r.purpose,
    agentType: r.agent_type as Agent["agentType"],
    autonomyLevel: r.autonomy_level as Agent["autonomyLevel"],
    allowedModels: r.allowed_models ?? [],
    allowedTools: r.allowed_tools ?? [],
    allowedActions: r.allowed_actions ?? [],
    dataScope: r.data_scope as Agent["dataScope"],
    riskLevel: r.risk_level as Agent["riskLevel"],
    status: r.status as Agent["status"],
    version: r.version,
    parentAgentId: r.parent_agent_id,
    delegationChain: r.delegation_chain ?? [],
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function createAgent(agent: Agent): Promise<void> {
  if (!isDbConfigured()) return dev.devCreateAgent(agent);
  requireDb();
  await query(
    `INSERT INTO agents (
       agent_id, org_id, owner, name, description, purpose, agent_type, autonomy_level,
       allowed_models, allowed_tools, allowed_actions, data_scope, risk_level, status,
       version, parent_agent_id, delegation_chain, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
     )`,
    [
      agent.agentId,
      agent.orgId,
      agent.owner,
      agent.name,
      agent.description,
      agent.purpose,
      agent.agentType,
      agent.autonomyLevel,
      JSON.stringify(agent.allowedModels),
      JSON.stringify(agent.allowedTools),
      JSON.stringify(agent.allowedActions),
      agent.dataScope,
      agent.riskLevel,
      agent.status,
      agent.version,
      agent.parentAgentId ?? null,
      JSON.stringify(agent.delegationChain),
      agent.createdAt,
      agent.updatedAt,
    ]
  );
}

export async function getAgent(orgId: string, agentId: string): Promise<Agent | null> {
  if (!isDbConfigured()) return dev.devGetAgent(orgId, agentId);
  requireDb();
  const rows = await query<AgentRow>(
    `SELECT agent_id, org_id, owner, name, description, purpose, agent_type, autonomy_level,
            allowed_models, allowed_tools, allowed_actions, data_scope, risk_level, status,
            version, parent_agent_id, delegation_chain, created_at, updated_at
       FROM agents
      WHERE agent_id = $1 AND org_id = $2`,
    [agentId, orgId]
  );
  const row = rows[0];
  return row ? rowToAgent(row) : null;
}

export async function listAgents(
  orgId: string,
  filter?: { status?: AgentStatus; type?: AgentType }
): Promise<Agent[]> {
  if (!isDbConfigured()) return dev.devListAgents(orgId, filter);
  requireDb();
  const conditions = ["org_id = $1"];
  const params: unknown[] = [orgId];

  if (filter?.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filter?.type) {
    params.push(filter.type);
    conditions.push(`agent_type = $${params.length}`);
  }

  const rows = await query<AgentRow>(
    `SELECT agent_id, org_id, owner, name, description, purpose, agent_type, autonomy_level,
            allowed_models, allowed_tools, allowed_actions, data_scope, risk_level, status,
            version, parent_agent_id, delegation_chain, created_at, updated_at
       FROM agents
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC`,
    params
  );
  return rows.map(rowToAgent);
}

export async function saveAgent(orgId: string, agent: Agent): Promise<void> {
  if (!isDbConfigured()) return dev.devSaveAgent(orgId, agent);
  requireDb();
  await query(
    `UPDATE agents
        SET name = $3, description = $4, purpose = $5, agent_type = $6, autonomy_level = $7,
            allowed_models = $8, allowed_tools = $9, allowed_actions = $10, data_scope = $11,
            risk_level = $12, status = $13, version = $14, parent_agent_id = $15,
            delegation_chain = $16, updated_at = $17
      WHERE agent_id = $1 AND org_id = $2`,
    [
      agent.agentId,
      orgId,
      agent.name,
      agent.description,
      agent.purpose,
      agent.agentType,
      agent.autonomyLevel,
      JSON.stringify(agent.allowedModels),
      JSON.stringify(agent.allowedTools),
      JSON.stringify(agent.allowedActions),
      agent.dataScope,
      agent.riskLevel,
      agent.status,
      agent.version,
      agent.parentAgentId ?? null,
      JSON.stringify(agent.delegationChain),
      agent.updatedAt,
    ]
  );
}
