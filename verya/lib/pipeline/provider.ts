// Verya — provider adapter (R2 / F7 policy note)
// ALL AI calls go through this file. Today: Gemini alone (single key).
// Your separate ML models implement StageAdapters per stage; nothing else changes.
// Execution/verification use direct model calls (no structured output) where appropriate.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToGeminiSchema } from "./zodToGemini";
import {
  UNDERSTANDING_SYSTEM,
  SUITABILITY_SYSTEM,
  FLAW_SYSTEM,
  STACK_VALIDATE_SYSTEM,
  STACK_RECOMMEND_SYSTEM,
  ALGORITHM_SYSTEM,
  ROUTING_SYSTEM,
  EXECUTION_SYSTEM,
  VERIFICATION_SYSTEM,
} from "./prompts";
import type { PipelineStageId } from "./types";
import {
  WorkflowSchema,
  SuitabilitySchema,
  FlawReportSchema,
  StackValidationSchema,
  StackProposalSchema,
  AlgorithmPlanSchema,
  RoutingPlanSchema,
} from "./types";
import type {
  Workflow,
  Suitability,
  FlawReport,
  StackValidation,
  AlgorithmPlan,
  RoutingPlan,
  Task,
  StackProposal as StackProposalT,
} from "./types";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL || "gemini-2.5-pro";
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to verya/.env.local (see verya/.env.example)."
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly stage: PipelineStageId | "execution" | "verification",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Structured JSON completion (schema-constrained). */
async function geminiJson<S extends z.ZodType>(
  stage: PipelineStageId,
  system: string,
  user: string,
  zodSchema: S
): Promise<z.output<S>> {
  const ai = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema: zodToGeminiSchema(zodSchema),
        abortSignal: controller.signal,
        temperature: 0.3,
      },
    });
    const text = response.text ?? "";
    if (!text) throw new ProviderError("Empty response from model", stage);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ProviderError("Model returned invalid JSON", stage);
    }
    const result = zodSchema.safeParse(parsed);
    if (!result.success) {
      throw new ProviderError(
        `Schema validation failed: ${result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        stage
      );
    }
    return result.data;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError(`Stage timed out after ${GEMINI_TIMEOUT_MS}ms`, stage, err);
    }
    throw new ProviderError(err instanceof Error ? err.message : String(err), stage, err);
  } finally {
    clearTimeout(timer);
  }
}

/** Free-text completion against a chosen model (used for execution). */
async function geminiText(
  model: string,
  system: string,
  user: string,
  stage: "execution" | "verification"
): Promise<{
  text: string;
  output?: string;
  latencyMs: number;
  tokens: { input: number; output: number };
}> {
  const ai = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS * 2);
  const started = Date.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        abortSignal: controller.signal,
        temperature: 0.4,
      },
    });
    const text = response.text ?? "";
    if (!text) throw new ProviderError("Empty response from model", stage);
    const usage = response.usageMetadata;
    const latencyMs = Date.now() - started;
    const tokens = {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
    };
    return stage === "execution"
      ? { text, output: text, latencyMs, tokens }
      : { text, latencyMs, tokens };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError("Execution timed out", stage, err);
    }
    throw new ProviderError(err instanceof Error ? err.message : String(err), stage, err);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- The adapter interface your ML models will implement ----------
export interface StageAdapters {
  understand(raw: string): Promise<Workflow>;
  checkSuitability(input: { raw: string; workflow: Workflow }): Promise<Suitability>;
  detectFlaws(input: { raw: string; workflow: Workflow }): Promise<FlawReport>;
  validateStack(input: {
    raw: string;
    workflow: Workflow;
    statedStack: string;
  }): Promise<StackValidation>;
  proposeStacks(input: { raw: string; workflow: Workflow }): Promise<StackProposalT[]>;
  recommendAlgorithms(input: { workflow: Workflow; stack: string }): Promise<AlgorithmPlan>;
  routeModels(input: {
    workflow: Workflow;
    algorithmPlan: AlgorithmPlan;
    stack: string;
  }): Promise<RoutingPlan>;
  executeTask(input: {
    task: Task;
    algorithm: string;
    stack: string;
    workflow: Workflow;
    model: string;
  }): Promise<{ output: string; latencyMs: number; tokens: { input: number; output: number } }>;
  verifyOutput(input: {
    task: Task;
    algorithm: string;
    output: string;
    model: string;
  }): Promise<{ passed: boolean; issues: string[]; checkedBy: string }>;
}

export const geminiAdapters: StageAdapters = {
  understand: (raw) => geminiJson("understanding", UNDERSTANDING_SYSTEM, raw, WorkflowSchema),

  checkSuitability: ({ raw, workflow }) =>
    geminiJson(
      "suitability",
      SUITABILITY_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nEXTRACTED WORKFLOW:\n${JSON.stringify(workflow)}`,
      SuitabilitySchema
    ),

  detectFlaws: ({ raw, workflow }) =>
    geminiJson(
      "flaws",
      FLAW_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}`,
      FlawReportSchema
    ),

  validateStack: ({ raw, workflow, statedStack }) =>
    geminiJson(
      "stack",
      STACK_VALIDATE_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}\n\nUSER'S STACK:\n${statedStack}`,
      StackValidationSchema
    ),

  proposeStacks: async ({ raw, workflow }) => {
    // One structured call returns an array of candidates (kept to 1-3 by the prompt).
    const ArraySchema = z.object({ candidates: z.array(StackProposalSchema).min(1).max(3) });
    const out = await geminiJson(
      "stack",
      STACK_RECOMMEND_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}`,
      ArraySchema
    );
    return out.candidates;
  },

  recommendAlgorithms: ({ workflow, stack }) =>
    geminiJson(
      "algorithms",
      ALGORITHM_SYSTEM,
      `WORKFLOW:\n${JSON.stringify(workflow)}\n\nCHOSEN STACK:\n${stack}`,
      AlgorithmPlanSchema
    ),

  routeModels: ({ workflow, algorithmPlan, stack }) =>
    geminiJson(
      "routing",
      ROUTING_SYSTEM,
      `WORKFLOW:\n${JSON.stringify(workflow)}\n\nCHOSEN STACK:\n${stack}\n\nALGORITHM PLAN:\n${JSON.stringify(algorithmPlan)}`,
      RoutingPlanSchema
    ),

  executeTask: async ({ task, algorithm, stack, workflow, model }) => {
    const res = await geminiText(
      model === "gemini-2.5-pro" ? GEMINI_PRO_MODEL : GEMINI_MODEL,
      EXECUTION_SYSTEM,
      `WORKFLOW TITLE: ${workflow.title}\nWORKFLOW SUMMARY: ${workflow.summary}\n\nSTACK: ${stack}\n\nTASK: ${task.title}\nTASK DESCRIPTION: ${task.description}\nCATEGORY: ${task.category}\nCHOSEN APPROACH: ${algorithm}`,
      "execution"
    );
    return { output: res.output ?? res.text, latencyMs: res.latencyMs, tokens: res.tokens };
  },

  verifyOutput: async ({ task, algorithm, output, model }) => {
    // Rules-engine pre-pass (fast, free): static checks.
    const issues: string[] = [];
    const lower = output.toLowerCase();
    if (/password\s*=\s*["'][^"']+["']/.test(lower))
      issues.push("Possible hardcoded secret/credential in output.");
    if (/api[_-]?key\s*=\s*["'][^"']+["']/.test(lower))
      issues.push("Possible hardcoded API key in output.");
    if (/drop\s+table|;\s*delete\s+from/.test(lower))
      issues.push("Potentially dangerous raw SQL pattern in output.");
    if (task.category === "auth" && !/(hash|bcrypt|argon|scrypt)/.test(lower))
      issues.push("Auth task output does not mention password hashing.");
    const checkedByRules = { passed: issues.length === 0, issues, checkedBy: "rules" };

    // Second-model verification: use the other model for independence.
    const verifierModel = model === "gemini-2.5-pro" ? GEMINI_MODEL : GEMINI_PRO_MODEL;
    try {
      const res = await geminiText(
        verifierModel,
        VERIFICATION_SYSTEM,
        `TASK: ${task.title}\nTASK DESCRIPTION: ${task.description}\nCHOSEN APPROACH: ${algorithm}\n\nOUTPUT TO VERIFY:\n${output.slice(0, 12000)}`,
        "verification"
      );
      const parsed = JSON.parse(res.text) as { passed?: boolean; issues?: string[] };
      return {
        passed: Boolean(parsed.passed) && checkedByRules.passed,
        issues: [...checkedByRules.issues, ...(parsed.issues ?? [])].slice(0, 10),
        checkedBy: verifierModel,
      };
    } catch {
      // Verification model failed — rely on rules pass only, flag for review.
      return {
        passed: checkedByRules.passed,
        issues: [
          ...checkedByRules.issues,
          "Second-model verification unavailable; rules-only pass.",
        ],
        checkedBy: "rules",
      };
    }
  },
};
