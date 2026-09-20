// Verya — Delegated Authority Security & Lifecycle Test Suite (F23 Phase 4)
// Verifies creation, read, list, update, suspend, revoke, reactivate, tenant isolation,
// privilege-escalation prevention (risk/data/actions/tools/resources), the privileged
// broad-root rule, the lifecycle state machine, lazy expiry, resource constraints,
// fail-closed authorization, and audit-event generation.

import test from "node:test";
import assert from "node:assert/strict";
import {
  createDelegationService,
  getDelegationService,
  listDelegationsService,
  updateDelegationService,
  suspendDelegationService,
  revokeDelegationService,
  reactivateDelegationService,
  evaluateAuthorization,
} from "../../services/delegations";
import { createAgentService } from "../../services/agents";
import { listLedger } from "../../services/ledger";
import {
  CreateDelegationSchema,
  resourceConstraintMatches,
  resourceCoveredBy,
} from "../../schemas/delegation";

const FUTURE = (hours = 24) => new Date(Date.now() + hours * 3_600_000).toISOString();

type DelegationInput = Parameters<typeof createDelegationService>[2];

const baseInput: DelegationInput = {
  agentId: "",
  purpose: "Test delegation purpose",
  allowedActions: ["read", "analyze"],
  allowedTools: ["postgres"],
  allowedResources: [],
  dataScope: "organization",
  maximumRisk: "low",
  constraints: {},
  canDelegate: false,
  expiresAt: FUTURE(),
};

const statusCodeOf = (err: unknown): number => (err as { statusCode?: number }).statusCode ?? -1;

async function makeAgent(orgId: string, name: string): Promise<string> {
  const agent = await createAgentService(orgId, "test-user", {
    name,
    purpose: "Delegation test agent",
    agentType: "executor",
    autonomyLevel: "LEVEL_2",
    allowedModels: [],
    allowedTools: ["postgres"],
    allowedActions: ["read", "analyze"],
    dataScope: "organization",
    riskLevel: "medium",
    status: "active",
  });
  return agent.agentId;
}

// ---------- CRUD & lifecycle ----------

test("TEST 1: Create delegation", async () => {
  const orgId = "delg-test-org-1";
  const agentId = await makeAgent(orgId, "Create Delegation Agent");
  const d = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  assert.ok(d.delegationId.startsWith("delg-"), "Delegation ID must be server generated");
  assert.equal(d.status, "ACTIVE");
  assert.equal(d.version, 1);
  assert.equal(d.orgId, orgId);
});

test("TEST 2: Get delegation", async () => {
  const orgId = "delg-test-org-2";
  const agentId = await makeAgent(orgId, "Get Delegation Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  const fetched = await getDelegationService(orgId, created.delegationId);
  assert.ok(fetched, "Must fetch created delegation");
  assert.equal(fetched?.delegationId, created.delegationId);
  assert.deepEqual(fetched?.allowedActions, ["read", "analyze"]);
});

test("TEST 3: List delegations (and agentId filter)", async () => {
  const orgId = "delg-test-org-3";
  const agentA = await makeAgent(orgId, "List Agent A");
  const agentB = await makeAgent(orgId, "List Agent B");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId: agentA });
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId: agentB });

  const all = await listDelegationsService(orgId);
  assert.ok(all.length >= 2, "List must return created delegations");
  const forA = await listDelegationsService(orgId, { agentId: agentA });
  assert.ok(forA.every((d) => d.agentId === agentA) && forA.length >= 1, "agentId filter works");
});

test("TEST 4: Update delegation increments version and preserves shape", async () => {
  const orgId = "delg-test-org-4";
  const agentId = await makeAgent(orgId, "Update Delegation Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  const updated = await updateDelegationService(orgId, created.delegationId, {
    purpose: "Narrowed update purpose",
  });
  assert.equal(updated.purpose, "Narrowed update purpose");
  assert.equal(updated.version, 2, "Update must increment version");
});

