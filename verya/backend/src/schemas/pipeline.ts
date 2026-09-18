// Verya — gated pipeline type definitions
// Pipeline: Intake → Suitability Gate → Flaw Gate → Stack Gate → Task Gate
//           → Algorithm Gate → Model Gate → Execution → Verification → Feedback

import { z } from "zod";

export type Severity = "critical" | "high" | "medium" | "low";
export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

// Gemini 3.x quirks: explicit null for absent optionals, and arrays sometimes arrive as
// comma-joined strings (or a single bare string). These preprocessors absorb all of it.
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const nullTo = <V>(fallback: V, inner: z.ZodType<V, any, any>) =>
  z.preprocess((v) => (v == null ? fallback : v), inner);
const coerceStringArray = (v: unknown): unknown => {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || s === "null") return [];
    return s.split(/[,;]/).map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return v;
};
const arr = (item: z.ZodType<string>, max = 50) =>
  z.preprocess(
    coerceStringArray,
    z.array(item as z.ZodType<string>).max(max) as unknown as z.ZodType<string[]>
  );

// Gemini 3.x sometimes double-encodes arrays of objects as a JSON string
// (e.g. flaws: "[{...}]"). Decode once before validating, and default null→[].
const decodeJsonPre = (v: unknown): unknown => {
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        return JSON.parse(s);
      } catch {
        return v;
      }
    }
    return [];
  }
  return v == null ? [] : v;
};
const objArr = <T extends z.ZodTypeAny>(item: T, min = 0, max = 50) =>
  z.preprocess(decodeJsonPre, z.array(item).min(min).max(max));

// ---------- Gate 1: Suitability ----------
export const SuitabilitySchema = z.object({
  suitable: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(600),
  suggestedWorkflow: z.string().max(3000).nullish(),
  suggestedSummary: z.string().max(400).nullish(),
});
export type Suitability = z.infer<typeof SuitabilitySchema>;

// ---------- Workflow (shared across gates) ----------
export type TaskCategory =
  | "frontend"
  | "backend"
  | "database"
  | "auth"
  | "integration"
  | "devops"
  | "ai"
  | "other";

export const TaskSchema = z.object({
  // Tolerant: models occasionally omit fields; runSuitability repairs positionally.
  id: nullTo("", z.string().max(80)),
  title: nullTo("", z.string().max(120)),
  description: nullTo("", z.string().max(600)),
  category: nullTo("other" as const, z.enum([
    "frontend",
    "backend",
    "database",
    "auth",
    "integration",
    "devops",
    "ai",
    "other",
  ] as const)),
  dependsOn: arr(z.string()),
  complexity: nullTo("medium" as const, z.enum(["low", "medium", "high"])),
  risk: nullTo("medium" as const, z.enum(["low", "medium", "high"])),
});
export type Task = z.infer<typeof TaskSchema>;

