"use client";

// F22 trust badges: compact per-model reputation indicator shown wherever a model
// appears. Pulls the live leaderboard; renders nothing when there's no data yet.
import { useReputation } from "@/hooks/use-session";

function scoreVariant(score: number, samples: number): { className: string; label: string } | null {
  if (samples === 0) return null;
  if (score >= 75) return { className: "text-emerald-400", label: "trusted" };
  if (score >= 55) return { className: "text-amber-400", label: "mixed" };
  return { className: "text-red-400", label: "risky" };
}

export function TrustBadge({ model }: { model: string }) {
  const { data, isLoading } = useReputation();
  if (isLoading) return <span className="text-[11px] text-muted">…</span>;

  const entries = data?.entries ?? [];
  const relevant = entries.filter((e) => e.model === model);
  if (relevant.length === 0) return null;

  const best = relevant.reduce((a, b) => (b.trustScore > a.trustScore ? b : a));
  const variant = scoreVariant(best.trustScore, best.samples);
  if (!variant) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] ${variant.className}`}
      title={`${model} — trust ${best.trustScore}/100 across ${best.samples} run(s), trend ${best.trend}. Best category: ${best.taskCategory}`}
    >
      ● {variant.label} {best.trustScore}
    </span>
  );
}
