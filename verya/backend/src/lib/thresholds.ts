// Verya — configurable thresholds (F11): escalation floors per task risk level.
// Env-overridable so departments/workflow types can tighten or loosen escalation
// without code changes (VERYA_ESCALATION_FLOOR_HIGH / _MEDIUM / _LOW).

const DEFAULT_FLOORS: Record<string, number> = {
  high: 0.85,
  medium: 0.55,
  low: 0.4,
};

export function escalationFloorFor(risk: string | undefined): number {
  const key = (risk || "medium").toLowerCase();
  const env = process.env[`VERYA_ESCALATION_FLOOR_${key.toUpperCase()}`];
  if (env && Number.isFinite(Number(env))) return Number(env);
  return DEFAULT_FLOORS[key] ?? DEFAULT_FLOORS.medium;
}
