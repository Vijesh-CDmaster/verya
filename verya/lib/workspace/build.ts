// Derives the coding workspace from the real pipeline session.
// NOTHING here fabricates execution results: files come from the backend's code
// artifacts, tasks/model assignments/approaches from routing + algorithms, and
// governance data from the session itself. When the backend has not produced
// something yet, the workspace shows that honestly.

import type { Session } from "@/schemas/pipeline";

// ---- Types ----

export type WsFile = {
  path: string; // "project/<segments...>"
  status: "clean" | "modified" | "new";
  /** Real source file written by execution into the session workspace. */
  content?: string;
  version?: number;
  updatedAt?: string;
  model?: string;
  taskId?: string;
  /** Legacy design-artifact identity — taskId + version for CAS saves via `code_edit`. */
  artifact?: { taskId: string; language: string; version: number };
};

export type WsPlanContext = {
  project: string;
  suitability: { verdict: string; confidence: number; reason: string };
  target: { platform: string; title: string; summary: string };
  identifiedFlaws: { title: string; severity: string; fix: string }[];
  recommendedStack: { name: string; notes: string[] } | null;
  tasks: { id: string; title: string; dependsOn: string[]; risk: string; complexity: string }[];
  dependencies: { from: string; to: string }[];
  approaches: {
    taskId: string;
    taskTitle: string;
    selected: string;
    tieBreakRequired: boolean;
    options: { name: string; approach: string; pros: string[]; cons: string[] }[];
  }[];
  selectedModels: { taskId: string; taskTitle: string; model: string; reason: string; tieBreakRequired: boolean }[];
  governanceConstraints: string[];
  riskLevel: string;
  trustRequirements: { initial: number; remaining: number; consumed: number; status: string };
};

export type WsTask = {
  id: string;
  title: string;
  dependsOn: string[];
  risk: string;
  complexity: string;
  status: "pending" | "running" | "verified" | "flagged" | "failed" | "escalated";
  model: string | null;
  /** The model that ACTUALLY served the task (differs on failover). */
  servedBy: string | null;
  modelReason: string;
  approach: string | null;
  hasArtifact: boolean;
  verification: { passed: boolean; method: string; issues: string[] } | null;
  execution: { output: string; confidence: number; latencyMs: number; tokens: { input: number; output: number }; fileOps: { path: string; operation: string; rejected: boolean; reason?: string }[] } | null;
};

export type WsGovernance = {
  agentStatus: string;
  trustBudget: { initial: number; remaining: number; consumed: number; status: string } | null;
  overallRisk: string;
  verification: { verified: number; flagged: number; failed: number; total: number; done: number };
};

export type WsBuild = {
  files: WsFile[];
  context: WsPlanContext;
  tasks: WsTask[];
  governance: WsGovernance;
  projectTitle: string;
  estimatedCostUsd: number;
  routingPolicy: string;
  runState: RunState;
};

/** Display tree for the explorer, assembled from the flat file list. */
export type TreeNode = {
  name: string;
  path: string;
  dir: boolean;
  status?: WsFile["status"];
  artifact?: WsFile["artifact"];
  children: TreeNode[];
};

// ---- Narrowing helpers (routing/algorithms/stack are typed `unknown` upstream) ----

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AnyRecord) : null;
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function bool(value: unknown): boolean {
  return value === true;
}

export function routingOf(session: Session): { routes: AnyRecord[]; estimatedCostUsd: number; policy: string } | null {
  const r = asRecord(session.routing);
  return r
    ? { routes: asArray(r.routes).map((x) => asRecord(x)).filter(Boolean) as AnyRecord[], estimatedCostUsd: num(r.estimatedCostUsd), policy: str(r.policy) }
    : null;
}
export function algorithmsOf(session: Session): { tasks: AnyRecord[] } | null {
  const a = asRecord(session.algorithms);
  return a ? { tasks: asArray(a.tasks).map((x) => asRecord(x)).filter(Boolean) as AnyRecord[] } : null;
}

