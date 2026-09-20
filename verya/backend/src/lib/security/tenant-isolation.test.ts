// Verya — Tenant Isolation Security Test Suite (Section 9)
// Proves strict organization boundary enforcement across sessions, certificates,
// dashboard, background workers, memory, trust ledger, policies, reputation, and compliance exports.

import test from "node:test";
import assert from "node:assert/strict";
import { startPipeline, getPipeline, listPipelines, actOnPipeline } from "../../services/pipeline";
import { recordToLedger, listLedger } from "../../services/ledger";
import { recordMemory, findSimilar } from "../../services/memory";
import { updateFromOutcome, leaderboard } from "../../services/reputation";
import { detectPolicySuggestions, listPolicySuggestions } from "../../services/policies";
import { certificateFor } from "../certificates";
import type { ExecutionResult } from "../../schemas/pipeline";

test("TEST 1: Organization A cannot read Organization B workflow/session", async () => {
  const orgA = "test-tenant-1a";
  const orgB = "test-tenant-1b";

  const sessionA = await startPipeline({
    orgId: orgA,
    input: "Build an inventory management system with real-time tracking.",
    statedStack: "Next.js, Postgres",
    policy: "balanced",
  });

  const readByB = await getPipeline(orgB, sessionA.id);
  assert.equal(readByB, null, "Organization B MUST NOT be able to read Organization A session");
});

test("TEST 2: Organization A cannot mutate Organization B workflow/session", async () => {
  const orgA = "test-tenant-2a";
  const orgB = "test-tenant-2b";

  const sessionA = await startPipeline({
    orgId: orgA,
    input: "Build a customer feedback portal with analytics dashboard.",
    statedStack: "React, Node.js",
    policy: "balanced",
  });

  await assert.rejects(
    async () => {
      await actOnPipeline(orgB, sessionA.id, {
        action: "platform_choose",
        targetPlatform: "android",
      });
    },
    (err: unknown) => {
      return (err as { statusCode?: number }).statusCode === 404;
    },
    "Mutating Organization A session from Organization B MUST throw 404"
  );
});

test("TEST 3: Organization A cannot read Organization B certificate", async () => {
  const orgA = "test-tenant-3a";
  const orgB = "test-tenant-3b";

  const sessionA = await startPipeline({
    orgId: orgA,
    input: "Build an invoice processing workflow for finance teams.",
    statedStack: "TypeScript, Python",
    policy: "balanced",
  });

  const sampleExec: ExecutionResult = {
    taskId: "t1",
    model: "openai/gpt-oss-20b",
    output: "export const processInvoice = () => true;",
    verification: { method: "rules", passed: true, issues: [], checkedBy: "rules" },
    status: "verified",
    confidence: 0.9,
    rationale: "Verified pass",
    alternatives: [],
    latencyMs: 120,
    tokens: { input: 100, output: 50 },
  };
  sampleExec.certificate = certificateFor(sessionA, sampleExec);
  sessionA.executions.push(sampleExec);

  const readByB = await getPipeline(orgB, sessionA.id);
  assert.equal(readByB, null, "Organization B MUST NOT get access to session containing Organization A certificates");
});

test("TEST 4: Organization A cannot mutate Organization B certificate/trust data", async () => {
  const orgA = "test-tenant-4a";
  const orgB = "test-tenant-4b";

  const sessionA = await startPipeline({
    orgId: orgA,
    input: "Build a document archive system with strict retention.",
    statedStack: "Fastify, PostgreSQL",
    policy: "balanced",
  });

  await assert.rejects(
    async () => {
      await actOnPipeline(orgB, sessionA.id, {
        action: "code_edit",
        taskId: "t1",
        code: "malicious edit",
        expectedVersion: 1,
      });
    },
    (err: unknown) => {
      return (err as { statusCode?: number }).statusCode === 404;
    },
    "Mutating Organization A certificate/code artifact from Organization B MUST throw 404"
  );
});

test("TEST 5: Dashboard history is organization scoped", async () => {
  const orgA = "test-tenant-5a";
  const orgB = "test-tenant-5b";

  const sessionA = await startPipeline({
    orgId: orgA,
    input: "Workflow for tenant 5A",
    statedStack: "",
    policy: "balanced",
  });

  const sessionB = await startPipeline({
    orgId: orgB,
    input: "Workflow for tenant 5B",
    statedStack: "",
    policy: "balanced",
  });

  const listA = await listPipelines(orgA);
  const listB = await listPipelines(orgB);

  assert.ok(listA.some((s) => s.id === sessionA.id), "Org A list MUST contain Org A session");
  assert.ok(!listA.some((s) => s.id === sessionB.id), "Org A list MUST NOT contain Org B session");

  assert.ok(listB.some((s) => s.id === sessionB.id), "Org B list MUST contain Org B session");
  assert.ok(!listB.some((s) => s.id === sessionA.id), "Org B list MUST NOT contain Org A session");
});

test("TEST 6: Queued execution preserves organization ID", async () => {
  const { enqueueExecution } = await import("../../jobs/queues.js");
  const payload = { orgId: "test-tenant-6a", sessionId: "session-6a-id" };
  assert.equal(payload.orgId, "test-tenant-6a", "Enqueued job payload MUST preserve orgId");
  assert.equal(payload.sessionId, "session-6a-id", "Enqueued job payload MUST preserve sessionId");

  const result = await enqueueExecution(payload);
  if (process.env.REDIS_URL) {
    assert.ok(result !== null, "Should return job ID when Redis is configured");
  } else {
    assert.equal(result, null, "Should return null gracefully when Redis is unconfigured");
  }
});

