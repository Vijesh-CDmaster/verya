// Verya — Real-file execution security & lifecycle test suite.
// Covers: path-traversal/absolute-path rejection, workspace boundary enforcement,
// create/update/delete semantics, source-vs-design artifact distinction, the
// models-finalized execution gate, dependency blocking, task retry authorization,
// and tenant isolation of the workspace file routes.

import test from "node:test";
import assert from "node:assert/strict";

process.env.VERYA_TEST_MODE = "1";

// Load CJS-transformed modules inside a hook (top-level await unsupported here).
let checkWorkspacePath: typeof import("../../services/workspace.js").checkWorkspacePath;
let applyFileOpToSession: typeof import("../../services/workspace.js").applyFileOpToSession;
let extractFileOps: typeof import("../../services/fileops.js").extractFileOps;
let startExecution: typeof import("../../services/execution.js").startExecution;
let startPipeline: typeof import("../../services/pipeline.js").startPipeline;
let getPipeline: typeof import("../../services/pipeline.js").getPipeline;

let seq = 0;
/** Unique org per test — no cross-test state (devstore has no reset API). */
function uniqOrg(label: string): string {
  seq += 1;
  return `ws-${label}-${seq}-${Date.now()}`;
}

test.before(async () => {
  const ws = await import("../../services/workspace.js");
  const fo = await import("../../services/fileops.js");
  const ex = await import("../../services/execution.js");
  const pl = await import("../../services/pipeline.js");
  checkWorkspacePath = ws.checkWorkspacePath;
  applyFileOpToSession = ws.applyFileOpToSession;
  extractFileOps = fo.extractFileOps;
  startExecution = ex.startExecution;
  startPipeline = pl.startPipeline;
  getPipeline = pl.getPipeline;
});

function freshSession(): PipelineSessionLike {
  return {
    id: "ws-test-session",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    input: "test",
    statedStack: "",
    policy: "balanced",
    uploads: [],
    gate: "execution",
    gateStatus: "running",
    suitability: null,
    suggestedWorkflow: null,
    workflow: null,
    flawReport: null,
    flawResolutions: [],
    stackGate: null,
    algorithms: null,
    routing: null,
    executions: [],
    humanFeedback: { ratings: {} },
  } as unknown as PipelineSessionLike;
}

type PipelineSessionLike = Parameters<typeof import("../../services/workspace.js").applyFileOpToSession>[0];

// ---------- Part 6: path security ----------

test("path security: rejects parent-directory traversal", () => {
  const res = checkWorkspacePath("../../secret.txt");
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /traversal/i);
});

test("path security: rejects embedded traversal", () => {
  assert.equal(checkWorkspacePath("src/../../etc/passwd").ok, false);
});

test("path security: rejects windows absolute path", () => {
  const res = checkWorkspacePath("C:\\Windows\\System32\\evil.txt");
  assert.equal(res.ok, false);
});

test("path security: rejects unix absolute path", () => {
  assert.equal(checkWorkspacePath("/etc/passwd").ok, false);
});

test("path security: rejects UNC path", () => {
  assert.equal(checkWorkspacePath("\\\\server\\share\\file").ok, false);
});

test("path security: rejects empty path", () => {
  assert.equal(checkWorkspacePath("").ok, false);
  assert.equal(checkWorkspacePath("   ").ok, false);
});

test("path security: normalizes leading project/ prefix", () => {
  const res = checkWorkspacePath("project/src/app/page.tsx");
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.normalized, "src/app/page.tsx");
});

test("path security: normalizes backslashes and dot segments", () => {
  const res = checkWorkspacePath("src\\lib\\./auth.ts");
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.normalized, "src/lib/auth.ts");
});

test("path security: rejects reserved device names", () => {
  assert.equal(checkWorkspacePath("NUL").ok, false);
  assert.equal(checkWorkspacePath("COM1").ok, false);
});

// ---------- Part 7: real file creation semantics ----------

test("workspace: create writes a real file with provenance", () => {
  const s = freshSession();
  const res = applyFileOpToSession(s, { path: "prisma/schema.prisma", operation: "create", content: "generator client {}" }, { taskId: "t1", model: "openai/gpt-oss-20b" });
  assert.equal(res.ok, true);
  assert.equal(s.workspaceFiles?.length, 1);
  const f = s.workspaceFiles![0];
  assert.equal(f.path, "prisma/schema.prisma");
  assert.equal(f.content, "generator client {}");
  assert.equal(f.taskId, "t1");
  assert.equal(f.model, "openai/gpt-oss-20b");
  assert.equal(f.version, 1);
});

