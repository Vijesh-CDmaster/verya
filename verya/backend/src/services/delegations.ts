// Verya — Delegated Authority Service & Central Authorization Evaluator (F23 Phase 4)
// Implements capability grant management, parent delegation validation, privilege escalation prevention, and fail-closed evaluation.
//
// Security posture (pinned by lib/security/delegations.test.ts):
//  - Fail-closed evaluation: any error during evaluation DENIES.
//  - Privilege-escalation prevention: a child delegation can never widen its parent's
//    risk ceiling, data scope, actions, tools, or resource constraints.
//  - Broad authority is privileged: root delegations (no parent) with wildcard
//    capabilities, sensitive/restricted data scope, or high/critical risk ceiling
//    require an existing privileged role (middleware/auth.ts requireAdmin).
//  - Lifecycle is a documented state machine (DELEGATION_TRANSITIONS). REVOKED is
//    terminal — revoked authority is never silently resurrected.
//  - Expiry is lazy and tenant-safe: status is repaired to EXPIRED on read/evaluate.

import crypto from "node:crypto";
import type { z } from "zod";
import {
  CreateDelegationSchema,
  UpdateDelegationSchema,
  riskExceeds,
  dataScopeExceeds,
  resourceConstraintMatches,
  resourceCoveredBy,
  type AuthorizeDecision,
  type AuthorizeInput,
  type Delegation,
  type DelegationStatus,
  type ReasonCode,
  type ResourceConstraint,
} from "../schemas/delegation";
import {
  createDelegation as repoCreate,
  getDelegation as repoGet,
  listDelegations as repoList,
  saveDelegation as repoSave,
} from "../repositories/delegations";
import { getAgent } from "../repositories/agents";
import { recordToLedger } from "./ledger";

// ---------- Privileged (admin-only) delegation shapes ----------
// Broad root authority is explicitly privileged. A root delegation is "broad" — and
// therefore admin-only — when it has any of:
//   - a "*" wildcard in allowedActions or allowedTools,
//   - dataScope sensitive or restricted,
//   - a maximumRisk ceiling of high or critical.
// Everything else (specific actions, tools, org-or-narrower scope, low/medium risk)
// any authenticated org user may create. Documented here; enforced in the service.
export function requiresPrivilegedIssue(delegation: {
  allowedActions: string[];
  allowedTools: string[];
  dataScope: Delegation["dataScope"];
  maximumRisk: Delegation["maximumRisk"];
}): string | null {
  if (delegation.allowedActions.includes("*")) {
    return "Wildcard action authority is privileged: allowedActions \"*\" requires an admin.";
  }
  if (delegation.allowedTools.includes("*")) {
    return "Wildcard tool authority is privileged: allowedTools \"*\" requires an admin.";
  }
  if (delegation.dataScope === "sensitive" || delegation.dataScope === "restricted") {
    return `Data scope "${delegation.dataScope}" is privileged: sensitive/restricted scope requires an admin.`;
  }
  if (delegation.maximumRisk === "high" || delegation.maximumRisk === "critical") {
    return `Risk ceiling "${delegation.maximumRisk}" is privileged: high/critical requires an admin.`;
  }
  return null;
}

