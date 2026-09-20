import { listPolicySuggestions } from "./policies";
import { leaderboard } from "./reputation";
import { escalationFloorFor, selfAuditThreshold, verificationDepthFor } from "../lib/thresholds";

export async function buildConstitution(orgId: string) {
  const [policies, reputation] = await Promise.all([listPolicySuggestions(orgId), leaderboard(orgId)]);
  const approved = policies.filter((policy) => policy.status === "approved");
  const topModels = reputation.slice(0, 8).map((entry) => ({
    model: entry.model,
    taskCategory: entry.taskCategory,
    trustScore: entry.trustScore,
    samples: entry.samples,
  }));
  const generatedAt = new Date().toISOString();
  const text = [
    "Verya Governance Constitution",
    `Generated: ${generatedAt}`,
    "",
    "Active governance rules",
    ...(approved.length ? approved.map((policy) => `- ${policy.rule}`) : ["- No organization-specific rules have been approved yet."]),
    "",
    "Verification requirements",
    `- Low-risk tasks: ${verificationDepthFor("low")}.`,
    `- Medium-risk tasks: ${verificationDepthFor("medium")}.`,
    `- High-risk tasks: ${verificationDepthFor("high")} plus adversarial audit at risk ${selfAuditThreshold()}.`,
    "",
    "Escalation floors",
    `- Low risk: ${escalationFloorFor("low")}.`,
    `- Medium risk: ${escalationFloorFor("medium")}.`,
    `- High risk: ${escalationFloorFor("high")}.`,
    "",
    "Observed model performance",
    ...(topModels.length ? topModels.map((entry) => `- ${entry.model} for ${entry.taskCategory}: trust ${entry.trustScore.toFixed(1)} across ${entry.samples} sample(s).`) : ["- No reputation history is available yet."]),
  ].join("\n");
  return { generatedAt, approvedPolicies: approved, topModels, text };
}
