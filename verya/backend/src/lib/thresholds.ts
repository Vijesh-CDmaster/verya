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

/** Risk score at which the F14 adversarial audit escalates a high-risk output. */
export function selfAuditThreshold(): number {
  const value = Number(process.env.VERYA_SELF_AUDIT_THRESHOLD || 0.55);
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.55;
}

export type VerificationDepth = "rules" | "second_model";

/** F13: choose verification depth per risk, with deployment overrides. */
export function verificationDepthFor(risk: string | undefined): VerificationDepth {
  const key = (risk || "medium").toLowerCase();
  const configured = process.env[`VERYA_VERIFICATION_DEPTH_${key.toUpperCase()}`];
  if (configured === "rules" || configured === "second_model") return configured;
  return key === "low" ? "rules" : "second_model";
}