test("TEST 5: Suspend delegation", async () => {
  const orgId = "delg-test-org-5";
  const agentId = await makeAgent(orgId, "Suspend Delegation Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  const suspended = await suspendDelegationService(orgId, created.delegationId);
  assert.equal(suspended.status, "SUSPENDED");
  assert.equal(suspended.version, 2);
});

test("TEST 6: Revoke delegation", async () => {
  const orgId = "delg-test-org-6";
  const agentId = await makeAgent(orgId, "Revoke Delegation Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  const revoked = await revokeDelegationService(orgId, created.delegationId);
  assert.equal(revoked.status, "REVOKED");
  assert.equal(revoked.version, 2);
});

test("TEST 7: Reactivate suspended delegation", async () => {
  const orgId = "delg-test-org-7";
  const agentId = await makeAgent(orgId, "Reactivate Delegation Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  await suspendDelegationService(orgId, created.delegationId);
  const reactivated = await reactivateDelegationService(orgId, created.delegationId);
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(reactivated.version, 3);
});

// ---------- Lifecycle state machine ----------

test("TEST 8: REVOKED is terminal — reactivate is rejected", async () => {
  const orgId = "delg-test-org-8";
  const agentId = await makeAgent(orgId, "Terminal Revoked Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  await revokeDelegationService(orgId, created.delegationId);
  await assert.rejects(
    () => reactivateDelegationService(orgId, created.delegationId),
    (err: unknown) => statusCodeOf(err) === 400,
    "Revoked authority must never be silently resurrected"
  );
});

test("TEST 9: EXPIRED is terminal — reactivate is rejected", async () => {
  const orgId = "delg-test-org-9";
  const agentId = await makeAgent(orgId, "Terminal Expired Agent");
  const created = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    expiresAt: new Date(Date.now() + 50).toISOString(),
  });
  await new Promise((r) => setTimeout(r, 80));
  const repaired = await getDelegationService(orgId, created.delegationId);
  assert.equal(repaired?.status, "EXPIRED", "Lazy expiry must repair status on read");
  await assert.rejects(
    () => reactivateDelegationService(orgId, created.delegationId),
    (err: unknown) => statusCodeOf(err) === 400,
    "Expired authority must not be resurrected — reissue instead"
  );
});

test("TEST 10: PATCH cannot smuggle a status change", async () => {
  const orgId = "delg-test-org-10";
  const agentId = await makeAgent(orgId, "Patch Status Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  await assert.rejects(
    () => updateDelegationService(orgId, created.delegationId, { status: "REVOKED" }),
    (err: unknown) => statusCodeOf(err) === 400,
    "Status must only change through lifecycle endpoints"
  );
});

// ---------- Tenant isolation ----------

test("TEST 11: Org A cannot read Org B delegation", async () => {
  const orgA = "delg-test-org-11a";
  const orgB = "delg-test-org-11b";
  const agentId = await makeAgent(orgA, "Secret Delegation Agent");
  const created = await createDelegationService(orgA, "user-1", { ...baseInput, agentId });
  const readByB = await getDelegationService(orgB, created.delegationId);
  assert.equal(readByB, null, "Org B MUST NOT read Org A delegation");
});

test("TEST 12: Org A cannot modify Org B delegation", async () => {
  const orgA = "delg-test-org-12a";
  const orgB = "delg-test-org-12b";
  const agentId = await makeAgent(orgA, "Cross Modify Agent");
  const created = await createDelegationService(orgA, "user-1", { ...baseInput, agentId });
  await assert.rejects(
    () => updateDelegationService(orgB, created.delegationId, { purpose: "Hacked purpose" }),
    (err: unknown) => statusCodeOf(err) === 404,
    "Org B update of Org A delegation MUST 404"
  );
});

test("TEST 13: Org A cannot revoke Org B delegation", async () => {
  const orgA = "delg-test-org-13a";
  const orgB = "delg-test-org-13b";
  const agentId = await makeAgent(orgA, "Cross Revoke Agent");
  const created = await createDelegationService(orgA, "user-1", { ...baseInput, agentId });
  await assert.rejects(
    () => revokeDelegationService(orgB, created.delegationId),
    (err: unknown) => statusCodeOf(err) === 404,
    "Org B revoke of Org A delegation MUST 404"
  );
});

test("TEST 14: Org A cannot use Org B parent delegation", async () => {
  const orgA = "delg-test-org-14a";
  const orgB = "delg-test-org-14b";
  const agentB = await makeAgent(orgB, "Cross Parent Agent");
  const parent = await createDelegationService(orgB, "user-1", {
    ...baseInput,
    agentId: agentB,
    canDelegate: true,
  });
  const agentA = await makeAgent(orgA, "Cross Child Agent");
  await assert.rejects(
    () => createDelegationService(orgA, "user-1", { ...baseInput, agentId: agentA, parentDelegationId: parent.delegationId }),
    (err: unknown) => statusCodeOf(err) === 400,
    "Cross-tenant parent delegation MUST be rejected"
  );
});

// ---------- Privilege-escalation prevention (hierarchy) ----------

test("TEST 15: Child cannot exceed parent risk", async () => {
  const orgId = "delg-test-org-15";
  const agentId = await makeAgent(orgId, "Escalate Risk Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    maximumRisk: "low",
    canDelegate: true,
  });
  await assert.rejects(
    () =>
      createDelegationService(orgId, "user-1", {
        ...baseInput,
        agentId,
        maximumRisk: "high",
        parentDelegationId: parent.delegationId,
      }),
    (err: unknown) => statusCodeOf(err) === 400
  );
});

test("TEST 16: Child cannot expand parent data scope", async () => {
  const orgId = "delg-test-org-16";
  const agentId = await makeAgent(orgId, "Escalate Scope Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    dataScope: "task",
    canDelegate: true,
  });
  await assert.rejects(
    () =>
      createDelegationService(orgId, "user-1", {
        ...baseInput,
        agentId,
        dataScope: "organization",
        parentDelegationId: parent.delegationId,
      }),
    (err: unknown) => statusCodeOf(err) === 400
  );
});

