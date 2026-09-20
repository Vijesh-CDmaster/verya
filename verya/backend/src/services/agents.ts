// Verya — Agent Registry Service (F23)
// Business logic, lifecycle state transitions, cross-tenant parent validation, and audit logging.

import crypto from "node:crypto";
import { CreateAgentSchema, UpdateAgentSchema } from "../schemas/agent";
import type { z } from "zod";
import type { Agent, AgentStatus, AgentType } from "../schemas/agent";
import {
  createAgent as repoCreate,
  getAgent as repoGet,
  listAgents as repoList,
  saveAgent as repoSave,
} from "../repositories/agents";
import { recordToLedger } from "./ledger";

export async function createAgentService(
  orgId: string,
  owner: string,
  rawInput: z.input<typeof CreateAgentSchema>
): Promise<Agent> {
  const input = CreateAgentSchema.parse(rawInput);
  let delegationChain: string[] = [];
  let parentAgentId: string | null = null;

  if (input.parentAgentId) {
    const parent = await repoGet(orgId, input.parentAgentId);
    if (!parent) {
      throw Object.assign(
        new Error("Parent agent not found in your organization"),
        { statusCode: 400 }
      );
    }
    parentAgentId = parent.agentId;
    delegationChain = [...parent.delegationChain, parent.agentId];
  }

  const now = new Date().toISOString();
  const agent: Agent = {
    agentId: `agent-${crypto.randomUUID()}`,
    orgId,
    owner: owner || "system",
    name: input.name,
    description: input.description || "",
    purpose: input.purpose,
    agentType: input.agentType,
    autonomyLevel: input.autonomyLevel,
    allowedModels: input.allowedModels,
    allowedTools: input.allowedTools,
    allowedActions: input.allowedActions,
    dataScope: input.dataScope,
    riskLevel: input.riskLevel,
    status: input.status,
    version: 1,
    parentAgentId,
    delegationChain,
    createdAt: now,
    updatedAt: now,
  };

  await repoCreate(agent);

  await recordToLedger({
    orgId,
    gate: "governance",
    eventType: "agent_created",
    actor: "human",
    detail: {
      summary: `Agent "${agent.name}" (${agent.agentId}) created`,
      agentId: agent.agentId,
      agentType: agent.agentType,
      autonomyLevel: agent.autonomyLevel,
      riskLevel: agent.riskLevel,
      version: agent.version,
    },
  });

  return agent;
}

export async function getAgentService(orgId: string, agentId: string): Promise<Agent | null> {
  return repoGet(orgId, agentId);
}

export async function listAgentsService(
  orgId: string,
  filter?: { status?: AgentStatus; type?: AgentType }
): Promise<Agent[]> {
  return repoList(orgId, filter);
}

export async function updateAgentService(
  orgId: string,
  agentId: string,
  rawInput: z.input<typeof UpdateAgentSchema>
): Promise<Agent> {
  const input = UpdateAgentSchema.parse(rawInput);
  const existing = await repoGet(orgId, agentId);
  if (!existing) {
    throw Object.assign(new Error("Agent not found"), { statusCode: 404 });
  }

  let parentAgentId = existing.parentAgentId;
  let delegationChain = existing.delegationChain;

  if (input.parentAgentId !== undefined) {
    if (input.parentAgentId === null || input.parentAgentId === "") {
      parentAgentId = null;
      delegationChain = [];
    } else {
      if (input.parentAgentId === agentId) {
        throw Object.assign(new Error("An agent cannot be its own parent"), { statusCode: 400 });
      }
      const parent = await repoGet(orgId, input.parentAgentId);
      if (!parent) {
        throw Object.assign(
          new Error("Parent agent not found in your organization"),
          { statusCode: 400 }
        );
      }
      parentAgentId = parent.agentId;
      delegationChain = [...parent.delegationChain, parent.agentId];
    }
  }

  const updated: Agent = {
    ...existing,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    purpose: input.purpose ?? existing.purpose,
    agentType: input.agentType ?? existing.agentType,
    autonomyLevel: input.autonomyLevel ?? existing.autonomyLevel,
    allowedModels: input.allowedModels ?? existing.allowedModels,
    allowedTools: input.allowedTools ?? existing.allowedTools,
    allowedActions: input.allowedActions ?? existing.allowedActions,
    dataScope: input.dataScope ?? existing.dataScope,
    riskLevel: input.riskLevel ?? existing.riskLevel,
    status: input.status ?? existing.status,
    version: existing.version + 1,
    parentAgentId,
    delegationChain,
    updatedAt: new Date().toISOString(),
  };

  await repoSave(orgId, updated);

  await recordToLedger({
    orgId,
    gate: "governance",
    eventType: "agent_updated",
    actor: "human",
    detail: {
      summary: `Agent "${updated.name}" (${updated.agentId}) updated to v${updated.version}`,
      agentId: updated.agentId,
      version: updated.version,
      status: updated.status,
    },
  });

  return updated;
}

async function setAgentStatus(
  orgId: string,
  agentId: string,
  newStatus: AgentStatus,
  eventType: string
): Promise<Agent> {
  const existing = await repoGet(orgId, agentId);
  if (!existing) {
    throw Object.assign(new Error("Agent not found"), { statusCode: 404 });
  }

  const updated: Agent = {
    ...existing,
    status: newStatus,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  };

  await repoSave(orgId, updated);

  await recordToLedger({
    orgId,
    gate: "governance",
    eventType,
    actor: "human",
    detail: {
      summary: `Agent "${updated.name}" (${updated.agentId}) transition -> ${newStatus}`,
      agentId: updated.agentId,
      fromStatus: existing.status,
      toStatus: newStatus,
      version: updated.version,
    },
  });

  return updated;
}

export async function suspendAgentService(orgId: string, agentId: string): Promise<Agent> {
  return setAgentStatus(orgId, agentId, "suspended", "agent_suspended");
}

export async function revokeAgentService(orgId: string, agentId: string): Promise<Agent> {
  return setAgentStatus(orgId, agentId, "revoked", "agent_revoked");
}

export async function archiveAgentService(orgId: string, agentId: string): Promise<Agent> {
  return setAgentStatus(orgId, agentId, "archived", "agent_archived");
}

export async function reactivateAgentService(orgId: string, agentId: string): Promise<Agent> {
  return setAgentStatus(orgId, agentId, "active", "agent_reactivated");
}