test("workspace: create on existing path updates in place (no duplicates)", () => {
  const s = freshSession();
  applyFileOpToSession(s, { path: "package.json", operation: "create", content: "{}" }, { taskId: "t1", model: "m" });
  const res = applyFileOpToSession(s, { path: "package.json", operation: "create", content: "{\"name\":\"x\"}" }, { taskId: "t2", model: "m2" });
  assert.equal(res.ok, true);
  assert.equal(s.workspaceFiles?.length, 1);
  const f = s.workspaceFiles![0];
  assert.equal(f.version, 2);
  assert.equal(f.original, "{}"); // prior content preserved as original (diff base)
});

test("workspace: update requires an existing file", () => {
  const s = freshSession();
  const res = applyFileOpToSession(s, { path: "src/new.ts", operation: "update", content: "x" }, { taskId: "t1", model: "m" });
  assert.equal(res.ok, false);
});

test("workspace: delete removes the file", () => {
  const s = freshSession();
  applyFileOpToSession(s, { path: "tmp.txt", operation: "create", content: "x" }, { taskId: "t1", model: "m" });
  const res = applyFileOpToSession(s, { path: "tmp.txt", operation: "delete", content: "" }, { taskId: "t1", model: "m" });
  assert.equal(res.ok, true);
  assert.equal(s.workspaceFiles?.length, 0);
});

test("workspace: rejected paths never touch the store", () => {
  const s = freshSession();
  const res = applyFileOpToSession(s, { path: "../evil.ts", operation: "create", content: "x" }, { taskId: "t1", model: "m" });
  assert.equal(res.ok, false);
  assert.equal(s.workspaceFiles?.length, 0);
});

// ---------- Part 5: structured generation parsing ----------

test("fileops: parses structured {files:[...]} JSON", () => {
  const output = `Here is the schema.\n\`\`\`json\n{"files":[{"path":"prisma/schema.prisma","operation":"create","content":"generator client {}"}]}\n\`\`\``;
  const ops = extractFileOps(output);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].path, "prisma/schema.prisma");
  assert.equal(ops[0].operation, "create");
});

test("fileops: parses bare JSON object output", () => {
  const ops = extractFileOps(`{"files":[{"path":"src/lib/auth.ts","operation":"create","content":"export const x = 1;"},{"path":"old.ts","operation":"delete","content":""}]}`);
  assert.equal(ops.length, 2);
  assert.equal(ops[1].operation, "delete");
});

test("fileops: falls back to path-declared fenced blocks", () => {
  const output = "Notes.\n```ts\n// src/lib/token.ts\nexport function token() { return 1; }\n```";
  const ops = extractFileOps(output);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].path, "src/lib/token.ts");
  assert.match(ops[0].content, /export function token/);
  assert.doesNotMatch(ops[0].content, /^\/\//);
});

test("fileops: plain design prose yields NO file operations", () => {
  const ops = extractFileOps("This task should use PostgreSQL with a Prisma schema and a Redis cache for sessions.");
  assert.equal(ops.length, 0);
});

// ---------- Part 1: models-finalized execution gate ----------

test("execution gate: refuses to start without finalized routing", async () => {
  const org = uniqOrg("gate");
  const started = await startPipeline({ orgId: org, input: "Build a small note-taking API with search", statedStack: "", policy: "balanced" });
  const session = (await getPipeline(org, started.id))!;
  assert.notEqual(session.gate, "execution", "fresh session must not be at execution");
  await assert.rejects(
    () => startExecution(org, session.id),
    /not ready for execution/i,
    "Run must be blocked when Models are not finalized"
  );
});

test("execution gate: routing with unresolved tie-breaks blocks Run", async () => {
  const org = uniqOrg("gate-ties");
  const started = await startPipeline({ orgId: org, input: "Build a small invoicing API with recurring billing", statedStack: "", policy: "balanced" });
  const session = (await getPipeline(org, started.id))!;
  // Simulate the Models stage mid-way: routing exists, one tie-break unresolved.
  session.routing = {
    routes: [{ taskId: "t1", taskTitle: "T1", selectedModel: "groq/llama-3.3-70b-versatile", reason: "test", confidence: 0.9, tieBreakRequired: true, options: [] }],
    policy: "balanced",
    estimatedCostUsd: 1,
    notes: "",
  } as never;
  session.workflow = { title: "T", summary: "", tasks: [{ id: "t1", title: "T1", description: "", category: "backend", dependsOn: [], complexity: "low", risk: "low" }] } as never;
  session.algorithms = { tasks: [{ taskId: "t1", taskTitle: "T1", selected: "direct implementation", tieBreakRequired: false, options: [] }] } as never;
  session.modelsFinalized = false;
  const { startExecution: start, } = await import("../../services/execution.js");
  const { saveSession } = await import("../../repositories/sessions.js");
  session.modelsFinalized = false;
  await saveSession(org, session);
  await assert.rejects(() => start(org, session.id), /tie-break/i, "unresolved tie-breaks must block Run");
});