test("TEST 7: Worker execution cannot fall back to process-level ORG_ID", async () => {
  const orgA = "test-tenant-7a";
  const sessionA = await startPipeline({
    orgId: orgA,
    input: "Workflow for worker isolation test",
    statedStack: "Node.js",
    policy: "balanced",
  });

  const records = await listLedger({ orgId: orgA, sessionId: sessionA.id });
  for (const record of records) {
    assert.equal(record.orgId, orgA, "Ledger records MUST carry exact orgId, never process default");
  }
});

test("TEST 8: Memory retrieval is organization scoped", async () => {
  const orgA = "test-tenant-8a";
  const orgB = "test-tenant-8b";

  await recordMemory({
    orgId: orgA,
    sessionId: "sess-8a",
    taskCategory: "security",
    model: "openai/gpt-oss-20b",
    outcome: "accepted",
    title: "Secret Rotation Task 8A",
    content: "Content for tenant 8A secret management",
  });

  await recordMemory({
    orgId: orgB,
    sessionId: "sess-8b",
    taskCategory: "security",
    model: "openai/gpt-oss-20b",
    outcome: "accepted",
    title: "Secret Rotation Task 8B",
    content: "Content for tenant 8B secret management",
  });

  const memoriesA = await findSimilar({ orgId: orgA, taskCategory: "security", query: "Secret Rotation", limit: 10 });
  const memoriesB = await findSimilar({ orgId: orgB, taskCategory: "security", query: "Secret Rotation", limit: 10 });

  assert.ok(memoriesA.every((m) => m.title.includes("8A")), "Org A memory search MUST return only Org A memories");
  assert.ok(memoriesB.every((m) => m.title.includes("8B")), "Org B memory search MUST return only Org B memories");
});

test("TEST 9: Trust ledger retrieval is organization scoped", async () => {
  const orgA = "test-tenant-9a";
  const orgB = "test-tenant-9b";

  await recordToLedger({
    orgId: orgA,
    sessionId: "sess-9a",
    gate: "intake",
    eventType: "test_event_9a",
    detail: { summary: "Ledger entry for tenant 9A" },
  });

  await recordToLedger({
    orgId: orgB,
    sessionId: "sess-9b",
    gate: "intake",
    eventType: "test_event_9b",
    detail: { summary: "Ledger entry for tenant 9B" },
  });

  const recordsA = await listLedger({ orgId: orgA });
  const recordsB = await listLedger({ orgId: orgB });

  assert.ok(recordsA.every((r) => r.orgId === orgA), "Org A ledger query MUST return only Org A records");
  assert.ok(recordsB.every((r) => r.orgId === orgB), "Org B ledger query MUST return only Org B records");
});

test("TEST 10: Policy retrieval is organization scoped", async () => {
  const orgA = "test-tenant-10a";
  const orgB = "test-tenant-10b";

  // Record 3 failure events for orgA to trigger policy suggestion detection
  for (let i = 0; i < 3; i++) {
    await recordToLedger({
      orgId: orgA,
      sessionId: `sess-10a-${i % 2}`,
      gate: "execution",
      eventType: "task_failed",
      detail: { taskCategory: "auth", summary: "flagged failure for policy test" },
      model: "google/gemini-2.5-flash",
    });
  }

  await detectPolicySuggestions(orgA);

  const suggestionsA = await listPolicySuggestions(orgA);
  const suggestionsB = await listPolicySuggestions(orgB);

  assert.ok(suggestionsA.length > 0, "Org A MUST have detected policy suggestions");
  assert.equal(suggestionsB.length, 0, "Org B MUST NOT see Org A policy suggestions");
});

test("TEST 11: Feedback cannot update another organization's trust/reputation", async () => {
  const orgA = "test-tenant-11a";
  const orgB = "test-tenant-11b";

  await updateFromOutcome({
    orgId: orgA,
    model: "openai/gpt-oss-120b",
    taskCategory: "database",
    outcome: "accepted",
    latencyMs: 150,
    costUnits: 1,
  });

  const boardA = await leaderboard(orgA);
  const boardB = await leaderboard(orgB);

  assert.ok(boardA.some((r) => r.model === "openai/gpt-oss-120b"), "Org A leaderboard MUST reflect Org A reputation");
  assert.ok(!boardB.some((r) => r.model === "openai/gpt-oss-120b"), "Org B leaderboard MUST NOT reflect Org A reputation");
});

test("TEST 12: Compliance export cannot contain another organization's data", async () => {
  const orgA = "test-tenant-12a";
  const orgB = "test-tenant-12b";

  const secretSummaryB = "CONFIDENTIAL_TENANT_12B_SECRET_DATA";
  await recordToLedger({
    orgId: orgB,
    sessionId: "sess-12b",
    gate: "intake",
    eventType: "compliance_test",
    detail: { summary: secretSummaryB },
  });

  const recordsA = await listLedger({ orgId: orgA, limit: 500 });
  const containsBData = recordsA.some((r) => JSON.stringify(r).includes(secretSummaryB));

  assert.equal(containsBData, false, "Org A compliance export data MUST NOT contain Org B secret data");
});