test("TEST 17: Child cannot add parent actions", async () => {
  const orgId = "delg-test-org-17";
  const agentId = await makeAgent(orgId, "Escalate Action Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    allowedActions: ["read"],
    canDelegate: true,
  });
  await assert.rejects(
    () =>
      createDelegationService(orgId, "user-1", {
        ...baseInput,
        agentId,
        allowedActions: ["read", "write"],
        parentDelegationId: parent.delegationId,
      }),
    (err: unknown) => statusCodeOf(err) === 400
  );
});

test("TEST 18: Child cannot add parent tools", async () => {
  const orgId = "delg-test-org-18";
  const agentId = await makeAgent(orgId, "Escalate Tool Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    allowedTools: ["postgres"],
    canDelegate: true,
  });
  await assert.rejects(
    () =>
      createDelegationService(orgId, "user-1", {
        ...baseInput,
        agentId,
        allowedTools: ["postgres", "github"],
        parentDelegationId: parent.delegationId,
      }),
    (err: unknown) => statusCodeOf(err) === 400
  );
});

test("TEST 19: Child cannot expand parent resources", async () => {
  const orgId = "delg-test-org-19";
  const agentId = await makeAgent(orgId, "Escalate Resource Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    allowedResources: [{ resource: "db:payments" }],
    canDelegate: true,
  });
  await assert.rejects(
    () =>
      createDelegationService(orgId, "user-1", {
        ...baseInput,
        agentId,
        allowedResources: [{ resource: "db:*" }],
        parentDelegationId: parent.delegationId,
      }),
    (err: unknown) => statusCodeOf(err) === 400,
    "Child resource constraint broader than parent MUST be rejected"
  );
});

test("TEST 20: Child cannot delegate without parent canDelegate", async () => {
  const orgId = "delg-test-org-20";
  const agentId = await makeAgent(orgId, "No Subdelegate Agent");
  const parent = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    canDelegate: false,
  });
  await assert.rejects(
    () =>
      createDelegationService(orgId, "user-1", {
        ...baseInput,
        agentId,
        parentDelegationId: parent.delegationId,
      }),
    (err: unknown) => statusCodeOf(err) === 400
  );
});

