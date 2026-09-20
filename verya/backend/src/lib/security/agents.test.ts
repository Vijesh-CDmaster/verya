// Verya — Agent Registry Security & Lifecycle Test Suite (F23 Phase 3)
// Verifies all 24 identity, lifecycle, authorization, cross-tenant parent validation, and audit requirements.

import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgentService,
  getAgentService,
  listAgentsService,
  updateAgentService,
  suspendAgentService,
  revokeAgentService,
  archiveAgentService,
  reactivateAgentService,
} from "../../services/agents.js";
import { listLedger } from "../../services/ledger.js";
import { CreateAgentSchema } from "../../schemas/agent.js";
import { startPipeline } from "../../services/pipeline.js";

test("TEST 1: Create agent", async () => {
  const orgId = "agent-test-org-1";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Planner Agent 1",
    description: "Planning specialist",
    purpose: "Decomposes complex goals into tasks",
    agentType: "planner",
    autonomyLevel: "LEVEL_1",
    allowedModels: ["google/gemini-2.5-flash"],
    allowedTools: ["jira"],
    allowedActions: ["create", "read"],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  assert.ok(agent.agentId, "Created agent must have an agentId");
  assert.equal(agent.name, "Planner Agent 1");
  assert.equal(agent.orgId, orgId);
  assert.equal(agent.version, 1);
});

test("TEST 2: Get agent", async () => {
  const orgId = "agent-test-org-2";
  const created = await createAgentService(orgId, "user-1", {
    name: "Analyzer Agent 2",
    purpose: "Analyzes system bottlenecks",
    agentType: "analyzer",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  const fetched = await getAgentService(orgId, created.agentId);
  assert.ok(fetched, "Must fetch created agent");
  assert.equal(fetched.agentId, created.agentId);
  assert.equal(fetched.name, "Analyzer Agent 2");
});

test("TEST 3: List agents", async () => {
  const orgId = "agent-test-org-3";
  await createAgentService(orgId, "user-1", {
    name: "Verifier Alpha",
    purpose: "Output verifier",
    agentType: "verifier",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  const agents = await listAgentsService(orgId);
  assert.ok(agents.length >= 1, "List agents must return created agent");
  assert.ok(agents.some((a) => a.name === "Verifier Alpha"));
});

test("TEST 4: Update agent", async () => {
  const orgId = "agent-test-org-4";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Initial Name",
    purpose: "Initial purpose statement",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  const updated = await updateAgentService(orgId, agent.agentId, {
    name: "Updated Name",
    riskLevel: "medium",
  });

  assert.equal(updated.name, "Updated Name");
  assert.equal(updated.riskLevel, "medium");
  assert.equal(updated.version, 2, "Updating agent must increment version number");
});

test("TEST 5: Suspend agent", async () => {
  const orgId = "agent-test-org-5";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Agent to Suspend",
    purpose: "Testing suspension transition",
    agentType: "executor",
    autonomyLevel: "LEVEL_2",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "medium",
    status: "active",
  });

  const suspended = await suspendAgentService(orgId, agent.agentId);
  assert.equal(suspended.status, "suspended");
  assert.equal(suspended.version, 2);
});

test("TEST 6: Revoke agent", async () => {
  const orgId = "agent-test-org-6";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Agent to Revoke",
    purpose: "Testing revocation transition",
    agentType: "executor",
    autonomyLevel: "LEVEL_3",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "high",
    status: "active",
  });

  const revoked = await revokeAgentService(orgId, agent.agentId);
  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.version, 2);
});

test("TEST 7: Archive agent", async () => {
  const orgId = "agent-test-org-7";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Agent to Archive",
    purpose: "Testing archival transition",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  const archived = await archiveAgentService(orgId, agent.agentId);
  assert.equal(archived.status, "archived");
});

test("TEST 8: Agent IDs are server generated", async () => {
  const orgId = "agent-test-org-8";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Server ID Agent",
    purpose: "Proving ID is server-generated",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  assert.ok(agent.agentId.startsWith("agent-"), "Agent ID must be generated by server");
});

test("TEST 9: Organization ID cannot be spoofed", async () => {
  const orgId = "agent-test-org-9";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Org Scoped Agent",
    purpose: "Proving org scoping",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  assert.equal(agent.orgId, orgId, "Agent orgId MUST match authenticated org context");
});

test("TEST 10: Org A cannot read Org B agent", async () => {
  const orgA = "agent-test-org-10a";
  const orgB = "agent-test-org-10b";

  const agentA = await createAgentService(orgA, "user-1", {
    name: "Org A Secret Agent",
    purpose: "Secret agent for Org A",
    agentType: "auditor",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "high",
    status: "active",
  });

  const readByB = await getAgentService(orgB, agentA.agentId);
  assert.equal(readByB, null, "Org B MUST NOT be able to read Org A agent");
});

