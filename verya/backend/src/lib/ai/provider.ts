// Verya — multi-provider model layer
// ALL AI calls go through this file. The four configured API keys (Gemini, Groq,
// OpenRouter, Mistral) form ONE routing pool (MODEL_POOL in types.ts). The model
// router assigns a pool model per task by specialty + cost tier; execution runs on
// the assigned model and fails over across providers (F46). Stage calls (suitability,
// flaws, stack, algorithms, routing) run on the strongest structured-output model
// available and fall through the rest of the pool. Your separate ML models implement
// the same StageAdapters interface; nothing else changes.

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
import type { PipelineStageId, ProviderName } from "../../schemas/pipeline";
import { MODEL_POOL, poolModelOf } from "../../schemas/pipeline";
import {
  WorkflowSchema,
  SuitabilitySchema,
  FlawReportSchema,
  StackValidationSchema,
  StackProposalSchema,
  AlgorithmPlanSchema,
  RoutingPlanSchema,
} from "../../schemas/pipeline";
import type {
  Workflow,
  Suitability,
  FlawReport,
  StackValidation,
  AlgorithmPlan,
  RoutingPlan,
  Task,
  StackProposal as StackProposalT,
} from "../../schemas/pipeline";

const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || GEMINI_TIMEOUT_MS);
// Gemini-only structured-output failover chain (same key, per-model daily quotas).
const GEMINI_FAILOVER_MODELS = (process.env.GEMINI_FAILOVER_MODELS ||
  "gemini-3.5-flash,gemini-3.1-flash-lite,gemini-flash-latest,gemini-3.6-flash")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Per-model retries for transient 503/429 demand spikes. Free tiers rate-limit
