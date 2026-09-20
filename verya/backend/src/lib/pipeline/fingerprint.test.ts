// F19 regression tests — deterministic Task DNA fingerprints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintTask, refreshTaskFingerprints } from "./fingerprint";
import type { PipelineSession, Task, Workflow } from "../../schemas/pipeline";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Build the authentication API",
    description: "Add password hashing and session tokens for the login endpoint.",
    category: "auth",
    dependsOn: [],
    complexity: "high",
    risk: "high",
    ...over,
  } as Task;
}

function workflow(tasks: Task[], over: Partial<Workflow> = {}): Workflow {
  return {
    title: "Customer portal",
    summary: "A customer portal with sign-in, billing and support tickets.",
    tasks,
    ambiguities: [],
    ...over,
  } as Workflow;
}

test("fingerprint is stable for identical input and carries all dimensions", () => {
  const a = fingerprintTask(workflow([task()]), task());
  const b = fingerprintTask(workflow([task()]), task());
  assert.equal(a.signature, b.signature);
  assert.equal(a.signature.length, 16);
  assert.equal(a.version, 1);
  assert.equal(a.domain, "auth");
  assert.equal(a.risk, "high");
  assert.equal(a.reasoningRequirement, "deep");
  assert.ok(a.requiredCapabilities.includes("authentication"));
  assert.ok(a.requiredCapabilities.includes("verification"));
});

test("changing the task description changes the signature", () => {
  const base = fingerprintTask(workflow([task()]), task());
  const changed = fingerprintTask(
    workflow([task({ description: "Add a marketing landing page with three hero variants." })]),
    task({ description: "Add a marketing landing page with three hero variants." })
  );
  assert.notEqual(base.signature, changed.signature);
});

test("low-risk, low-complexity work fingerprints as direct reasoning with small context", () => {
  const fp = fingerprintTask(
    workflow([task({ complexity: "low", risk: "low", title: "Write README docs", description: "Draft usage docs." })]),
    task({ complexity: "low", risk: "low", title: "Write README docs", description: "Draft usage docs." })
  );
  assert.equal(fp.reasoningRequirement, "direct");
  assert.equal(fp.contextSize, "small");
  assert.equal(fp.outputFormat, "text");
});

test("refreshTaskFingerprints backfills every task and the session map", () => {
  const tasks = [task({ id: "t1" }), task({ id: "t2", dependsOn: ["t1"], category: "database" })];
  const session = {
    id: "s1",
    workflow: workflow(tasks),
    algorithms: null,
  } as unknown as PipelineSession;

  refreshTaskFingerprints(session);

  assert.ok(session.taskFingerprints);
  assert.deepEqual(Object.keys(session.taskFingerprints!).sort(), ["t1", "t2"]);
  assert.equal(session.workflow!.tasks[0]!.fingerprint!.signature, session.taskFingerprints!.t1!.signature);
  // Older sessions without a workflow must not crash — nothing to backfill.
  const empty = { id: "s2", workflow: null } as unknown as PipelineSession;
  assert.doesNotThrow(() => refreshTaskFingerprints(empty));
});