export const WorkflowSchema = z.object({
  title: nullTo("", z.string().max(120)),
  summary: nullTo("", z.string().max(800)),
  tasks: objArr(TaskSchema, 1, 30),
  ambiguities: arr(z.string(), 20),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// ---------- Gate 2: Flaw Detection ----------
export const FlawSchema = z.object({
  id: nullTo("", z.string().max(40)),
  title: nullTo("", z.string().max(140)),
  category: z.enum([
    "security",
    "architecture",
    "logic",
    "scale",
    "cost",
    "nonfunctional",
  ]),
  severity: SeveritySchema,
  description: z.string().max(700),
  suggestedFix: z.string().max(700),
  relatedTaskIds: arr(z.string()),
});
export const FlawReportSchema = z.object({
  flaws: objArr(FlawSchema, 0, 40),
  overallRisk: z.enum(["low", "medium", "high"]),
  summary: z.string().max(500),
});
export type Flaw = z.infer<typeof FlawSchema>;
export type FlawReport = z.infer<typeof FlawReportSchema>;

export type FlawDecision = "accepted" | "rejected" | "edited";
export type FlawResolution = {
  flawId: string;
  decision: FlawDecision;
  editedFix?: string;
};

// ---------- Gate 3: Stack ----------
export const StackComponentSchema = z.object({
  layer: z.enum([
    "frontend",
    "backend",
    "database",
    "cache",
    "auth",
    "hosting",
    "jobs",
    "storage",
  ]),
  choice: z.string().min(1).max(80),
  rationale: nullTo("", z.string().max(300)),
});
export const StackProposalSchema = z.object({
  name: z.string().max(80).default("Proposed stack"),
  components: objArr(StackComponentSchema, 3, 9),
  summary: z.string().max(400),
  confidence: z.number().min(0).max(1).default(0.7),
});
export type StackProposal = z.infer<typeof StackProposalSchema>;

export const StackValidationSchema = z.object({
  verdict: z.enum(["fit", "fit_with_changes", "poor_fit"]),
  notes: arr(z.string(), 16),
  changes: objArr(
    z.object({
      layer: z.string().max(40),
      from: z.string().max(80),
      to: z.string().max(80),
      why: z.string().max(300),
    }),
    0,
    8
  ),
});
export type StackValidation = z.infer<typeof StackValidationSchema>;

// A stack candidate carries an optional name + trust/confidence for tie handling.
export const StackCandidateSchema = z.object({
  proposal: StackProposalSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300).default(""),
});
export type StackCandidate = z.infer<typeof StackCandidateSchema>;

export const StackGateSchema = z.object({
  provided: z.boolean(),
  validation: StackValidationSchema.nullable(),
  candidates: objArr(StackCandidateSchema, 1, 3),
  selected: z.string().nullable(), // proposal name of chosen candidate
  tieBreakRequired: z.boolean(),
});
// note: StackProposal.confidence/rationale already tolerate null via nullish/default above
export type StackGate = z.infer<typeof StackGateSchema>;

// ---------- Gate 5: Algorithms (per task) ----------
export const AlgorithmOptionSchema = z.object({
  name: nullTo("", z.string().max(80)),
  approach: nullTo("", z.string().max(400)),
  pros: arr(z.string(), 8),
  cons: arr(z.string(), 8),
  confidence: nullTo(0.6, z.number().min(0).max(1)),
});
export const TaskAlgorithmSchema = z.object({
  // Tolerant defaults: gates.ts repairs missing ids/title positionally against the
  // known workflow tasks, so a sloppy model response can never kill the gate.
  taskId: nullTo("", z.string().max(80)),
  taskTitle: nullTo("", z.string().max(120)),
  options: objArr(AlgorithmOptionSchema, 1, 4),
  selected: nullTo("", z.string().max(80)),
  tieBreakRequired: nullTo(false, z.boolean()),
  tieBreakReason: nullTo("", z.string().max(300)),
  humanChoice: z.string().max(80).nullish(),
});
export const AlgorithmPlanSchema = z.object({
  tasks: objArr(TaskAlgorithmSchema, 1, 40),
});
export type AlgorithmOption = z.infer<typeof AlgorithmOptionSchema>;
export type TaskAlgorithm = z.infer<typeof TaskAlgorithmSchema>;
export type AlgorithmPlan = z.infer<typeof AlgorithmPlanSchema>;

// ---------- Gate 6: Model routing ----------
// Multi-provider pool: the four configured API keys (Gemini, Groq, OpenRouter, Mistral)
// form ONE routing pool. The router picks per-task by specialty, cost tier, and latency;
// provider.ts owns how each id maps to a real API call (incl. cross-provider failover).
// All ids verified live against each provider's model list.
export const MODEL_IDS = [
  // Gemini (key 1) — native structured output, strong reasoning tier
  "gemini-3.6-flash",
  "gemini-3.1-pro-preview",
  // Groq (key 2) — lowest latency, strong open-weights general models
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  // Mistral (key 3) — codestral is a dedicated code model
  "codestral-latest",
  "magistral-medium-latest",
  "mistral-medium-latest",
  "ministral-8b-latest",
  // OpenRouter (key 4) — free tier, its own per-model daily quota
  "z-ai/glm-5.2:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export type ProviderName = "gemini" | "groq" | "openrouter" | "mistral";
export type PoolTier = "strong" | "standard" | "fast" | "free";

export type PoolModel = {
  id: ModelId;
  provider: ProviderName;
  tier: PoolTier;
  costPerTask: number; // relative cost units (free tier = 0, flash-class ≈ 1, pro-class ≈ 4)
  specialties: TaskCategory[]; // task categories this model is routed to preferentially
};

export const MODEL_POOL: PoolModel[] = [
  { id: "gemini-3.6-flash", provider: "gemini", tier: "standard", costPerTask: 1, specialties: ["frontend", "backend", "database", "auth"] },
  { id: "gemini-3.1-pro-preview", provider: "gemini", tier: "strong", costPerTask: 4, specialties: ["backend", "database", "devops"] },
  { id: "openai/gpt-oss-120b", provider: "groq", tier: "standard", costPerTask: 1, specialties: ["backend", "ai", "integration"] },
  { id: "openai/gpt-oss-20b", provider: "groq", tier: "fast", costPerTask: 1, specialties: ["frontend", "other"] },
  { id: "qwen/qwen3.8-27b", provider: "groq", tier: "standard", costPerTask: 1, specialties: ["ai", "other"] },
  { id: "codestral-latest", provider: "mistral", tier: "standard", costPerTask: 1, specialties: ["frontend", "backend"] },
  { id: "magistral-medium-latest", provider: "mistral", tier: "strong", costPerTask: 2, specialties: ["backend", "auth", "database"] },
  { id: "mistral-medium-latest", provider: "mistral", tier: "standard", costPerTask: 1, specialties: ["integration", "devops"] },
  { id: "ministral-8b-latest", provider: "mistral", tier: "fast", costPerTask: 1, specialties: ["frontend", "other"] },
  { id: "z-ai/glm-5.2:free", provider: "openrouter", tier: "free", costPerTask: 0, specialties: ["frontend", "backend", "database"] },
  { id: "google/gemma-4-31b-it:free", provider: "openrouter", tier: "free", costPerTask: 0, specialties: ["frontend", "other"] },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", provider: "openrouter", tier: "free", costPerTask: 0, specialties: ["backend", "ai"] },
];

export function poolModelOf(id: string): PoolModel | undefined {
  return MODEL_POOL.find((m) => m.id === id);
}

export const STRONG_MODEL_ID: ModelId = "gemini-3.1-pro-preview";
export const CHEAP_MODEL_ID: ModelId = "openai/gpt-oss-20b"; // fastest + cheapest default workhorse

export function modelCostOf(id: string): number {
  return poolModelOf(id)?.costPerTask ?? 1;
}

export const TaskModelRouteSchema = z.object({
  taskId: nullTo("", z.string().max(80)),
  taskTitle: nullTo("", z.string().max(120)),
  options: z
    .array(
      z.object({
        model: z.enum(MODEL_IDS),
        confidence: z.number().min(0).max(1),
        estimatedCost: z.number().min(0),
        estimatedLatencyMs: z.number().min(0),
        qualifiesBecause: nullTo("", z.string().max(200)),
      })
    )
    .min(1)
    .max(4),
  selectedModel: z.enum(MODEL_IDS),
  reason: nullTo("", z.string().max(300)),
  confidence: nullTo(0.6, z.number().min(0).max(1)),
  tieBreakRequired: nullTo(false, z.boolean()),
  humanChoice: z.string().max(40).nullish(),
});
export const RoutingPlanSchema = z.object({
  routes: objArr(TaskModelRouteSchema, 1, 40),
  policy: z.enum(["lowest_cost", "highest_accuracy", "balanced"]).default("balanced"),
  estimatedCostUsd: z.number().min(0),
  notes: z.string().max(400).default(""),
});
export type RoutingPolicy = "lowest_cost" | "highest_accuracy" | "balanced";
export type TaskModelRoute = z.infer<typeof TaskModelRouteSchema>;
export type RoutingPlan = z.infer<typeof RoutingPlanSchema>;

// ---------- Execution & Verification ----------
export type ExecutionStatus =
  | "pending"
  | "running"
  | "verified"
  | "flagged"
  | "failed"
  | "escalated";

export const ExecutionResultSchema = z.object({
  taskId: z.string().min(1),
  model: z.enum(MODEL_IDS),
  output: z.string().max(60000),
  humanRating: z.number().min(1).max(5).optional(),
  humanNote: z.string().max(400).optional(),
  battleA: z
    .object({
      model: z.enum(MODEL_IDS),
      output: z.string(),
      latencyMs: z.number().min(0),
      tokens: z.object({ input: z.number(), output: z.number() }),
    })
    .optional(),
  battleB: z
    .object({
      model: z.enum(MODEL_IDS),
      output: z.string(),
      latencyMs: z.number().min(0),
      tokens: z.object({ input: z.number(), output: z.number() }),
    })
    .optional(),
  battleWinner: z.enum(["a", "b"]).optional(),
  verification: z.object({
    method: z.enum(["rules", "second_model"]),
    passed: z.boolean(),
    issues: z.array(z.string().max(300)).default([]),
    checkedBy: z.string().max(60),
  }),
  status: z.enum([
    "pending",
    "running",
    "verified",
    "flagged",
    "failed",
    "escalated",
  ]),
  confidence: z.number().min(0).max(1),
  latencyMs: z.number().min(0),
  tokens: z.object({ input: z.number(), output: z.number() }).default({ input: 0, output: 0 }),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ---------- Session state (the whole gated pipeline) ----------
export type GateId =
  | "intake"
  | "suitability"
  | "flaws"
  | "stack"
  | "tasks"
  | "algorithms"
  | "models"
  | "execution"
  | "review";

export type GateStatus = "pending" | "running" | "awaiting_user" | "cleared" | "failed";

export type PipelineSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: string;
  statedStack: string;
  policy: RoutingPolicy;
  uploads: { name: string; chars: number }[];
  gate: GateId; // current gate
  gateStatus: GateStatus;
  suitability: Suitability | null;
  suggestedWorkflow: Workflow | null;
  workflow: Workflow | null; // final workflow (user-approved)
  flawReport: FlawReport | null;
  flawResolutions: FlawResolution[];
  stackGate: StackGate | null;
  algorithms: AlgorithmPlan | null;
  routing: RoutingPlan | null;
  executions: ExecutionResult[];
  humanFeedback: {
    ratings: Record<string, { accepted: boolean; rating?: number; note?: string }>;
  };
};

// ---------- Universal decision rule (F8) ----------
export type PipelineStageId =
  | "understanding"
  | "suitability"
  | "flaws"
  | "stack"
  | "algorithms"
  | "routing";

export const TIE_GAP = 0.12; // top-two confidence gap below which it's a "genuine tie"
export const AUTO_FLOOR = 0.72; // below this, never auto-decide

export function needsTieBreak(options: { confidence: number }[]): boolean {
  if (options.length === 0) return true;
  const sorted = [...options].sort((a, b) => b.confidence - a.confidence);
  if (sorted[0].confidence < AUTO_FLOOR) return true;
  if (sorted.length > 1 && sorted[0].confidence - sorted[1].confidence < TIE_GAP) return true;
  return false;
}

// ---------- Session validation for API ----------
export const StartRequestSchema = z.object({
  input: z.string().min(20).max(20000),
  statedStack: z.string().max(2000).default(""),
  policy: z.enum(["lowest_cost", "highest_accuracy", "balanced"]).default("balanced"),
});
export const GateActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suitability_choose"),
    choice: z.enum(["original", "suggested"]),
  }),
  z.object({
    action: z.literal("flaw_resolve"),
    resolutions: z
      .array(
        z.object({
          flawId: z.string(),
          decision: z.enum(["accepted", "rejected", "edited"]),
          editedFix: z.string().max(700).optional(),
        })
      )
      .min(0),
  }),
  z.object({
    action: z.literal("stack_choose"),
    choice: z.string().min(1),
  }),
  z.object({
    action: z.literal("tasks_edit"),
    tasks: z.array(TaskSchema).min(1).max(40),
  }),
  z.object({
    action: z.literal("algorithm_choose"),
    taskId: z.string().min(1),
    choice: z.string().min(1),
  }),
  z.object({
    action: z.literal("model_choose"),
    taskId: z.string().min(1),
    choice: z.enum(MODEL_IDS),
  }),
  z.object({
    action: z.literal("run_execution"),
  }),
  z.object({
    action: z.literal("feedback"),
    taskId: z.string().min(1),
    accepted: z.boolean(),
    rating: z.number().min(1).max(5).optional(),
    note: z.string().max(400).optional(),
    editedOutput: z.string().max(60000).optional(),
  }),
  z.object({
    action: z.literal("battle_run"),
    taskId: z.string().min(1),
    modelA: z.enum(MODEL_IDS),
    modelB: z.enum(MODEL_IDS),
  }),
  z.object({
    action: z.literal("battle_pick"),
    taskId: z.string().min(1),
    winner: z.enum(["a", "b"]),
  }),
]);
export type GateAction = z.infer<typeof GateActionSchema>;