test("TEST 21: No escalation through multiple delegation levels", async () => {
  const orgId = "delg-test-org-21";
  const agentId = await makeAgent(orgId, "Multi Level Agent");
  const grandparent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    maximumRisk: "low",
    dataScope: "task",
    canDelegate: true,
  });
  const parent = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    maximumRisk: "low",
    dataScope: "task",
    canDelegate: true,
    parentDelegationId: grandparent.delegationId,
  });
  // Level 2 child attempts to regain the level the grandparent holds at L1 —
  // bounded by its immediate parent, it must be rejected.
  await assert.rejects(
    () =>
      createDelegationService(orgId, "user-1", {
        ...baseInput,
        agentId,
        maximumRisk: "low",
        dataScope: "workflow",
        parentDelegationId: parent.delegationId,
      }),
    (err: unknown) => statusCodeOf(err) === 400,
    "A deeper child must stay bounded by its immediate parent"
  );
});

test("TEST 22: Revoked parent invalidates child authorization (chain check)", async () => {
  const orgId = "delg-test-org-22";
  const agentId = await makeAgent(orgId, "Revoked Chain Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    canDelegate: true,
  });
  const child = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    parentDelegationId: parent.delegationId,
  });
  await revokeDelegationService(orgId, parent.delegationId);

  // The child (no independent grant of its own) MUST be denied because its parent
  // chain is broken; without a parent reference the grant would wrongly ALLOW.
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
    delegationId: child.delegationId,
  });
  assert.equal(decision.decision, "DENY", "Revoked ancestor must invalidate the chain");
  assert.equal(decision.reason, "PARENT_CHAIN_INVALID");
  assert.equal(child.status, "ACTIVE", "Child row itself is untouched — the chain check denies");
});

test("TEST 23: Expired parent invalidates child authorization (chain check)", async () => {
  const orgId = "delg-test-org-23";
  const agentId = await makeAgent(orgId, "Expired Chain Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    canDelegate: true,
    expiresAt: FUTURE(1),
  });
  const child = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    parentDelegationId: parent.delegationId,
    expiresAt: FUTURE(48),
  });
  // Deterministic time travel: backdate the parent's expiry in the store instead of
  // sleeping past a short window (sleeps are flaky under load). The store write
  // mirrors what lazy expiry would observe at evaluation time.
  const { devGetDelegation, devSaveDelegation } = await import("../../db/devstore.js");
  const stored = await devGetDelegation(orgId, parent.delegationId);
  assert.ok(stored, "parent delegation must exist in the devstore");
  if (stored) {
    stored.expiresAt = new Date(Date.now() - 3_600_000).toISOString();
    await devSaveDelegation(orgId, stored);
  }

  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
    delegationId: child.delegationId,
  });
  assert.equal(decision.decision, "DENY", "Expired ancestor must invalidate the chain");
  assert.equal(decision.reason, "PARENT_CHAIN_INVALID");
});

// ---------- Privileged broad-root rule ----------

test("TEST 24: Wildcard root delegation without role is rejected", async () => {
  const orgId = "delg-test-org-24";
  const agentId = await makeAgent(orgId, "Wildcard Root Agent");
  await assert.rejects(
    () => createDelegationService(orgId, "user-1", { ...baseInput, agentId, allowedActions: ["*"], allowedTools: ["*"] }),
    (err: unknown) => statusCodeOf(err) === 403,
    "Wildcard root authority is admin-only"
  );
});

test("TEST 25: Critical-risk root delegation without role is rejected; admin succeeds", async () => {
  const orgId = "delg-test-org-25";
  const agentId = await makeAgent(orgId, "Critical Root Agent");
  await assert.rejects(
    () => createDelegationService(orgId, "user-1", { ...baseInput, agentId, maximumRisk: "critical" }),
    (err: unknown) => statusCodeOf(err) === 403
  );
  const adminMade = await createDelegationService(
    orgId,
    "admin",
    { ...baseInput, agentId, maximumRisk: "critical" },
    { actorRole: "org:admin" }
  );
  assert.equal(adminMade.maximumRisk, "critical");
});

