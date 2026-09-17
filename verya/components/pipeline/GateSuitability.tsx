"use client";

import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";

type Suitability = {
  suitable: boolean;
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

  if (s.suitable) {
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
      <p className="text-sm font-semibold text-amber-400">⚠ This workflow may not fit the project</p>
      <p className="mt-1 text-[13px] text-muted">{s.reason}</p>
      {s.suggestedWorkflow && (
        <div className="mt-4 whitespace-pre-wrap rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-[13px]">
          <p className="mb-2 font-semibold">Suggested workflow:</p>
          {s.suggestedWorkflow}
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
