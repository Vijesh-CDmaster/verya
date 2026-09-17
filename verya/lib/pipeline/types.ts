// Verya — gated pipeline type definitions
// Pipeline: Intake → Suitability Gate → Flaw Gate → Stack Gate → Task Gate
//           → Algorithm Gate → Model Gate → Execution → Verification → Feedback

import { z } from "zod";

export type Severity = "critical" | "high" | "medium" | "low";
export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

// ---------- Gate 1: Suitability ----------
export const SuitabilitySchema = z.object({
  suitable: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(600),
  suggestedWorkflow: z.string().max(3000).optional(),
  suggestedSummary: z.string().max(400).optional(),
});
export type Suitability = z.infer<typeof SuitabilitySchema>;

// ---------- Workflow (shared across gates) ----------
export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  description: z.string().max(600).default(""),
  category: z.enum([
    "frontend",
    "backend",
    "database",
    "auth",
    "integration",
    "devops",
    "ai",
    "other",
  ]),
  dependsOn: z.array(z.string()).default([]),
  complexity: z.enum(["low", "medium", "high"]).default("medium"),
  risk: z.enum(["low", "medium", "high"]).default("medium"),
});
export type Task = z.infer<typeof TaskSchema>;

export const WorkflowSchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(800),
  tasks: z.array(TaskSchema).min(1).max(30),
  ambiguities: z.array(z.string()).max(10).default([]),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// ---------- Gate 2: Flaw Detection ----------
export const FlawSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(140),
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
  relatedTaskIds: z.array(z.string()).default([]),
});
export const FlawReportSchema = z.object({
  flaws: z.array(FlawSchema).max(20).default([]),
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
  rationale: z.string().max(300).default(""),
});
export const StackProposalSchema = z.object({
  name: z.string().max(80).default("Proposed stack"),
  components: z.array(StackComponentSchema).min(3).max(9),
  summary: z.string().max(400),
  confidence: z.number().min(0).max(1).default(0.7),
});
export type StackProposal = z.infer<typeof StackProposalSchema>;

export const StackValidationSchema = z.object({
  verdict: z.enum(["fit", "fit_with_changes", "poor_fit"]),
  notes: z.array(z.string()).max(8).default([]),
  changes: z
    .array(
      z.object({
        layer: z.string().max(40),
        from: z.string().max(80),
        to: z.string().max(80),
        why: z.string().max(300),
      })
    )
    .max(8)
    .default([]),
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
  candidates: z.array(StackCandidateSchema).min(1).max(3),
  selected: z.string().nullable(), // proposal name of chosen candidate
  tieBreakRequired: z.boolean(),
});
export type StackGate = z.infer<typeof StackGateSchema>;

// ---------- Gate 5: Algorithms (per task) ----------
export const AlgorithmOptionSchema = z.object({
  name: z.string().min(1).max(80),
  approach: z.string().max(400),
  pros: z.array(z.string()).max(5).default([]),
  cons: z.array(z.string()).max(5).default([]),
  confidence: z.number().min(0).max(1),
});
export const TaskAlgorithmSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().max(120),
  options: z.array(AlgorithmOptionSchema).min(1).max(4),
  selected: z.string().min(1).max(80),
  tieBreakRequired: z.boolean(),
  tieBreakReason: z.string().max(300).default(""),
  humanChoice: z.string().max(80).nullable().default(null),
});
export const AlgorithmPlanSchema = z.object({
  tasks: z.array(TaskAlgorithmSchema).min(1),
});
export type AlgorithmOption = z.infer<typeof AlgorithmOptionSchema>;
export type TaskAlgorithm = z.infer<typeof TaskAlgorithmSchema>;
export type AlgorithmPlan = z.infer<typeof AlgorithmPlanSchema>;

// ---------- Gate 6: Model routing ----------
export const MODEL_IDS = ["gemini-2.5-pro", "gemini-2.5-flash"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const TaskModelRouteSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string().max(120),
  options: z
    .array(
      z.object({
        model: z.enum(MODEL_IDS),
        confidence: z.number().min(0).max(1),
        estimatedCost: z.number().min(0),
        estimatedLatencyMs: z.number().min(0),
        qualifiesBecause: z.string().max(200).default(""),
      })
    )
    .min(1)
    .max(2),
  selectedModel: z.enum(MODEL_IDS),
  reason: z.string().max(300),
  confidence: z.number().min(0).max(1),
  tieBreakRequired: z.boolean(),
  humanChoice: z.string().max(40).nullable().default(null),
});
export const RoutingPlanSchema = z.object({
  routes: z.array(TaskModelRouteSchema).min(1),
  policy: z.enum(["lowest_cost", "highest_accuracy", "balanced"]).default("balanced"),
  estimatedCostUsd: z.number().min(0),
  notes: z.string().max(400).default(""),
});
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
  verification: z.object({
    method: z.enum(["rules", "second_model"]),
    passed: z.boolean(),
    issues: z.array(z.string().max(300)).default([]),
    checkedBy: z.enum(MODEL_IDS),
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
      .min(1),
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
  }),
]);
export type GateAction = z.infer<typeof GateActionSchema>;