// per minute per model, so the total retry window must span a full cooldown
// (~60s) — otherwise the chain gives up just before quota resets.
const RETRY_DELAYS_MS = [3000, 8000, 15000, 25000, 40000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ProviderConfig = {
  name: ProviderName;
  apiKey: string;
  endpoint?: string; // OpenAI-compatible chat completions endpoint
  // Default structured-stage model per provider (env-overridable).
  stageModel: string;
};

function getProviderConfigs(): ProviderConfig[] {
  const configs: Array<Omit<ProviderConfig, "apiKey"> & { apiKey: string | undefined }> = [
    {
      name: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      stageModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    },
    {
      name: "groq",
      apiKey: process.env.GROQ_API_KEY,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      stageModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    },
    {
      name: "mistral",
      apiKey: process.env.MISTRAL_API_KEY,
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      stageModel: process.env.MISTRAL_MODEL || "mistral-medium-latest",
    },
    {
      name: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      stageModel: process.env.OPENROUTER_MODEL || "z-ai/glm-5.2:free",
    },
  ];
  const configured = configs.filter(
    (c): c is ProviderConfig => typeof c.apiKey === "string" && c.apiKey.length > 0
  );
  if (configured.length === 0) {
    throw new ProviderError(
      "No AI provider is configured. Set at least one provider API key (GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY) in verya/.env.local.",
      "understanding"
    );
  }
  return configured;
}

function providerConfigOf(name: ProviderName): ProviderConfig | undefined {
  return getProviderConfigs().find((p) => p.name === name);
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

function isRetryableModelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /404|NOT_FOUND|not found|429|RESOURCE_EXHAUSTED|quota|503|UNAVAILABLE|overload|timeout|aborted|ECONNRESET|fetch failed/i.test(msg);
}

// Free tiers quota requests PER MODEL PER DAY. When a model is exhausted (429 with a
// PerDay quota id), retrying it is pointless — record it and fail straight through to
// the next model, which has fresh quota (F46).
const dailyExhausted = new Set<string>(); // key: `${provider}:${model}`
function isDailyQuotaExhaustion(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|quota/i.test(msg) && /PerDay|per_day|daily|PerProjectPerModel/i.test(msg);
}
function markExhausted(provider: ProviderName, model: string) {
  dailyExhausted.add(`${provider}:${model}`);
}
function isExhausted(provider: ProviderName, model: string): boolean {
  return dailyExhausted.has(`${provider}:${model}`);
}

// ---------- Gemini native caller (structured output via SDK) ----------
let geminiClient: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

async function geminiStructured<S extends z.ZodType>(
  stage: PipelineStageId,
  system: string,
  user: string,
  zodSchema: S,
  model: string
): Promise<z.output<S>> {
  const ai = getClient();
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
    if (!text) throw new Error("Empty response from Gemini");
    const parsed: unknown = JSON.parse(text);
    const result = zodSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Schema validation failed: ${result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`
      );
    }
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- OpenAI-compatible caller (Groq / Mistral / OpenRouter) ----------
type ChatResult = { text: string; latencyMs: number; tokens: { input: number; output: number } };

async function chatCompatible(
  provider: ProviderConfig,
  model: string,
  system: string,
  user: string,
  opts: { json?: boolean; jsonHint?: string; timeoutMs?: number }
): Promise<ChatResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? PROVIDER_TIMEOUT_MS);
  const userContent = opts.jsonHint ? `${user}\n\nRespond with ONLY a valid JSON object of this shape:\n${opts.jsonHint}` : user;
  try {
    const response = await fetch(provider.endpoint!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`${provider.name} returned HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((part) => part.text || "").join("")
      : content;
    if (!text) throw new Error(`${provider.name} returned an empty response`);
    return {
      text,
      latencyMs: Date.now() - started,
      tokens: {
        input: payload.usage?.prompt_tokens ?? 0,
        output: payload.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${provider.name} timed out after ${opts.timeoutMs ?? PROVIDER_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort JSON extraction from a model response (handles fences/prose wrappers). */
function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("Model returned unparseable JSON");
  }
}

// ---------- Structured stage calls: primary model first, then the whole pool ----------
type StageModel = { provider: ProviderName; model: string; structured: boolean };

function stageChain(stage: PipelineStageId): StageModel[] {
  void stage;
  const chain: StageModel[] = [];
  // 1) Gemini structured-output models (best schema adherence), own failover chain.
  for (const m of [process.env.GEMINI_MODEL || "gemini-3.6-flash", ...GEMINI_FAILOVER_MODELS]) {
    if (!chain.some((c) => c.provider === "gemini" && c.model === m)) {
      chain.push({ provider: "gemini", model: m, structured: true });
    }
  }
  // 2) OpenAI-compatible providers with JSON mode, strongest first.
  const gem = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  void gem;
  for (const p of getProviderConfigs()) {
    if (p.name === "gemini") continue;
    chain.push({ provider: p.name, model: p.stageModel, structured: false });
  }
  return chain;
}

async function runStructuredStage<S extends z.ZodType>(
  stage: PipelineStageId,
  system: string,
  user: string,
  zodSchema: S
): Promise<z.output<S>> {
  const hint = JSON.stringify(zodToGeminiSchema(zodSchema)).slice(0, 4000);
  const chain = stageChain(stage);
  let lastErr: unknown = null;

  for (const attemptModel of chain) {
    if (isExhausted(attemptModel.provider, attemptModel.model)) continue;
    const provider = providerConfigOf(attemptModel.provider);
    if (!provider) continue;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        if (attemptModel.structured) {
          return await geminiStructured(stage, system, user, zodSchema, attemptModel.model);
        }
        const res = await chatCompatible(provider, attemptModel.model, system, user, {
          json: true,
          jsonHint: hint,
        });
        const parsed = zodSchema.safeParse(extractJson(res.text));
        if (!parsed.success) {
          throw new Error(
            `Schema validation failed: ${parsed.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")}`
          );
        }
        return parsed.data;
      } catch (err) {
        lastErr = err;
        if (isDailyQuotaExhaustion(err)) {
          markExhausted(attemptModel.provider, attemptModel.model);
          break;
        }
        // Schema-validation failures are worth one same-model re-ask (models often
        // self-correct when the error is shown) before moving to the next provider.
        if (/Schema validation failed/i.test(String(lastErr))) {
          if (attempt === 0) {
            try {
              const res2 = await chatCompatible(provider, attemptModel.model, system, user, {
                json: true,
                jsonHint: hint,
                timeoutMs: PROVIDER_TIMEOUT_MS,
              });
              const parsed2 = zodSchema.safeParse(extractJson(res2.text));
              if (parsed2.success) return parsed2.data;
            } catch {
              /* fall through to next model */
            }
          }
          break;
        }
        if (!isRetryableModelError(err)) break; // next model in chain
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        break;
      }
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new ProviderError(`All providers failed for ${stage}: ${detail}`, stage, lastErr);
}

// ---------- Free-text execution with cross-provider failover ----------
export type TextResult = ChatResult & { servedBy: string };

export async function runModelText(
  requestedModel: string,
  system: string,
  user: string,
  stage: "execution" | "verification",
  excludeProvider?: ProviderName
): Promise<TextResult> {
  const requested = poolModelOf(requestedModel);
  const primaryProvider: ProviderName = requested?.provider ?? "groq";

  // Failover order: requested model first, then same-provider siblings, then the
  // other providers' models (specialties unweighted here — availability wins).
  const sameProvider = MODEL_POOL.filter(
    (m) => m.provider === primaryProvider && m.id !== requestedModel
  ).map((m) => m.id);
  const otherProviders = MODEL_POOL.filter((m) => m.provider !== primaryProvider).map((m) => m.id);
  const chain = [requestedModel, ...sameProvider, ...otherProviders];

  // For verification, prefer skipping the executor's provider entirely for independence.
  const ordered = excludeProvider
    ? [
        requestedModel,
        ...MODEL_POOL.filter((m) => m.provider !== excludeProvider && m.id !== requestedModel).map((m) => m.id),
        ...MODEL_POOL.filter((m) => m.provider === excludeProvider && m.id !== requestedModel).map((m) => m.id),
      ]
    : chain;

  let lastErr: unknown = null;
  for (const model of ordered) {
    const pool = poolModelOf(model);
    if (!pool) continue;
    if (isExhausted(pool.provider, model)) continue;
    const provider = providerConfigOf(pool.provider);
    if (!provider) continue;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await chatCompatible(provider, model, system, user, {
          timeoutMs: PROVIDER_TIMEOUT_MS * 2,
        });
        return { ...res, servedBy: model };
      } catch (err) {
        lastErr = err;
        if (isDailyQuotaExhaustion(err)) {
          markExhausted(pool.provider, model);
          break;
        }
        if (!isRetryableModelError(err)) break;
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        break;
      }
    }
  }
  // Last resort: Gemini native (different SDK path, same key pool).
  if (process.env.GEMINI_API_KEY) {
    for (const model of [process.env.GEMINI_MODEL || "gemini-3.6-flash", ...GEMINI_FAILOVER_MODELS]) {
      if (isExhausted("gemini", model)) continue;
      try {
        const ai = getClient();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS * 2);
        try {
          const response = await ai.models.generateContent({
            model,
            contents: user,
            config: { systemInstruction: system, abortSignal: controller.signal, temperature: 0.4 },
          });
          const text = response.text ?? "";
          if (text) {
            return {
              text,
              latencyMs: 0,
              tokens: {
                input: response.usageMetadata?.promptTokenCount ?? 0,
                output: response.usageMetadata?.candidatesTokenCount ?? 0,
              },
              servedBy: model,
            };
          }
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastErr = err;
        if (isDailyQuotaExhaustion(err)) markExhausted("gemini", model);
      }
    }
  }
  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new ProviderError(`All models failed for ${stage}: ${detail}`, stage, lastErr);
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
  recommendAlgorithms(input: { workflow: Workflow; stack: string; memoryContext?: string }): Promise<AlgorithmPlan>;
  routeModels(input: {
    workflow: Workflow;
    algorithmPlan: AlgorithmPlan;
    stack: string;
    memoryContext?: string;
  }): Promise<RoutingPlan>;
  executeTask(input: {
    task: Task;
    algorithm: string;
    stack: string;
    workflow: Workflow;
    model: string;
  }): Promise<{ output: string; latencyMs: number; tokens: { input: number; output: number }; servedBy?: string }>;
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
  understand: (raw) => runStructuredStage("understanding", UNDERSTANDING_SYSTEM, raw, WorkflowSchema),

  checkSuitability: ({ raw, workflow }) =>
    runStructuredStage(
      "suitability",
      SUITABILITY_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nEXTRACTED WORKFLOW:\n${JSON.stringify(workflow)}`,
      SuitabilitySchema
    ),

  detectFlaws: async ({ raw, workflow }) => {
    const first = await runStructuredStage(
      "flaws",
      FLAW_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}`,
      FlawReportSchema
    );
    // Self-consistency retry: if the summary claims gaps but flaws is empty, the model
    // dropped the array — one re-ask with the contradiction made explicit.
    const claims = /gap|missing|no |not |lack|omit|without|risk/i;
    if (first.flaws.length === 0 && claims.test(first.summary)) {
      return runStructuredStage(
        "flaws",
        FLAW_SYSTEM,
        `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}\n\nNOTE: Your previous attempt returned an empty flaws array while its own summary claimed real gaps ("${first.summary.slice(0, 300)}"). Re-analyze and return EVERY flaw in the flaws array — each as a full object with id, title, category, severity, description, suggestedFix, relatedTaskIds. Empty is only valid if the plan is truly clean.`,
        FlawReportSchema
      );
    }
    return first;
  },

  validateStack: ({ raw, workflow, statedStack }) =>
    runStructuredStage(
      "stack",
      STACK_VALIDATE_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}\n\nUSER'S STACK:\n${statedStack}`,
      StackValidationSchema
    ),

  proposeStacks: async ({ raw, workflow }) => {
    const ArraySchema = z.object({ candidates: z.array(StackProposalSchema).min(1).max(3) });
    const out = await runStructuredStage(
      "stack",
      STACK_RECOMMEND_SYSTEM,
      `PROJECT DESCRIPTION:\n${raw}\n\nWORKFLOW:\n${JSON.stringify(workflow)}`,
      ArraySchema
    );
    return out.candidates;
  },

  recommendAlgorithms: ({ workflow, stack, memoryContext }) =>
    runStructuredStage(
      "algorithms",
      ALGORITHM_SYSTEM,
      `WORKFLOW:\n${JSON.stringify(workflow)}\n\nCHOSEN STACK:\n${stack}${memoryContext ? `\n\nORG MEMORY (outcomes from this organization's similar past tasks — prefer approaches whose category historically did well; treat "rejected"/"flagged" histories as warnings):\n${memoryContext}` : ""}`,
      AlgorithmPlanSchema
    ),

  routeModels: ({ workflow, algorithmPlan, stack, memoryContext }) =>
    runStructuredStage(
      "routing",
      ROUTING_SYSTEM,
      `WORKFLOW:\n${JSON.stringify(workflow)}\n\nCHOSEN STACK:\n${stack}\n\nALGORITHM PLAN:\n${JSON.stringify(algorithmPlan)}${memoryContext ? `\n\nORG MEMORY (this organization's recorded outcomes per model and task category — a model that repeatedly earned "accepted" for a category deserves a confidence bump for similar tasks; one with "rejected"/"flagged" history deserves caution):\n${memoryContext}` : ""}`,
      RoutingPlanSchema
    ),

  executeTask: async ({ task, algorithm, stack, workflow, model }) => {
    const res = await runModelText(
      model,
      EXECUTION_SYSTEM,
      `WORKFLOW TITLE: ${workflow.title}\nWORKFLOW SUMMARY: ${workflow.summary}\n\nSTACK: ${stack}\n\nTASK: ${task.title}\nTASK DESCRIPTION: ${task.description}\nCATEGORY: ${task.category}\nCHOSEN APPROACH: ${algorithm}`,
      "execution"
    );
    return { output: res.text, latencyMs: res.latencyMs, tokens: res.tokens, servedBy: res.servedBy };
  },

  verifyRulesOnly: async ({ task, output }) => {
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

    // Second-model verification on a DIFFERENT provider than the executor (independence).
    const executorProvider = poolModelOf(model)?.provider;
    try {
      const res = await runModelText(
        "mistral-medium-latest",
        VERIFICATION_SYSTEM,
        `TASK: ${task.title}\nTASK DESCRIPTION: ${task.description}\nCHOSEN APPROACH: ${algorithm}\n\nOUTPUT TO VERIFY:\n${output.slice(0, 12000)}`,
        "verification",
        executorProvider
      );
      let parsed: { passed?: boolean; issues?: string[] };
      try {
        parsed = extractJson(res.text) as typeof parsed;
      } catch {
        parsed = { passed: undefined, issues: [res.text.slice(0, 300)] };
      }
      const secondModelIssues = (parsed.issues ?? []).slice(0, 6);
      const modelPassed = parsed.passed !== false;
      return {
        passed: modelPassed && checkedByRules.passed,
        issues: [...checkedByRules.issues, ...secondModelIssues].slice(0, 10),
        checkedBy: res.servedBy,
      };
    } catch {
      // Verification model failed — rely on rules pass only, flag for review.
      return {
        passed: checkedByRules.passed,
        issues: [...checkedByRules.issues, "Second-model verification unavailable; rules-only pass."],
        checkedBy: "rules",
      };
    }
  },
};