test("TEST 26: Restricted data scope root requires admin; child of admin grant does not", async () => {
  const orgId = "delg-test-org-26";
  const agentId = await makeAgent(orgId, "Restricted Scope Agent");
  await assert.rejects(
    () => createDelegationService(orgId, "user-1", { ...baseInput, agentId, dataScope: "restricted" }),
    (err: unknown) => statusCodeOf(err) === 403
  );
  const parent = await createDelegationService(
    orgId,
    "admin",
    { ...baseInput, agentId, dataScope: "restricted", maximumRisk: "high", canDelegate: true },
    { actorRole: "org:admin" }
  );
  // A child narrowing an admin-created broad parent is fine — it cannot exceed the parent.
  const child = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    dataScope: "sensitive",
    maximumRisk: "medium",
    parentDelegationId: parent.delegationId,
  });
  assert.equal(child.dataScope, "sensitive");
});

test("TEST 27: Specific narrow root delegation is allowed for ordinary users", async () => {
  const orgId = "delg-test-org-27";
  const agentId = await makeAgent(orgId, "Narrow Root Agent");
  const d = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    allowedActions: ["read"],
    allowedTools: ["postgres"],
    dataScope: "task",
    maximumRisk: "low",
  });
  assert.equal(d.status, "ACTIVE");
});

// ---------- Central authorization evaluator ----------

test("TEST 28: Valid capability -> ALLOW", async () => {
  const orgId = "delg-test-org-28";
  const agentId = await makeAgent(orgId, "Allow Path Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "ALLOW");
  assert.equal(decision.reason, "ALLOW");
});

test("TEST 29: Missing action -> DENY", async () => {
  const orgId = "delg-test-org-29";
  const agentId = await makeAgent(orgId, "Missing Action Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId, allowedActions: ["read"] });
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "write",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "CAPABILITY_MISSING");
});

test("TEST 30: Wrong tool -> DENY", async () => {
  const orgId = "delg-test-org-30";
  const agentId = await makeAgent(orgId, "Wrong Tool Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId, allowedTools: ["postgres"] });
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "github",
    resource: "repo:verya",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "CAPABILITY_MISSING");
});

test("TEST 31: Resource outside constraints -> DENY; inside -> ALLOW", async () => {
  const orgId = "delg-test-org-31";
  const agentId = await makeAgent(orgId, "Resource Scope Agent");
  await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    allowedResources: [{ resource: "db:payments" }],
  });
  const denied = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:users",
    risk: "low",
  });
  assert.equal(denied.decision, "DENY");
  assert.equal(denied.reason, "RESOURCE_NOT_ALLOWED");
  const allowed = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:payments",
    risk: "low",
  });
  assert.equal(allowed.decision, "ALLOW");
});

test("TEST 32: Wrong data scope -> DENY", async () => {
  const orgId = "delg-test-org-32";
  const agentId = await makeAgent(orgId, "Wrong Scope Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId, dataScope: "task" });
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
    dataScope: "organization",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "OUT_OF_SCOPE");
});

test("TEST 33: Excessive risk -> DENY", async () => {
  const orgId = "delg-test-org-33";
  const agentId = await makeAgent(orgId, "Excessive Risk Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId, maximumRisk: "low" });
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "high",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "RISK_EXCEEDED");
});

test("TEST 34: Expired -> DENY (and lazily repaired to EXPIRED)", async () => {
  const orgId = "delg-test-org-34";
  const agentId = await makeAgent(orgId, "Expiry Eval Agent");
  await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    expiresAt: new Date(Date.now() + 50).toISOString(),
  });
  await new Promise((r) => setTimeout(r, 80));
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "EXPIRED");
  const rows = await listDelegationsService(orgId, { agentId });
  assert.equal(rows[0]?.status, "EXPIRED", "Lazy repair persists the EXPIRED status");
});

test("TEST 35: Revoked -> DENY", async () => {
  const orgId = "delg-test-org-35";
  const agentId = await makeAgent(orgId, "Revoked Eval Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  await revokeDelegationService(orgId, created.delegationId);
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "REVOKED");
});

test("TEST 36: Suspended -> DENY", async () => {
  const orgId = "delg-test-org-36";
  const agentId = await makeAgent(orgId, "Suspended Eval Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  await suspendDelegationService(orgId, created.delegationId);
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "SUSPENDED");
});

