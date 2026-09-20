import { leaderboard } from "./reputation";

export async function forecastTaskFailure(input: {
  orgId: string;
  model: string;
  taskCategory: string;
  risk: string;
  injectionRisk?: number;
}) {
  const reputation = await leaderboard(input.orgId).catch(() => []);
  const history = reputation.find((entry) => entry.model === input.model && entry.taskCategory === input.taskCategory);
  let probability = input.risk === "high" ? 0.35 : input.risk === "medium" ? 0.2 : 0.1;
  const reasons: string[] = [`${input.risk}-risk task baseline`];
  if (history && history.samples >= 2 && history.trustScore < 50) {
    probability += 0.2;
    reasons.push(`model trust is ${history.trustScore.toFixed(1)} for this category`);
  }
  if ((input.injectionRisk ?? 0) >= 0.3) {
    probability += 0.2;
    reasons.push("intake content carries prompt-injection risk");
  }
  probability = Math.min(0.95, Math.round(probability * 100) / 100);
  return { probability, reason: reasons.join("; "), basedOnSamples: history?.samples ?? 0 };
}
