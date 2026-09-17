"use client";

import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Candidate = {
  proposal: {
    name: string;
    summary: string;
    confidence?: number | null;
    components: { layer: string; choice: string; rationale: string }[];
  };
  confidence: number;
  reason: string;
};

type StackGate = {
  provided: boolean;
  validation: { verdict: string; notes: string[] } | null;
  candidates: Candidate[];
  selected: string | null;
  tieBreakRequired: boolean;
};

export function GateStack({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  const gate = (session.stackGate ?? null) as StackGate | null;
  if (!gate) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      {gate.provided && gate.validation && (
        <p className="text-[13px]">
          <span className="font-semibold">Verdict: </span>
          <span className={gate.validation.verdict === "fit" ? "text-emerald-400" : "text-amber-400"}>
            {gate.validation.verdict.replace(/_/g, " ")}
          </span>
          {gate.validation.notes.length > 0 && (
            <span className="text-muted"> — {gate.validation.notes.join("; ")}</span>
          )}
        </p>
      )}
      <div className={`mt-3 grid gap-3 ${gate.candidates.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {gate.candidates.map((c) => {
          const isChosen = gate.selected === c.proposal.name;
          return (
            <div
              key={c.proposal.name}
              className={`rounded-lg border p-4 text-[13px] ${
                isChosen ? "border-emerald-500/60 bg-emerald-500/5" : "border-line bg-elev"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.proposal.name}</span>
                {gate.candidates.length > 1 && <Badge variant="warn">Tie — your call</Badge>}
                <span className="ml-auto text-[11px] text-muted">{Math.round(c.confidence * 100)}% fit</span>
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-muted">
                {c.proposal.components.map((comp) => (
                  <li key={comp.layer}>
                    <span className="text-[10px] uppercase tracking-wide">{comp.layer}</span>{" "}
                    <span className="font-mono text-fg">{comp.choice}</span>
                    {comp.rationale && <span> — {comp.rationale}</span>}
                  </li>
                ))}
              </ul>
              {gate.candidates.length > 1 && (
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={busy || isChosen}
                  onClick={() => call({ action: "stack_choose", choice: c.proposal.name })}
                >
                  {isChosen ? "Locked in ✓" : "Use this stack"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