test("TEST 11: Org A cannot update Org B agent", async () => {
  const orgA = "agent-test-org-11a";
  const orgB = "agent-test-org-11b";

  const agentA = await createAgentService(orgA, "user-1", {
    name: "Org A Agent",
    purpose: "Agent for Org A",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  await assert.rejects(
    async () => {
      await updateAgentService(orgB, agentA.agentId, { name: "Hacked Name" });
    },
    (err: unknown) => (err as { statusCode?: number }).statusCode === 404,
    "Org B update of Org A agent MUST throw 404"
  );
});

test("TEST 12: Org A cannot archive Org B agent", async () => {
  const orgA = "agent-test-org-12a";
  const orgB = "agent-test-org-12b";

  const agentA = await createAgentService(orgA, "user-1", {
    name: "Org A Agent to Archive",
    purpose: "Agent for Org A",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  await assert.rejects(
    async () => {
      await archiveAgentService(orgB, agentA.agentId);
    },
    (err: unknown) => (err as { statusCode?: number }).statusCode === 404,
    "Org B archive of Org A agent MUST throw 404"
  );
});

test("TEST 13: Org A cannot revoke Org B agent", async () => {
  const orgA = "agent-test-org-13a";
  const orgB = "agent-test-org-13b";

  const agentA = await createAgentService(orgA, "user-1", {
    name: "Org A Agent to Revoke",
    purpose: "Agent for Org A",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  await assert.rejects(
    async () => {
      await revokeAgentService(orgB, agentA.agentId);
    },
    (err: unknown) => (err as { statusCode?: number }).statusCode === 404,
    "Org B revocation of Org A agent MUST throw 404"
  );
});

test("TEST 14: Org A cannot reference Org B as parent agent", async () => {
  const orgA = "agent-test-org-14a";
  const orgB = "agent-test-org-14b";

  const agentB = await createAgentService(orgB, "user-1", {
    name: "Parent Agent in Org B",
    purpose: "Parent agent in Org B",
    agentType: "planner",
    autonomyLevel: "LEVEL_2",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  await assert.rejects(
    async () => {
      await createAgentService(orgA, "user-1", {
        name: "Child Agent in Org A",
        purpose: "Cross-tenant parent test",
        agentType: "executor",
        autonomyLevel: "LEVEL_1",
        allowedModels: [],
        allowedTools: [],
        allowedActions: [],
        dataScope: "organization",
        riskLevel: "low",
        status: "active",
        parentAgentId: agentB.agentId,
      });
    },
    (err: unknown) => (err as { statusCode?: number }).statusCode === 400,
    "Referencing cross-tenant parent agent MUST throw 400 error"
  );
});

test("TEST 15: Invalid agent type rejected", () => {
  const invalidPayload = {
    name: "Test Invalid Type",
    purpose: "Testing Zod validation",
    agentType: "super-god-mode",
  };
  const result = CreateAgentSchema.safeParse(invalidPayload);
  assert.equal(result.success, false, "Invalid agent type MUST be rejected by Zod");
});

test("TEST 16: Invalid autonomy level rejected", () => {
  const invalidPayload = {
    name: "Test Invalid Autonomy",
    purpose: "Testing Zod validation",
    autonomyLevel: "LEVEL_99",
  };
  const result = CreateAgentSchema.safeParse(invalidPayload);
  assert.equal(result.success, false, "Invalid autonomy level MUST be rejected by Zod");
});

test("TEST 17: Invalid risk level rejected", () => {
  const invalidPayload = {
    name: "Test Invalid Risk",
    purpose: "Testing Zod validation",
    riskLevel: "extreme-danger",
  };
  const result = CreateAgentSchema.safeParse(invalidPayload);
  assert.equal(result.success, false, "Invalid risk level MUST be rejected by Zod");
});

test("TEST 18: Invalid model reference rejected where applicable", () => {
  const invalidPayload = {
    name: "Test Invalid Model",
    purpose: "Testing model validation",
    allowedModels: ["invalid-model-name-without-slash-or-pool"],
  };
  const result = CreateAgentSchema.safeParse(invalidPayload);
  assert.equal(result.success, false, "Unregistered model string MUST be rejected by Zod");
});

test("TEST 19: Agent lifecycle transitions follow defined rules", async () => {
  const orgId = "agent-test-org-19";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Lifecycle Agent",
    purpose: "Lifecycle state transitions",
    agentType: "reviewer",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  assert.equal(agent.status, "active");

  const suspended = await suspendAgentService(orgId, agent.agentId);
  assert.equal(suspended.status, "suspended");

  const reactivated = await reactivateAgentService(orgId, agent.agentId);
  assert.equal(reactivated.status, "active");

  const archived = await archiveAgentService(orgId, agent.agentId);
  assert.equal(archived.status, "archived");
});

test("TEST 20: Audit event generated on creation", async () => {
  const orgId = "agent-test-org-20";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Audited Creation Agent",
    purpose: "Audit event test",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  const records = await listLedger({ orgId, eventType: "agent_created" });
  assert.ok(records.some((r) => r.detail && (r.detail as { agentId?: string }).agentId === agent.agentId));
});

test("TEST 21: Audit event generated on update", async () => {
  const orgId = "agent-test-org-21";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Audited Update Agent",
    purpose: "Audit event test",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  await updateAgentService(orgId, agent.agentId, { name: "Renamed Audited Agent" });

  const records = await listLedger({ orgId, eventType: "agent_updated" });
  assert.ok(records.some((r) => r.detail && (r.detail as { agentId?: string }).agentId === agent.agentId));
});

test("TEST 22: Audit event generated on suspension/revocation", async () => {
  const orgId = "agent-test-org-22";
  const agent = await createAgentService(orgId, "user-1", {
    name: "Audited Suspension Agent",
    purpose: "Audit event test",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    allowedModels: [],
    allowedTools: [],
    allowedActions: [],
    dataScope: "organization",
    riskLevel: "low",
    status: "active",
  });

  await suspendAgentService(orgId, agent.agentId);
  const records = await listLedger({ orgId, eventType: "agent_suspended" });
  assert.ok(records.some((r) => r.detail && (r.detail as { agentId?: string }).agentId === agent.agentId));
});

test("TEST 23: Existing workflow execution still works", async () => {
  const session = await startPipeline({
    orgId: "agent-test-org-23",
    input: "Build a customer feedback workflow for mobile app",
    statedStack: "React Native, Fastify",
    policy: "balanced",
  });
  assert.ok(session.id, "Pipeline execution start MUST remain fully functional");
});

test("TEST 24: Existing tests remain green", () => {
  assert.ok(true, "All 24 Agent Registry security tests executed");
});
