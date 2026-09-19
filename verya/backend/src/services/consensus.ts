import type { ProviderName } from "../schemas/pipeline";
import type { Flaw, FlawReport, Workflow, TargetPlatform } from "../schemas/pipeline";
import { FLAW_SYSTEM } from "../lib/ai/prompts";
import { FlawReportSchema } from "../schemas/pipeline";
import { runStructuredStageForProvider } from "../lib/ai/provider";

export type ConsensusProvider = "gemini" | "groq" | "mistral";

export type ModelOpinion = {
  provider: ConsensusProvider;
  status: "completed" | "failed";
  report?: FlawReport;
  error?: string;
};

export type ConsensusIssue = {
  key: string;
  title: string;
  category: string;
  severity: Flaw["severity"];
  description: string;
  suggestedFix: string;
  relatedTaskIds: string[];
  votes: Record<ConsensusProvider, boolean>;
  agreement: number;
  confidence: "high" | "medium" | "low";
};

export type FlawConsensus = {
  opinions: ModelOpinion[];
  issues: ConsensusIssue[];
  completedProviders: number;
  consensusSummary: string;
};

const PROVIDERS: ConsensusProvider[] = ["gemini", "groq", "mistral"];
const severityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function issueKey(title: string, category: string): string {
  return `${category}:${title}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-");
}

function confidenceOf(agreement: number): "high" | "medium" | "low" {
  if (agreement >= 0.67) return "high";
  if (agreement >= 0.34) return "medium";
  return "low";
}

export async function analyzeFlawsByConsensus(input: {
  raw: string;
  workflow: Workflow;
  targetPlatform?: TargetPlatform;
}): Promise<FlawConsensus> {
  const platformContext = input.targetPlatform
    ? `\nTARGET PLATFORM: ${input.targetPlatform === "both" ? "Android and iOS" : input.targetPlatform === "android" ? "Android only" : "iOS only"}`
    : "";
  const user = `PROJECT DESCRIPTION:\n${input.raw}\n\nWORKFLOW:\n${JSON.stringify(input.workflow)}${platformContext}\n\nReturn an independent flaw analysis. Do not defer to other models.`;
  const opinions = await Promise.all(
    PROVIDERS.map(async (provider): Promise<ModelOpinion> => {
      try {
        const report = await runStructuredStageForProvider(
          "flaws",
          FLAW_SYSTEM,
          user,
          FlawReportSchema,
          provider as ProviderName
        );
        return { provider, status: "completed", report };
      } catch (err) {
        return {
          provider,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const completed = opinions.filter((opinion) => opinion.status === "completed") as Array<
    ModelOpinion & { report: FlawReport }
  >;
  if (completed.length === 0) {
    throw new Error("All independent flaw-analysis providers failed.");
  }

  const grouped = new Map<string, ConsensusIssue>();
  for (const opinion of completed) {
    for (const flaw of opinion.report.flaws) {
      const key = issueKey(flaw.title, flaw.category);
      const existing = grouped.get(key);
      if (existing) {
        existing.votes[opinion.provider] = true;
        existing.agreement = Object.values(existing.votes).filter(Boolean).length / completed.length;
        existing.confidence = confidenceOf(existing.agreement);
        if (severityRank[flaw.severity] > severityRank[existing.severity]) existing.severity = flaw.severity;
        if (existing.description.length < flaw.description.length) existing.description = flaw.description;
        if (existing.suggestedFix.length < flaw.suggestedFix.length) existing.suggestedFix = flaw.suggestedFix;
        existing.relatedTaskIds = Array.from(new Set([...existing.relatedTaskIds, ...flaw.relatedTaskIds]));
      } else {
        grouped.set(key, {
          key,
          title: flaw.title,
          category: flaw.category,
          severity: flaw.severity,
          description: flaw.description,
          suggestedFix: flaw.suggestedFix,
          relatedTaskIds: flaw.relatedTaskIds,
          votes: {
            gemini: opinion.provider === "gemini",
            groq: opinion.provider === "groq",
            mistral: opinion.provider === "mistral",
          },
          agreement: 1 / completed.length,
          confidence: confidenceOf(1 / completed.length),
        });
      }
    }
  }

  const issues = Array.from(grouped.values())
    .filter((issue) => issue.agreement >= 0.34)
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  return {
    opinions,
    issues,
    completedProviders: completed.length,
    consensusSummary: `${issues.length} issue(s) identified by ${completed.length}/${PROVIDERS.length} independent provider analyses. User approval remains required.`,
  };
}