test("TEST 37: Inactive agent -> DENY", async () => {
  const orgId = "delg-test-org-37";
  const agentId = await makeAgent(orgId, "Inactive Eval Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  await import("../../services/agents.js").then((m) => m.suspendAgentService(orgId, agentId));
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "AGENT_INACTIVE");
});

test("TEST 38: Unknown agent -> DENY", async () => {
  const decision = await evaluateAuthorization({
    orgId: "delg-test-org-38",
    agentId: "agent-does-not-exist",
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "AGENT_NOT_FOUND");
});

test("TEST 39: Unknown delegationId -> DENY", async () => {
  const orgId = "delg-test-org-39";
  const agentId = await makeAgent(orgId, "Unknown Delg Eval Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  const decision = await evaluateAuthorization({
    orgId,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
    delegationId: "delg-not-a-real-id",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "DELEGATION_NOT_FOUND");
});

test("TEST 40: Tenant mismatch -> DENY (evaluation is org-scoped)", async () => {
  const orgA = "delg-test-org-40a";
  const orgB = "delg-test-org-40b";
  const agentId = await makeAgent(orgA, "Tenant Eval Agent");
  await createDelegationService(orgA, "user-1", { ...baseInput, agentId });
  const decision = await evaluateAuthorization({
    orgId: orgB,
    agentId,
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "AGENT_NOT_FOUND", "Org B must not even see Org A's agent");
});

test("TEST 41: Fail closed — empty orgId denies", async () => {
  const decision = await evaluateAuthorization({
    orgId: "",
    agentId: "agent-x",
    action: "read",
    tool: "postgres",
    resource: "db:main",
    risk: "low",
  });
  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reason, "TENANT_MISMATCH");
});

// ---------- Resource constraint semantics ----------

test("TEST 42: resourceConstraintMatches — wildcard, prefix, environment, amount", () => {
  const ctx = { resource: "db:payments/eu", tool: "postgres", action: "read" };
  assert.equal(resourceConstraintMatches({ resource: "*" }, ctx), true);
  assert.equal(resourceConstraintMatches({ resource: "db:payments*" }, ctx), true);
  assert.equal(resourceConstraintMatches({ resource: "db:payments/eu" }, ctx), true);
  assert.equal(resourceConstraintMatches({ resource: "db:other" }, ctx), false);
  // tool/action binding on the constraint
  assert.equal(resourceConstraintMatches({ resource: "*", tool: "github" }, ctx), false);
  assert.equal(resourceConstraintMatches({ resource: "*", action: "write" }, ctx), false);
  // environment binds only when the request carries one
  assert.equal(resourceConstraintMatches({ resource: "*", environment: "prod" }, ctx), true);
  assert.equal(
    resourceConstraintMatches({ resource: "*", environment: "prod" }, { ...ctx, environment: "staging" }),
    false
  );
  // amount binds only when the request carries one
  assert.equal(resourceConstraintMatches({ resource: "*", maxAmount: 100 }, ctx), true);
  assert.equal(
    resourceConstraintMatches({ resource: "*", maxAmount: 100 }, { ...ctx, amount: 150 }),
    false
  );
});

test("TEST 43: resourceCoveredBy — child cannot widen parent constraints", () => {
  // Parent unrestricted (empty list) covers any child.
  assert.equal(resourceCoveredBy({ resource: "db:*" }, []), true);
  // Exact and prefix coverage.
  assert.equal(resourceCoveredBy({ resource: "db:payments" }, [{ resource: "db:*" }]), true);
  assert.equal(resourceCoveredBy({ resource: "db:*" }, [{ resource: "db:payments" }]), false);
  // Unrestricted child tool needs unrestricted parent tool.
  assert.equal(resourceCoveredBy({ resource: "*" }, [{ resource: "*", tool: "github" }]), false);
  assert.equal(resourceCoveredBy({ resource: "*", tool: "github" }, [{ resource: "*", tool: "github" }]), true);
  // Amount ceiling cannot be raised.
  assert.equal(resourceCoveredBy({ resource: "*" }, [{ resource: "*", maxAmount: 10 }]), false);
  assert.equal(
    resourceCoveredBy({ resource: "*", maxAmount: 5 }, [{ resource: "*", maxAmount: 10 }]),
    true
  );
});

// ---------- Validation & audit ----------

test("TEST 44: expiresAt must be in the future at creation", () => {
  const result = CreateDelegationSchema.safeParse({
    ...baseInput,
    agentId: "agent-x",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal(result.success, false, "Past expiresAt MUST be rejected by Zod");
});

test("TEST 45: Audit events recorded across the lifecycle", async () => {
  const orgId = "delg-test-org-45";
  const agentId = await makeAgent(orgId, "Audited Delegation Agent");
  const created = await createDelegationService(orgId, "user-1", { ...baseInput, agentId });
  await updateDelegationService(orgId, created.delegationId, { purpose: "Audited updated purpose" });
  await suspendDelegationService(orgId, created.delegationId);
  await reactivateDelegationService(orgId, created.delegationId);
  await revokeDelegationService(orgId, created.delegationId);

  const eventTypes = ["delegation_created", "delegation_updated", "delegation_suspended", "delegation_reactivated", "delegation_revoked"];
  for (const eventType of eventTypes) {
    const records = await listLedger({ orgId, eventType });
    assert.ok(
      records.some((r) => (r.detail as { delegationId?: string })?.delegationId === created.delegationId),
      `Ledger must contain ${eventType} for the audited delegation`
    );
  }
});

test("TEST 46: Authorization decisions are ledgered (ALLOW and DENY)", async () => {
  const orgId = "delg-test-org-46";
  const agentId = await makeAgent(orgId, "Audited Eval Agent");
  await createDelegationService(orgId, "user-1", { ...baseInput, agentId, allowedActions: ["read"] });

  await evaluateAuthorization({ orgId, agentId, action: "read", tool: "postgres", resource: "db:main", risk: "low" });
  await evaluateAuthorization({ orgId, agentId, action: "write", tool: "postgres", resource: "db:main", risk: "low" });

  const allowed = await listLedger({ orgId, eventType: "authorization_allowed" });
  const denied = await listLedger({ orgId, eventType: "authorization_denied" });
  assert.ok(allowed.some((r) => (r.detail as { agentId?: string })?.agentId === agentId), "ALLOW must be ledgered");
  assert.ok(denied.some((r) => (r.detail as { agentId?: string })?.agentId === agentId), "DENY must be ledgered");
});

test("TEST 47: Delegation creation cannot use an inactive agent", async () => {
  const orgId = "delg-test-org-47";
  const agentId = await makeAgent(orgId, "Inactive Target Agent");
  await import("../../services/agents.js").then((m) => m.suspendAgentService(orgId, agentId));
  await assert.rejects(
    () => createDelegationService(orgId, "user-1", { ...baseInput, agentId }),
    (err: unknown) => statusCodeOf(err) === 400,
    "Delegating to a non-active agent MUST be rejected"
  );
});

test("TEST 48: Update re-validates against parent (cannot widen via update)", async () => {
  const orgId = "delg-test-org-48";
  const agentId = await makeAgent(orgId, "Update Escalation Agent");
  const parent = await createDelegationService(orgId, "admin", {
    ...baseInput,
    agentId,
    allowedActions: ["read"],
    maximumRisk: "low",
    canDelegate: true,
  });
  const child = await createDelegationService(orgId, "user-1", {
    ...baseInput,
    agentId,
    allowedActions: ["read"],
    parentDelegationId: parent.delegationId,
  });
  await assert.rejects(
    () => updateDelegationService(orgId, child.delegationId, { allowedActions: ["read", "write"] }),
    (err: unknown) => statusCodeOf(err) === 400,
    "Update MUST NOT add actions the parent never granted"
  );
  await assert.rejects(
    () => updateDelegationService(orgId, child.delegationId, { maximumRisk: "high" }),
    (err: unknown) => statusCodeOf(err) === 400,
    "Update MUST NOT raise the risk ceiling beyond the parent"
  );
});