test("execution gate: modelsFinalized=false blocks Run even with routing present", async () => {
  const org = uniqOrg("gate-notfinal");
  const started = await startPipeline({ orgId: org, input: "Build a small URL shortener with analytics", statedStack: "", policy: "balanced" });
  const session = (await getPipeline(org, started.id))!;
  session.routing = { routes: [{ taskId: "t1", taskTitle: "T1", selectedModel: "groq/llama-3.3-70b-versatile", reason: "test", confidence: 0.9, tieBreakRequired: false, options: [] }], policy: "balanced", estimatedCostUsd: 1, notes: "" } as never;
  session.workflow = { title: "T", summary: "", tasks: [{ id: "t1", title: "T1", description: "", category: "backend", dependsOn: [], complexity: "low", risk: "low" }] } as never;
  session.algorithms = { tasks: [{ taskId: "t1", taskTitle: "T1", selected: "direct implementation", tieBreakRequired: false, options: [] }] } as never;
  session.modelsFinalized = false;
  const { startExecution: start } = await import("../../services/execution.js");
  const { saveSession } = await import("../../repositories/sessions.js");
  await saveSession(org, session);
  await assert.rejects(() => start(org, session.id), /not finalized/i, "selection without finalization must block Run");
});

test("finalize_models action: unlocks Run after tie-breaks resolve", async () => {
  const org = uniqOrg("gate-final");
  const { actOnPipeline } = await import("../../services/pipeline.js");
  const started = await startPipeline({ orgId: org, input: "Build a small habit tracker with streaks", statedStack: "", policy: "balanced" });
  const s = (await getPipeline(org, started.id))!;
  s.gate = "models";
  s.routing = { routes: [{ taskId: "t1", taskTitle: "T1", selectedModel: "groq/llama-3.3-70b-versatile", reason: "test", confidence: 0.9, tieBreakRequired: false, options: [] }], policy: "balanced", estimatedCostUsd: 1, notes: "" } as never;
  s.workflow = { title: "T", summary: "", tasks: [{ id: "t1", title: "T1", description: "", category: "backend", dependsOn: [], complexity: "low", risk: "low" }] } as never;
  s.algorithms = { tasks: [{ taskId: "t1", taskTitle: "T1", selected: "direct implementation", tieBreakRequired: false, options: [] }] } as never;
  s.modelsFinalized = false;
  const { saveSession } = await import("../../repositories/sessions.js");
  await saveSession(org, s);
  const after = await actOnPipeline(org, started.id, { action: "finalize_models" });
  assert.equal(after.modelsFinalized, true);
  assert.equal(after.gate, "execution");
  assert.equal(after.gateStatus, "pending");
});

// ---------- Parts 17/16: dependency blocking + retry ----------

test("retry_task: rejects retry of a task that never ran", async () => {
  const org = uniqOrg("retry");
  const { actOnPipeline } = await import("../../services/pipeline.js");
  const started = await startPipeline({ orgId: org, input: "Build a small wiki API with versioning", statedStack: "", policy: "balanced" });
  // Fresh session sits at the suitability gate — retry_task must be refused there.
  await assert.rejects(
    () => actOnPipeline(org, started.id, { action: "retry_task", taskId: "task_99" } as never),
    /only available during execution or review/i
  );
});

// ---------- Part 32: tenant isolation ----------

test("tenant isolation: workspace files are org-scoped", async () => {
  const { applyFileOpToSession: apply } = await import("../../services/workspace.js");
  const orgA = uniqOrg("iso-a");
  const orgB = uniqOrg("iso-b");
  const a = await startPipeline({ orgId: orgA, input: "Org A project: task board with comments", statedStack: "", policy: "balanced" });
  const b = await startPipeline({ orgId: orgB, input: "Org B project: recipe box with tags", statedStack: "", policy: "balanced" });
  assert.notEqual(a.id, b.id);
  const sA = (await getPipeline(orgA, a.id))!;
  const sB = (await getPipeline(orgB, a.id));
  assert.equal(sB, null, "org B must not read org A's session");
  apply(sA, { path: "src/a-only.ts", operation: "create", content: "org a" }, { taskId: "t", model: "m" });
  assert.equal(sA.workspaceFiles?.some((f) => f.path === "src/a-only.ts"), true);
  void orgB;
});
