"use client";

import { useState } from "react";
import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrustBadge } from "@/components/dashboard/TrustBadge";

type Route = {
  taskId: string;
  taskTitle: string;
  selectedModel: string;
  reason: string;
  tieBreakRequired: boolean;
  options: { model: string; confidence: number; estimatedCost: number; estimatedLatencyMs: number; qualifiesBecause: string }[];
};

export function GateModels({
  session,
  call,
  busy,
  onExecute,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
  onExecute: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const routing = (session.routing ?? null) as
    | { routes: Route[]; estimatedCostUsd: number; policy: string; notes: string }
    | null;
  if (!routing) return <p className="text-sm text-muted">Loading…</p>;

  const pending = routing.routes.filter((r) => r.tieBreakRequired);

  if (pending.length === 0) {
    return (
      <div>
        <p className="text-[13px] text-emerald-400">
          ✓ Model auto-routed for every task. Estimated cost: ${routing.estimatedCostUsd.toFixed(2)}{" "}
          <span className="text-muted">(policy: {routing.policy})</span>
        </p>
        <ul className="mt-3 space-y-2">
          {routing.routes.map((r) => (
            <li key={r.taskId} className="rounded-lg border border-line bg-elev px-4 py-3 text-[13px]">
              <span className="font-medium">{r.taskTitle}</span>
              <span className="ml-2 rounded border border-line bg-card px-2 py-0.5 font-mono text-[11px]">
                {r.selectedModel}
              </span>
              <TrustBadge model={r.selectedModel} />
              <p className="mt-1 text-[12px] text-muted">{r.reason}</p>
              {r.options.length > 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor={`override-${r.taskId}`} className="text-[11px] text-muted">Override model</label>
                  <select
                    id={`override-${r.taskId}`}
                    value={overrides[r.taskId] ?? r.selectedModel}
                    onChange={(event) => setOverrides((current) => ({ ...current, [r.taskId]: event.target.value }))}
                    className="rounded border border-line bg-card px-2 py-1 font-mono text-[11px]"
                    disabled={busy}
                  >
                    {r.options.map((option) => <option key={option.model} value={option.model}>{option.model}</option>)}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !overrides[r.taskId] || overrides[r.taskId] === r.selectedModel}
                    onClick={() => call({ action: "model_choose", taskId: r.taskId, choice: overrides[r.taskId] })}
                  >
                    Apply override
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Button className="mt-4" disabled={busy} onClick={onExecute}>
          {busy ? "Executing…" : "Execute all tasks →"}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[13px]">
        <span className="font-semibold text-amber-400">{pending.length} model choice(s) are close.</span>{" "}
        <span className="text-muted">Both qualify — you pick.</span>
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((r) => (
          <li key={r.taskId} className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.taskTitle}</span>
              <Badge variant="warn">Tie — your call</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {r.options.map((opt) => (
                <div key={opt.model} className="rounded border border-line bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] font-semibold">{opt.model}</span>
                    <span className="text-[11px] text-muted">{Math.round(opt.confidence * 100)}%</span>
                  </div>
                  <TrustBadge model={opt.model} />
                  <p className="mt-1 text-[12px] text-muted">{opt.qualifiesBecause}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    cost ≈ ${opt.estimatedCost.toFixed(2)} · ≈{(opt.estimatedLatencyMs / 1000).toFixed(0)}s
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={busy}
                    onClick={() => call({ action: "model_choose", taskId: r.taskId, choice: opt.model })}
                  >
                    Use {opt.model}
                  </Button>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