/** Maps a backend artifact fileName into workspace segments (src/auth, src/db, src/ui, infra, test). */
function segmentsFor(taskTitle: string, fileName: string): string[] {
  const t = taskTitle.toLowerCase();
  const group = /auth|login|sign-?in|user/.test(t) ? "src/auth"
    : /schema|database|db |migration|sql/.test(t) ? "src/db"
    : /frontend|ui|dashboard|page|component|cart|checkout|catalog|tracking/.test(t) ? "src/ui"
    : /deploy|infra|docker|ci\/?cd/.test(t) ? "infra"
    : /test/.test(t) ? "test"
    : "src";
  const name = fileName.replace(/[\\/]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "artifact.txt";
  return [...group.split("/"), name];
}

// ---- Builders ----

/** The explicit Run-button state model (Part 2) — derived ONLY from session truth. */
export type RunState = "waiting" | "ready" | "running" | "paused" | "completed" | "failed";

export function runStateOf(session: Session): RunState {
  const execs = session.executions ?? [];
  if (session.gateStatus === "failed") return "failed";
  if (session.gate === "review") {
    return execs.some((e) => e.status === "failed") ? "failed" : "completed";
  }
  if (session.gate === "execution") {
    if (session.gateStatus === "running") return "running";
    if (session.gateStatus === "awaiting_user") {
      return session.trustBudget?.status === "exhausted" ? "paused" : "ready";
    }
    if (session.modelsFinalized === false) return "waiting";
    return "ready";
  }
  return "waiting";
}

export function buildWorkspace(session: Session): WsBuild {
  const workflow = session.workflow ?? null;
  const routing = routingOf(session);
  const algos = algorithmsOf(session);
  const tasksRaw = workflow?.tasks ?? [];
  const execs = session.executions ?? [];
  const flawsList = session.flawConsensus?.issues ?? session.flawReport?.flaws ?? [];
  const stackGate = asRecord(session.stackGate);

  const routeByTask = new Map((routing?.routes ?? []).map((r) => [str(asRecord(r)?.taskId), asRecord(r) ?? {}]));
  const algoByTask = new Map((algos?.tasks ?? []).map((a) => [str(asRecord(a)?.taskId), asRecord(a) ?? {}]));
  const execByTask = new Map(execs.map((e) => [e.taskId, e]));

  // --- Tasks (planning rows merged with real execution state) ---
  const tasks: WsTask[] = tasksRaw.map((t) => {
    const exec = execByTask.get(t.id) ?? null;
    const route = routeByTask.get(t.id) ?? null;
    const algo = algoByTask.get(t.id) ?? null;
  return {
    id: t.id,
    title: t.title,
    dependsOn: t.dependsOn,
    risk: t.risk,
    complexity: t.complexity,
    status: (str(exec?.status, "pending") || "pending") as WsTask["status"],
    model: route ? str(route.selectedModel) || null : null,
    servedBy: exec?.servedBy ?? null,
    modelReason: route ? str(route.reason) : "",
    approach: algo ? str(algo.selected) || null : null,
    hasArtifact: Boolean(exec?.code),
    verification: exec
      ? { passed: exec.verification.passed, method: exec.verification.method, issues: exec.verification.issues }
      : null,
    execution: exec
      ? {
          output: exec.output,
          confidence: exec.confidence,
          latencyMs: exec.latencyMs,
          tokens: exec.tokens,
          fileOps: asArray(exec.fileOps).map((f) => {
            const fr = asRecord(f) ?? {};
            return {
              path: str(fr.path),
              operation: str(fr.operation),
              rejected: bool(fr.rejected),
              ...(str(fr.reason) ? { reason: str(fr.reason) } : {}),
            };
          }),
        }
      : null,
  };
});

  // --- File tree: REAL workspace source files first, then legacy design artifacts ---
  const files: WsFile[] = [];
  const wsSourceFiles = asArray(session.workspaceFiles)
    .map((f) => asRecord(f))
    .filter(Boolean) as AnyRecord[];
  const tasksWithSource = new Set<string>();
  for (const f of wsSourceFiles) {
    const p = str(f.path);
    if (!p) continue;
    tasksWithSource.add(str(f.taskId));
    files.push({
      path: ["project", ...p.split("/")].join("/"),
      status: str(f.original) === "" ? "new" : str(f.content) !== str(f.original) ? "modified" : "clean",
      content: str(f.content),
      version: num(f.version, 1),
      updatedAt: str(f.updatedAt) || undefined,
      model: str(f.model) || undefined,
      taskId: str(f.taskId) || undefined,
    });
  }
  for (const t of tasks) {
    const code = execByTask.get(t.id)?.code;
    if (!code || tasksWithSource.has(t.id)) continue;
    files.push({
      path: ["project", ...segmentsFor(t.title, code.fileName)].join("/"),
      status: code.current === code.original ? "clean" : "modified",
      artifact: { taskId: t.id, language: code.language, version: code.version },
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  // --- Governance (session truth only; no invented authorization claims) ---
  const governance: WsGovernance = {
    agentStatus: execs.some((e) => e.status === "running") ? "Working" : execs.length > 0 ? "Ready" : "Idle",
    trustBudget: session.trustBudget ?? null,
    overallRisk: session.flawReport?.overallRisk ?? "medium",
    verification: {
      verified: execs.filter((e) => e.status === "verified").length,
      flagged: execs.filter((e) => e.status === "flagged").length,
      failed: execs.filter((e) => e.status === "failed" || e.status === "escalated").length,
      total: tasks.length,
      done: execs.length,
    },
  };

  // --- Recommended stack (selected stack gate candidate) ---
  const stackCandidates = asArray(stackGate?.candidates).map((c) => asRecord(c)).filter(Boolean) as AnyRecord[];
  const selectedStackName =
    str(stackGate?.selected) || str(asRecord(stackCandidates[0]?.proposal)?.name);
  const validationNotes = asArray(asRecord(stackGate?.validation)?.notes).map((n) => str(n));
  const recommendedStack = selectedStackName ? { name: selectedStackName, notes: validationNotes } : null;

  // --- The planning → agent handoff object ---
  const suit = session.suitability ?? null;
  const context: WsPlanContext = {
    project: session.input.slice(0, 600),
    suitability: {
      verdict: suit ? suit.verdict ?? (suit.suitable ? "suitable" : "unsuitable") : "unknown",
      confidence: suit?.confidence ?? 0,
      reason: suit?.reason ?? "",
    },
    target: {
      platform: session.targetPlatform ?? "web",
      title: workflow?.title ?? "Untitled project",
      summary: workflow?.summary ?? "",
    },
    identifiedFlaws: flawsList.map((f) => ({ title: f.title, severity: f.severity, fix: f.suggestedFix })),
    recommendedStack,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, dependsOn: t.dependsOn, risk: t.risk, complexity: t.complexity })),
    dependencies: tasks.flatMap((t) => t.dependsOn.map((d) => ({ from: d, to: t.id }))),
    approaches: (algos?.tasks ?? []).map((a) => {
      const rec = asRecord(a) ?? {};
      return {
        taskId: str(rec.taskId),
        taskTitle: str(rec.taskTitle),
        selected: str(rec.selected),
        tieBreakRequired: bool(rec.tieBreakRequired),
        options: asArray(rec.options).map((o) => {
          const or = asRecord(o) ?? {};
          return {
            name: str(or.name),
            approach: str(or.approach),
            pros: asArray(or.pros).map((p) => str(p)),
            cons: asArray(or.cons).map((c) => str(c)),
          };
        }),
      };
    }),
    selectedModels: (routing?.routes ?? []).map((r) => {
      const rec = asRecord(r) ?? {};
      return {
        taskId: str(rec.taskId),
        taskTitle: str(rec.taskTitle),
        model: str(rec.selectedModel),
        reason: str(rec.reason),
        tieBreakRequired: bool(rec.tieBreakRequired),
      };
    }),
    governanceConstraints: [
      ...flawsList.filter((f) => f.severity === "critical" || f.severity === "high").map((f) => `Mitigate: ${f.title}`),
      `Routing policy: ${session.policy}`,
      "Agent edits are versioned and audited in the Trust Ledger.",
    ],
    riskLevel: session.flawReport?.overallRisk ?? "medium",
    trustRequirements: session.trustBudget ?? { initial: 0, remaining: 0, consumed: 0, status: "active" },
  };

  return {
    files,
    context,
    tasks,
    governance,
    projectTitle: workflow?.title ?? "Untitled project",
    estimatedCostUsd: routing?.estimatedCostUsd ?? 0,
    routingPolicy: session.policy,
    runState: runStateOf(session),
  };
}

/** Assembles the explorer tree from the flat artifact list. */
export function buildTree(files: WsFile[]): TreeNode {
  const root: TreeNode = { name: "project", path: "project", dir: true, children: [] };
  for (const file of files) {
    const segs = file.path.split("/");
    let node = root;
    for (let i = 1; i < segs.length; i++) {
      const seg = segs[i];
      const isLast = i === segs.length - 1;
      const path = segs.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === seg && c.dir === !isLast);
      if (!child) {
        child = {
          name: seg,
          path,
          dir: !isLast,
          children: [],
          ...(isLast ? { status: file.status, artifact: file.artifact } : {}),
        };
        node.children.push(child);
      }
      node = child;
    }
  }
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    for (const c of n.children) sortRec(c);
  };
  sortRec(root);
  return root;
}

/** Extension → language label for editor highlighting. */
export function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "ts") return "typescript";
  if (ext === "jsx" || ext === "js") return "javascript";
  if (ext === "py") return "python";
  if (ext === "json") return "json";
  if (ext === "sql") return "sql";
  if (ext === "md") return "markdown";
  if (ext === "prisma" || ext === "env" || ext === "yml" || ext === "yaml") return "sql";
  return "text";
}
