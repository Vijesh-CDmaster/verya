export function trustCostFor(risk: string): number {
  if (risk === "high") return 50;
  if (risk === "medium") return 25;
  return 10;
}

export function initialTrustBudget(): number {
  const value = Number(process.env.VERYA_TRUST_BUDGET || 100);
  return Number.isFinite(value) && value > 0 ? value : 100;
}