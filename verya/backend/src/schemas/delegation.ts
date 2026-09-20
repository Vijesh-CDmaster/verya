// Verya — Delegated Authority Schemas & Types (F23 Phase 4)
import { z } from "zod";
import { AGENT_RISK_LEVELS, DATA_SCOPES, type AgentRiskLevel, type DataScope } from "./agent";

export const DELEGATION_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"] as const;
export type DelegationStatus = (typeof DELEGATION_STATUSES)[number];

export const RISK_WEIGHTS: Record<AgentRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const DATA_SCOPE_WEIGHTS: Record<DataScope, number> = {
  public: 1,
  task: 2,
  workflow: 3,
  project: 4,
  organization: 5,
  sensitive: 6,
  restricted: 7,
};

export type ResourceConstraint = {
  resource: string;
  tool?: string;
  action?: string;
  environment?: string;
  maxAmount?: number;
};

/**
 * Resource constraints are an OPTIONAL narrowing layer on top of allowed_actions /
 * allowed_tools (Phase 4 security semantics, pinned by tests):
 *  - An EMPTY allowedResources array means "no resource restriction" BY DESIGN — actions
 *    and tools still gate access, so the coarse capability remains explicit.
 *  - A NON-EMPTY list is a closed allowlist: the request must match at least one
 *    constraint; there is no implicit "allow the rest".
 *  - resource "*" matches anything; "prefix:*" matches by prefix.
 *  - environment/maxAmount on a constraint only bind when the request carries an
 *    environment / amount.
 */

export type Delegation = {
  delegationId: string;
  orgId: string;
  delegatorUserId: string;
  agentId: string;
  parentDelegationId?: string | null;
  purpose: string;
  allowedActions: string[];
  allowedTools: string[];
  allowedResources: ResourceConstraint[];
  dataScope: DataScope;
  maximumRisk: AgentRiskLevel;
  constraints: Record<string, unknown>;
  canDelegate: boolean;
  issuedAt: string;
  expiresAt: string;
  status: DelegationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export const ResourceConstraintSchema = z.object({
  resource: z.string().trim().min(1, "Resource identifier required").max(200),
  tool: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  environment: z.string().trim().max(100).optional(),
  maxAmount: z.number().min(0).optional(),
});

export const CreateDelegationSchema = z.object({
  agentId: z.string().min(1, "Agent ID is required").max(100),
  parentDelegationId: z.string().max(100).optional().nullable(),
  purpose: z.string().trim().min(3, "Purpose must be at least 3 characters").max(1000),
  allowedActions: z.array(z.string().trim().max(100)).min(1, "At least one allowed action is required"),
  allowedTools: z.array(z.string().trim().max(100)).min(1, "At least one allowed tool is required"),
  allowedResources: z.array(ResourceConstraintSchema).default([]),
  dataScope: z.enum(DATA_SCOPES).default("organization"),
  maximumRisk: z.enum(AGENT_RISK_LEVELS).default("low"),
  constraints: z.record(z.string(), z.unknown()).default({}),
  canDelegate: z.boolean().default(false),
  expiresAt: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: "Invalid expiration ISO date string" })
    .refine((val) => Date.parse(val) > Date.now(), {
      message: "expiresAt must be in the future — use the update endpoint to expire an existing delegation",
    }),
});

export const UpdateDelegationSchema = CreateDelegationSchema.partial().extend({
  status: z.enum(DELEGATION_STATUSES).optional(),
});

export type ReasonCode =
  | "ALLOW"
  | "TENANT_MISMATCH"
  | "AGENT_NOT_FOUND"
  | "AGENT_INACTIVE"
  | "DELEGATION_NOT_FOUND"
  | "DELEGATION_INVALID"
  | "SUSPENDED"
  | "REVOKED"
  | "EXPIRED"
  | "RISK_EXCEEDED"
  | "OUT_OF_SCOPE"
  | "CAPABILITY_MISSING"
  | "RESOURCE_NOT_ALLOWED"
  | "ENVIRONMENT_MISMATCH"
  | "AMOUNT_EXCEEDED"
  | "PARENT_CHAIN_INVALID";