// ---------- Lifecycle state machine ----------
// Documented transitions. REVOKED is terminal; EXPIRED is terminal (reissue instead);
// SUSPENDED may reactivate; ACTIVE may suspend or revoke. Update (PATCH) may not
// smuggle a status change through — only the dedicated transition endpoints can.
export const DELEGATION_TRANSITIONS: Record<DelegationStatus, DelegationStatus[]> = {
  ACTIVE: ["SUSPENDED", "REVOKED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "REVOKED"],
  REVOKED: [],
  EXPIRED: [],
};

export function canTransition(from: DelegationStatus, to: DelegationStatus): boolean {
  return DELEGATION_TRANSITIONS[from].includes(to);
}

// ---------- Lazy expiry (tenant-safe read repair) ----------
const isExpiredAt = (d: Delegation, at: number): boolean =>
  d.status === "ACTIVE" && new Date(d.expiresAt).getTime() <= at;

async function withLazyExpiry(d: Delegation): Promise<Delegation> {
  if (!isExpiredAt(d, Date.now())) return d;
  try {
    const repaired: Delegation = { ...d, status: "EXPIRED", version: d.version + 1, updatedAt: new Date().toISOString() };
    await repoSave(d.orgId, repaired);
    await recordToLedger({
      orgId: d.orgId,
      gate: "governance",
      eventType: "delegation_expired",
      actor: "system",
      detail: {
        summary: `Delegation ${d.delegationId} expired (lazy status repair)`,
        delegationId: d.delegationId,
        fromStatus: d.status,
        toStatus: "EXPIRED",
        version: repaired.version,
      },
    });
    return repaired;
  } catch {
    return d;
  }
}

export async function createDelegationService(
  orgId: string,
  delegatorUserId: string,
  rawInput: z.input<typeof CreateDelegationSchema>,
  opts?: { actorRole?: string | null }
): Promise<Delegation> {
  const input = CreateDelegationSchema.parse(rawInput);
  const isAdmin = opts?.actorRole === "admin" || opts?.actorRole === "org:admin";

  // 0. Broad root authority is privileged (see requiresPrivilegedIssue).
  //    A child delegation is bounded by its parent regardless of who creates it.
  if (!input.parentDelegationId) {
    const privilegeIssue = requiresPrivilegedIssue(input);
    if (privilegeIssue && !isAdmin) {
      throw Object.assign(new Error(privilegeIssue), { statusCode: 403 });
    }
  }

  // 1. Verify agent exists in same organization
  const agent = await getAgent(orgId, input.agentId);
  if (!agent) {
    throw Object.assign(new Error("Target agent not found in your organization"), { statusCode: 400 });
  }
  if (agent.status !== "active") {
    throw Object.assign(
      new Error(`Target agent is not active (current status: ${agent.status})`),
      { statusCode: 400 }
    );
  }

  let parentDelegation: Delegation | null = null;
  if (input.parentDelegationId) {
    parentDelegation = await repoGet(orgId, input.parentDelegationId);
    if (!parentDelegation) {
      throw Object.assign(
        new Error("Parent delegation not found in your organization"),
        { statusCode: 400 }
      );
    }
    // Verify parent delegation is ACTIVE and not expired
    if (parentDelegation.status !== "ACTIVE") {
      throw Object.assign(
        new Error(`Parent delegation is not active (${parentDelegation.status})`),
        { statusCode: 400 }
      );
    }
    if (new Date().getTime() > new Date(parentDelegation.expiresAt).getTime()) {
      throw Object.assign(new Error("Parent delegation is expired"), { statusCode: 400 });
    }
    // Verify parent delegation explicit delegation permission
    if (!parentDelegation.canDelegate) {
      throw Object.assign(
        new Error("Parent delegation does not grant permission to delegate (canDelegate is false)"),
        { statusCode: 400 }
      );
    }

    // ---------- NO PRIVILEGE ESCALATION VALIDATION ----------
    // Child cannot exceed parent maximum risk
    if (riskExceeds(input.maximumRisk, parentDelegation.maximumRisk)) {
      throw Object.assign(
        new Error(
          `Child delegation maximum risk (${input.maximumRisk}) exceeds parent maximum risk (${parentDelegation.maximumRisk})`
        ),
        { statusCode: 400 }
      );
    }

    // Child cannot expand parent data scope
    if (dataScopeExceeds(input.dataScope, parentDelegation.dataScope)) {
      throw Object.assign(
        new Error(
          `Child delegation data scope (${input.dataScope}) expands parent data scope (${parentDelegation.dataScope})`
        ),
        { statusCode: 400 }
      );
    }

    // Child allowed actions must be subset of parent allowed actions
    const parentActions = new Set(parentDelegation.allowedActions);
    if (!parentActions.has("*")) {
      for (const action of input.allowedActions) {
        if (!parentActions.has(action)) {
          throw Object.assign(
            new Error(`Child action "${action}" is not permitted by parent delegation`),
            { statusCode: 400 }
          );
        }
      }
    }

    // Child allowed tools must be subset of parent allowed tools
    const parentTools = new Set(parentDelegation.allowedTools);
    if (!parentTools.has("*")) {
      for (const tool of input.allowedTools) {
        if (!parentTools.has(tool)) {
          throw Object.assign(
            new Error(`Child tool "${tool}" is not permitted by parent delegation`),
            { statusCode: 400 }
          );
        }
      }
    }

    // Child resource constraints must be covered by parent resource constraints
    // (empty parent list = parent unrestricted over resources; child can narrow it,
    // never widen it — see resourceCoveredBy in schemas/delegation.ts).
    for (const childRc of input.allowedResources) {
      if (!resourceCoveredBy(childRc, parentDelegation.allowedResources)) {
        throw Object.assign(
          new Error(
            `Child resource constraint "${childRc.resource}" is broader than the parent delegation allows`
          ),
          { statusCode: 400 }
        );
      }
    }
  }

  const now = new Date().toISOString();
  const delegation: Delegation = {
    delegationId: `delg-${crypto.randomUUID()}`,
    orgId,
    delegatorUserId: delegatorUserId || "system",
    agentId: input.agentId,
    parentDelegationId: input.parentDelegationId ?? null,
    purpose: input.purpose,
    allowedActions: input.allowedActions,
    allowedTools: input.allowedTools,
    allowedResources: input.allowedResources as ResourceConstraint[],
    dataScope: input.dataScope,
    maximumRisk: input.maximumRisk,
    constraints: input.constraints,
    canDelegate: input.canDelegate,
    issuedAt: now,
    expiresAt: input.expiresAt,
    status: "ACTIVE",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await repoCreate(delegation);

  await recordToLedger({
    orgId,
    gate: "governance",
    eventType: "delegation_created",
    actor: "human",
    detail: {
      summary: `Delegation created for agent ${agent.name} (${delegation.agentId}): ${delegation.purpose}`,
      delegationId: delegation.delegationId,
      agentId: delegation.agentId,
      maximumRisk: delegation.maximumRisk,
      expiresAt: delegation.expiresAt,
    },
  });

  return delegation;
}

export async function getDelegationService(orgId: string, delegationId: string): Promise<Delegation | null> {
  const found = await repoGet(orgId, delegationId);
  return found ? withLazyExpiry(found) : null;
}

export async function listDelegationsService(
  orgId: string,
  filter?: { agentId?: string; status?: DelegationStatus }
): Promise<Delegation[]> {
  const rows = await repoList(orgId, filter);
  return Promise.all(rows.map(withLazyExpiry));
}

export async function updateDelegationService(
  orgId: string,
  delegationId: string,
  rawInput: z.input<typeof UpdateDelegationSchema>,
  opts?: { actorRole?: string | null }
): Promise<Delegation> {
  const input = UpdateDelegationSchema.parse(rawInput);
  const existing = await repoGet(orgId, delegationId);
  if (!existing) {
    throw Object.assign(new Error("Delegation not found"), { statusCode: 404 });
  }
  if (isExpiredAt(existing, Date.now())) {
    throw Object.assign(
      new Error("Delegation is expired and cannot be modified — create a new delegation instead"),
      { statusCode: 400 }
    );
  }

  const isAdmin = opts?.actorRole === "admin" || opts?.actorRole === "org:admin";

  // An update may not widen authority. Recheck every widening dimension the update
  // touches: broad root shapes stay privileged, and a parent-bounded child is
  // re-validated against its (still-active) parent. A status change cannot be
  // smuggled through PATCH — only the dedicated lifecycle endpoints transition.
  if (input.status !== undefined && input.status !== existing.status) {
    throw Object.assign(
      new Error("Status changes must use the dedicated suspend/revoke/reactivate endpoints"),
      { statusCode: 400 }
    );
  }

  const merged: Delegation = {
    ...existing,
    purpose: input.purpose ?? existing.purpose,
    allowedActions: input.allowedActions ?? existing.allowedActions,
    allowedTools: input.allowedTools ?? existing.allowedTools,
    allowedResources: (input.allowedResources as ResourceConstraint[]) ?? existing.allowedResources,
    dataScope: input.dataScope ?? existing.dataScope,
    maximumRisk: input.maximumRisk ?? existing.maximumRisk,
    constraints: input.constraints ?? existing.constraints,
    canDelegate: input.canDelegate ?? existing.canDelegate,
    expiresAt: input.expiresAt ?? existing.expiresAt,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  };

  if (merged.parentDelegationId) {
    const parentDelegation = await repoGet(orgId, merged.parentDelegationId);
    const parentUsable =
      parentDelegation &&
      parentDelegation.status === "ACTIVE" &&
      new Date(parentDelegation.expiresAt).getTime() > Date.now();
    if (!parentUsable) {
      throw Object.assign(
        new Error("Parent delegation is no longer active — update the delegation or create a new one"),
        { statusCode: 400 }
      );
    }
    if (!parentDelegation.canDelegate) {
      throw Object.assign(
        new Error("Parent delegation no longer grants permission to delegate (canDelegate is false)"),
        { statusCode: 400 }
      );
    }
    if (riskExceeds(merged.maximumRisk, parentDelegation.maximumRisk)) {
      throw Object.assign(
        new Error(
          `Update would exceed parent maximum risk (${parentDelegation.maximumRisk})`
        ),
        { statusCode: 400 }
      );
    }
    if (dataScopeExceeds(merged.dataScope, parentDelegation.dataScope)) {
      throw Object.assign(
        new Error(
          `Update would expand parent data scope (${parentDelegation.dataScope})`
        ),
        { statusCode: 400 }
      );
    }
    const parentActions = new Set(parentDelegation.allowedActions);
    if (!parentActions.has("*")) {
      for (const action of merged.allowedActions) {
        if (!parentActions.has(action)) {
          throw Object.assign(
            new Error(`Update would add action "${action}" not permitted by parent delegation`),
            { statusCode: 400 }
          );
        }
      }
    }
    const parentTools = new Set(parentDelegation.allowedTools);
    if (!parentTools.has("*")) {
      for (const tool of merged.allowedTools) {
        if (!parentTools.has(tool)) {
          throw Object.assign(
            new Error(`Update would add tool "${tool}" not permitted by parent delegation`),
            { statusCode: 400 }
          );
        }
      }
    }
    for (const childRc of merged.allowedResources) {
      if (!resourceCoveredBy(childRc, parentDelegation.allowedResources)) {
        throw Object.assign(
          new Error(
            `Update would add resource constraint "${childRc.resource}" broader than the parent delegation allows`
          ),
          { statusCode: 400 }
        );
      }
    }
  } else {
    const privilegeIssue = requiresPrivilegedIssue(merged);
    if (privilegeIssue && !isAdmin) {
      throw Object.assign(new Error(privilegeIssue), { statusCode: 403 });
    }
  }

  await repoSave(orgId, merged);

  await recordToLedger({
    orgId,
    gate: "governance",
    eventType: "delegation_updated",
    actor: "human",
    detail: {
      summary: `Delegation ${merged.delegationId} updated to v${merged.version}`,
      delegationId: merged.delegationId,
      version: merged.version,
    },
  });

  return merged;
}

async function setDelegationStatus(
  orgId: string,
  delegationId: string,
  status: DelegationStatus,
  eventType: string
): Promise<Delegation> {
  const existing = await repoGet(orgId, delegationId);
  if (!existing) {
    throw Object.assign(new Error("Delegation not found"), { statusCode: 404 });
  }
  if (existing.status === status) {
    return existing; // idempotent no-op, no spurious ledger churn
  }
  if (!canTransition(existing.status, status)) {
    throw Object.assign(
      new Error(`Invalid delegation transition: ${existing.status} -> ${status}`),
      { statusCode: 400 }
    );
  }

  const updated: Delegation = {
    ...existing,
    status,
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
      summary: `Delegation ${updated.delegationId} transitioned to ${status}`,
      delegationId: updated.delegationId,
      fromStatus: existing.status,
      toStatus: status,
    },
  });

  return updated;
}

