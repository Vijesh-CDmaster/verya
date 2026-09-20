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
    tradeoffs?: { cost?: string; learningCurve?: string; scalingCeiling?: string; ecosystem?: string };
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
      {gate.candidates.length > 1 && (
        <div className="mt-5 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="border-b border-line bg-elev text-muted">
              <tr>
                <th className="px-3 py-2">Stack</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Learning curve</th>
                <th className="px-3 py-2">Scaling ceiling</th>
                <th className="px-3 py-2">Ecosystem</th>
              </tr>
            </thead>
            <tbody>
              {gate.candidates.map((candidate) => (
                <tr key={candidate.proposal.name} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium text-fg">{candidate.proposal.name}</td>
                  <td className="px-3 py-2">{candidate.proposal.tradeoffs?.cost || "Not stated"}</td>
                  <td className="px-3 py-2">{candidate.proposal.tradeoffs?.learningCurve || "Not stated"}</td>
                  <td className="px-3 py-2">{candidate.proposal.tradeoffs?.scalingCeiling || "Not stated"}</td>
                  <td className="px-3 py-2">{candidate.proposal.tradeoffs?.ecosystem || "Not stated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