export const AuthorizeRequestSchema = z.object({
  agentId: z.string().min(1, "Agent ID required"),
  action: z.string().min(1, "Action required"),
  tool: z.string().min(1, "Tool required"),
  resource: z.string().min(1, "Resource required"),
  risk: z.enum(AGENT_RISK_LEVELS).default("low"),
  dataScope: z.enum(DATA_SCOPES).optional(),
  purpose: z.string().optional(),
  delegationId: z.string().optional(),
  environment: z.string().optional(),
  amount: z.number().optional(),
});

export type AuthorizeInput = z.infer<typeof AuthorizeRequestSchema> & {
  orgId: string;
};

export type AuthorizeDecision = {
  decision: "ALLOW" | "DENY";
  reason: ReasonCode;
  agentId: string;
  delegationId?: string;
  matchedCapability?: string;
  details?: Record<string, unknown>;
};

export function riskExceeds(requestedRisk: AgentRiskLevel, maxRisk: AgentRiskLevel): boolean {
  return RISK_WEIGHTS[requestedRisk] > RISK_WEIGHTS[maxRisk];
}

export function dataScopeExceeds(requestedScope: DataScope, allowedScope: DataScope): boolean {
  return DATA_SCOPE_WEIGHTS[requestedScope] > DATA_SCOPE_WEIGHTS[allowedScope];
}

export type ResourceRequestContext = {
  resource: string;
  tool: string;
  action: string;
  environment?: string;
  amount?: number;
};

/**
 * Single source of truth for resource-constraint matching (shared by the central
 * authorization evaluator and delegation-creation privilege validation, so the two
 * can never disagree).
 */
export function resourceConstraintMatches(rc: ResourceConstraint, ctx: ResourceRequestContext): boolean {
  const resOk =
    rc.resource === "*" ||
    rc.resource === ctx.resource ||
    (rc.resource.endsWith("*") && ctx.resource.startsWith(rc.resource.slice(0, -1)));
  const toolOk = !rc.tool || rc.tool === "*" || rc.tool === ctx.tool;
  const actionOk = !rc.action || rc.action === "*" || rc.action === ctx.action;
  const envOk = !rc.environment || !ctx.environment || rc.environment === ctx.environment;
  const amountOk = rc.maxAmount === undefined || ctx.amount === undefined || ctx.amount <= rc.maxAmount;
  return resOk && toolOk && actionOk && envOk && amountOk;
}

/**
 * Privilege-escalation prevention for resources: a child constraint is covered when at
 * least one parent constraint admits everything the child constraint admits. An
 * unrestricted child dimension (tool/action/environment/maxAmount absent) requires the
 * parent to be unrestricted on that dimension too — the child can never widen the parent.
 * An empty parent list means the parent is unrestricted over resources (documented above),
 * so any child constraint is covered.
 */
export function resourceCoveredBy(child: ResourceConstraint, parents: ResourceConstraint[]): boolean {
  if (parents.length === 0) return true;
  return parents.some((p) => {
    const resOk =
      p.resource === "*" ||
      p.resource === child.resource ||
      (p.resource.endsWith("*") && child.resource.startsWith(p.resource.slice(0, -1)));
    if (!resOk) return false;
    if (!child.tool) {
      if (p.tool && p.tool !== "*") return false;
    } else if (p.tool && p.tool !== "*" && p.tool !== child.tool) {
      return false;
    }
    if (!child.action) {
      if (p.action && p.action !== "*") return false;
    } else if (p.action && p.action !== "*" && p.action !== child.action) {
      return false;
    }
    if (p.environment && child.environment !== p.environment) return false;
    if (child.maxAmount === undefined) {
      if (p.maxAmount !== undefined) return false;
    } else if (p.maxAmount !== undefined && child.maxAmount > p.maxAmount) {
      return false;
    }
    return true;
  });
}