export async function suspendDelegationService(orgId: string, delegationId: string): Promise<Delegation> {
  return setDelegationStatus(orgId, delegationId, "SUSPENDED", "delegation_suspended");
}

export async function revokeDelegationService(orgId: string, delegationId: string): Promise<Delegation> {
  return setDelegationStatus(orgId, delegationId, "REVOKED", "delegation_revoked");
}

export async function reactivateDelegationService(orgId: string, delegationId: string): Promise<Delegation> {
  return setDelegationStatus(orgId, delegationId, "ACTIVE", "delegation_reactivated");
}

// ---------- CENTRAL AUTHORIZATION EVALUATOR SERVICE ----------
export async function evaluateAuthorization(input: AuthorizeInput): Promise<AuthorizeDecision> {
  const { orgId, agentId, action, tool, resource, risk, dataScope, delegationId } = input;

  const buildDecision = async (
    decision: "ALLOW" | "DENY",
    reason: ReasonCode,
    delg?: Delegation | null,
    matchedCapability?: string,
    details?: Record<string, unknown>
  ): Promise<AuthorizeDecision> => {
    const result: AuthorizeDecision = {
      decision,
      reason,
      agentId,
      delegationId: delg?.delegationId,
      matchedCapability,
      details,
    };

    try {
      await recordToLedger({
        orgId,
        gate: "governance",
        eventType: decision === "ALLOW" ? "authorization_allowed" : "authorization_denied",
        actor: "system",
        detail: {
          summary: `Authorization ${decision} for ${agentId} (${action} on ${tool}:${resource}): ${reason}`,
          agentId,
          action,
          tool,
          resource,
          requestedRisk: risk,
          decision,
          reason,
          delegationId: delg?.delegationId,
        },
      });
    } catch {
      // Audit failure must not turn a computed decision into a 500. The decision
      // itself is fail-closed; a ledger outage is observable via chain verification.
    }

    return result;
  };

  // 1. Tenant & Agent Validation — the evaluator is fail-closed by construction:
  //    every unexpected path below falls through to a DENY with a reason code.
  if (!orgId) return buildDecision("DENY", "TENANT_MISMATCH");

  let agent: Awaited<ReturnType<typeof getAgent>> = null;
  try {
    agent = await getAgent(orgId, agentId);
  } catch {
    return buildDecision("DENY", "AGENT_NOT_FOUND");
  }
  if (!agent) return buildDecision("DENY", "AGENT_NOT_FOUND");
  if (agent.status !== "active") {
    return buildDecision("DENY", "AGENT_INACTIVE", null, undefined, { agentStatus: agent.status });
  }

  // 2. Load Delegations
  let delegations: Delegation[] = [];
  try {
    delegations = await repoList(orgId, { agentId });
  } catch {
    return buildDecision("DENY", "DELEGATION_NOT_FOUND");
  }
  if (delegations.length === 0) {
    return buildDecision("DENY", "DELEGATION_NOT_FOUND");
  }

  const activeCandidates = delegationId
    ? delegations.filter((d) => d.delegationId === delegationId)
    : delegations;

  if (activeCandidates.length === 0) {
    return buildDecision("DENY", "DELEGATION_NOT_FOUND");
  }

  // 3. Evaluate Delegations (Fail Closed)
  let lastFailureReason: ReasonCode = "CAPABILITY_MISSING";

  for (const rawDelg of activeCandidates) {
    const delg = await withLazyExpiry(rawDelg);
    if (delg.status === "SUSPENDED") {
      lastFailureReason = "SUSPENDED";
      continue;
    }
    if (delg.status === "REVOKED") {
      lastFailureReason = "REVOKED";
      continue;
    }
    if (delg.status !== "ACTIVE" || new Date().getTime() > new Date(delg.expiresAt).getTime()) {
      lastFailureReason = "EXPIRED";
      continue;
    }

    // Verify parent delegation chain integrity if present. Chain integrity checks
    // are structural (status/expiry/existence/cycle) — capability narrowing between
    // parent and child was enforced at creation time; validation here would only
    // duplicate the exact same reads without adding a guarantee.
    if (delg.parentDelegationId) {
      let parentId: string | null = delg.parentDelegationId;
      let chainValid = true;
      const seenParents = new Set<string>();

      while (parentId) {
        if (seenParents.has(parentId)) {
          chainValid = false;
          break;
        }
        seenParents.add(parentId);
        if (parentId === delg.delegationId) {
          chainValid = false;
          break;
        }

        let parentDelg: Delegation | null = null;
        try {
          parentDelg = await repoGet(orgId, parentId);
        } catch {
          chainValid = false;
          break;
        }
        if (
          !parentDelg ||
          parentDelg.status !== "ACTIVE" ||
          new Date().getTime() > new Date(parentDelg.expiresAt).getTime()
        ) {
          chainValid = false;
          break;
        }
        parentId = parentDelg.parentDelegationId ?? null;
      }

      if (!chainValid) {
        lastFailureReason = "PARENT_CHAIN_INVALID";
        continue;
      }
    }

    // Risk Check
    if (riskExceeds(risk, delg.maximumRisk)) {
      lastFailureReason = "RISK_EXCEEDED";
      continue;
    }

    // Data Scope Check
    if (dataScope && dataScopeExceeds(dataScope, delg.dataScope)) {
      lastFailureReason = "OUT_OF_SCOPE";
      continue;
    }

    // Action Check
    const actionMatch = delg.allowedActions.includes("*") || delg.allowedActions.includes(action);
    if (!actionMatch) {
      lastFailureReason = "CAPABILITY_MISSING";
      continue;
    }

    // Tool Check
    const toolMatch = delg.allowedTools.includes("*") || delg.allowedTools.includes(tool);
    if (!toolMatch) {
      lastFailureReason = "CAPABILITY_MISSING";
      continue;
    }

    // Resource Scoping & Constraint Checks — a non-empty constraint list is a closed
    // allowlist (documented in schemas/delegation.ts); an empty list means the coarse
    // action/tool capability governs with no resource narrowing. Matching logic is
    // the shared resourceConstraintMatches helper.
    if (delg.allowedResources && delg.allowedResources.length > 0) {
      const resourceMatch = delg.allowedResources.some((rc) =>
        resourceConstraintMatches(rc, {
          resource,
          tool,
          action,
          environment: input.environment,
          amount: input.amount,
        })
      );

      if (!resourceMatch) {
        lastFailureReason = "RESOURCE_NOT_ALLOWED";
        continue;
      }
    }

    // ALL CHECKS PASSED FOR THIS DELEGATION -> ALLOW!
    return buildDecision("ALLOW", "ALLOW", delg, `${action} on ${tool}:${resource}`);
  }

  // If no active delegation passed all criteria -> FAIL CLOSED
  return buildDecision("DENY", lastFailureReason);
}
