"use client";

import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";

type Suitability = {
  suitable: boolean;
  verdict?: "suitable" | "workable" | "unsuitable";
  confidence: number;
  reason: string;
  suggestedWorkflow?: string | null;
  suggestedSummary?: string | null;
};

export function GateSuitability({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  const s = (session.suitability ?? null) as Suitability | null;
  if (!s) return <p className="text-sm text-muted">Checking…</p>;

  const verdict = s.verdict ?? (s.suitable ? "suitable" : "unsuitable");
  const verdictLabel = verdict === "suitable" ? "Suitable" : verdict === "workable" ? "Workable, but weaker" : "Not suitable";
  const verdictClass = verdict === "suitable" ? "text-emerald-400" : verdict === "workable" ? "text-amber-400" : "text-red-400";
  const baseline = (session.suggestedWorkflow ?? session.workflow) as { title?: string; summary?: string } | null;

  if (verdict === "suitable") {
    return (
      <div>
        <p className="text-sm font-semibold text-emerald-400">
          ✓ Workflow suitable ({Math.round(s.confidence * 100)}% confidence)
        </p>
        <p className="mt-1 text-[13px] text-muted">{s.reason}</p>
        {session.workflow && (
          <div className="mt-4 rounded-lg border border-line bg-elev p-4 text-[13px]">
            <p className="font-semibold">{session.workflow.title}</p>
            <p className="mt-1 text-muted">{session.workflow.summary}</p>
          </div>
        )}
        <Button className="mt-4" disabled={busy} onClick={() => call({ action: "suitability_choose", choice: "original" })}>
          Continue to flaw review →
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className={`text-sm font-semibold ${verdictClass}`}>⚠ {verdictLabel} ({Math.round(s.confidence * 100)}% confidence)</p>
      <p className="mt-1 text-[13px] text-muted">{s.reason}</p>
      {s.suggestedWorkflow && baseline && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-elev p-4 text-[13px]">
            <p className="mb-2 font-semibold">Your workflow</p>
            <p className="font-medium">{baseline.title ?? "Submitted workflow"}</p>
            <p className="mt-1 text-muted">{baseline.summary ?? "The workflow extracted from your description."}</p>
          </div>
          <div className="whitespace-pre-wrap rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-[13px]">
            <p className="mb-2 font-semibold">Suggested workflow</p>
            {s.suggestedWorkflow}
          </div>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button disabled={busy} onClick={() => call({ action: "suitability_choose", choice: "suggested" })}>
          Use suggested workflow
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => call({ action: "suitability_choose", choice: "original" })}>
          Keep mine anyway
        </Button>
      </div>
    </div>
  );
}
