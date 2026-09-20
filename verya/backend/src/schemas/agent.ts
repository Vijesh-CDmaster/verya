// Verya — Agent Registry Schemas & Types (F23)
import { z } from "zod";
import { MODEL_IDS } from "./pipeline";

export const AGENT_TYPES = [
  "planner",
  "router",
  "analyzer",
  "executor",
  "verifier",
  "reviewer",
  "auditor",
  "researcher",
  "custom",
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const AUTONOMY_LEVELS = [
  "LEVEL_0",
  "LEVEL_1",
  "LEVEL_2",
  "LEVEL_3",
  "LEVEL_4",
] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const DATA_SCOPES = [
  "public",
  "organization",
  "project",
  "workflow",
  "task",
  "sensitive",
  "restricted",
] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export const AGENT_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type AgentRiskLevel = (typeof AGENT_RISK_LEVELS)[number];

export const AGENT_STATUSES = [
  "draft",
  "active",
  "suspended",
  "revoked",
  "archived",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export type Agent = {
  agentId: string;
  orgId: string;
  owner: string;
  name: string;
  description: string;
  purpose: string;
  agentType: AgentType;
  autonomyLevel: AutonomyLevel;
  allowedModels: string[];
  allowedTools: string[];
  allowedActions: string[];
  dataScope: DataScope;
  riskLevel: AgentRiskLevel;
  status: AgentStatus;
  version: number;
  parentAgentId?: string | null;
  delegationChain: string[];
  createdAt: string;
  updatedAt: string;
};

export const CreateAgentSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(500).optional().default(""),
  purpose: z.string().trim().min(3, "Purpose must be at least 3 characters").max(1000),
  agentType: z.enum(AGENT_TYPES).default("custom"),
  autonomyLevel: z.enum(AUTONOMY_LEVELS).default("LEVEL_1"),
  allowedModels: z
    .array(z.string().trim().max(100))
    .refine(
      (models) => models.every((m) => MODEL_IDS.includes(m as (typeof MODEL_IDS)[number]) || m.includes("/")),
      { message: "Allowed models must contain valid registered model identifiers" }
    )
    .default([]),
  allowedTools: z.array(z.string().trim().max(100)).default([]),
  allowedActions: z.array(z.string().trim().max(100)).default([]),
  dataScope: z.enum(DATA_SCOPES).default("organization"),
  riskLevel: z.enum(AGENT_RISK_LEVELS).default("low"),
  status: z.enum(["draft", "active"]).default("active"),
  parentAgentId: z.string().max(80).optional().nullable(),
});

export const UpdateAgentSchema = CreateAgentSchema.partial().extend({
  status: z.enum(AGENT_STATUSES).optional(),
});
