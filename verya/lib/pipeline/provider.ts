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
import { STRONG_MODEL_ID } from "./types";

// Cheap tier (default workhorse) and strong tier (deep reasoning). Defaults follow the
// Gemini 3.x era; override via env. 2.5 models are retired for new API accounts.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL || "gemini-3.1-pro-preview";
// Failover chain when the primary model 404s/429s/503s (F46: reliability under load).
const GEMINI_FAILOVER_MODELS = (process.env.GEMINI_FAILOVER_MODELS ||
  "gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest,gemini-3.6-flash")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);

function isRetryableModelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /404|NOT_FOUND|not found|429|RESOURCE_EXHAUSTED|quota|503|UNAVAILABLE|overload/i.test(msg)
  );
}

// Free tier: requests are quota'd PER MODEL PER DAY. When a model is exhausted
// (429 RESOURCE_EXHAUSTED with a PerDay quota id), retrying it is pointless —
// record it and fail straight through to the next model, which has fresh quota (F46).
const dailyExhausted = new Set<string>();

function isDailyQuotaExhaustion(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED/i.test(msg) && /PerDay|per_day|PerProjectPerModel/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [2000, 6000, 15000]; // per-model retries for transient 503/429 spikes

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

/** Structured JSON completion (schema-constrained), with model failover (F46). */
async function geminiJson<S extends z.ZodType>(
  stage: PipelineStageId,
  system: string,
  user: string,
  zodSchema: S
): Promise<z.output<S>> {
  const ai = getClient();
  const chain = [GEMINI_MODEL, ...GEMINI_FAILOVER_MODELS.filter((m) => m !== GEMINI_MODEL)];
  let lastErr: unknown = null;

  for (const model of chain) {
    if (dailyExhausted.has(model)) continue;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await ai.models.generateContent({
        model,
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
      lastErr = err;
      if (isDailyQuotaExhaustion(err)) {
        dailyExhausted.add(model);
        break; // done for today on this model — try the next one
      }
      const retryable =
        (err instanceof ProviderError && isRetryableModelError(err.cause ?? err.message)) ||
        (!(err instanceof ProviderError) && isRetryableModelError(err));
      if (!retryable) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new ProviderError(`Stage timed out after ${GEMINI_TIMEOUT_MS}ms`, stage, err);
        }
        throw new ProviderError(err instanceof Error ? err.message : String(err), stage, err);
      }
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue; // same model, backoff retry
      }
      break; // exhausted retries on this model → next in chain
    } finally {
      clearTimeout(timer);
    }
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new ProviderError(`All models failed for stage: ${detail}`, stage, lastErr);
}

/** Free-text completion against a chosen model (used for execution), with failover (F46). */
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
  const chain = [model, ...GEMINI_FAILOVER_MODELS.filter((m) => m !== model)];
  let lastErr: unknown = null;
  const startedTotal = Date.now();

  for (const candidate of chain) {
    if (dailyExhausted.has(candidate)) continue;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS * 2);
    const started = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: candidate,
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
      lastErr = err;
      if (isDailyQuotaExhaustion(err)) {
        dailyExhausted.add(candidate);
        break; // done for today on this model — try the next one
      }
      if (!isRetryableModelError(err)) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new ProviderError("Execution timed out", stage, err);
        }
        throw new ProviderError(err instanceof Error ? err.message : String(err), stage, err);
      }
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      break; // next model in chain
    } finally {
      clearTimeout(timer);
    }
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new ProviderError(`All models failed: ${detail}`, stage, lastErr);
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
  verifyRulesOnly(input: {
    task: Task;
    output: string;
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

  detectFlaws: async ({ raw, workflow }) => {
    const first = await geminiJson(
      "flaws",
      FLAW_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}`,
      FlawReportSchema
    );
    // Self-consistency retry: if the summary claims gaps but flaws is empty, the model
    // dropped the array — one re-ask with the contradiction made explicit.
    const claims = /gap|missing|no |not |lack|omit|without|risk/i;
    if (first.flaws.length === 0 && claims.test(first.summary)) {
      return geminiJson(
        "flaws",
        FLAW_SYSTEM,
        `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}\n\nNOTE: Your previous attempt returned an empty flaws array while its own summary claimed real gaps ("${first.summary.slice(0, 300)}"). Re-analyze and return EVERY flaw in the flaws array — each as a full object with id, title, category, severity, description, suggestedFix, relatedTaskIds. Empty is only valid if the plan is truly clean.`,
        FlawReportSchema
      );
    }
    return first;
  },

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
      model === STRONG_MODEL_ID ? GEMINI_PRO_MODEL : GEMINI_MODEL,
      EXECUTION_SYSTEM,
      `WORKFLOW TITLE: ${workflow.title}\nWORKFLOW SUMMARY: ${workflow.summary}\n\nSTACK: ${stack}\n\nTASK: ${task.title}\nTASK DESCRIPTION: ${task.description}\nCATEGORY: ${task.category}\nCHOSEN APPROACH: ${algorithm}`,
      "execution"
    );
    return { output: res.output ?? res.text, latencyMs: res.latencyMs, tokens: res.tokens };
  },  verifyRulesOnly: async ({ task, output }) => {
    // F13: cheap deterministic pass for low-risk tasks.
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
    return { passed: issues.length === 0, issues, checkedBy: "rules" };
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
    const verifierModel = model === STRONG_MODEL_ID ? GEMINI_MODEL : GEMINI_PRO_MODEL;
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
