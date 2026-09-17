"use client";

import { useState } from "react";
import type { Session } from "@/schemas/pipeline";
import { Badge } from "@/components/ui/badge";

type Execution = {
  taskId: string;
  model: string;
  output: string;
  status: string;
  confidence: number;
  latencyMs: number;
  tokens: { input: number; output: number };
  verification: { method: string; passed: boolean; issues: string[]; checkedBy: string };
};

export function GateReview({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  const [given, setGiven] = useState<Record<string, boolean>>({});
  const execs = (session.executions ?? []) as Execution[];
  const verified = execs.filter((e) => e.status === "verified").length;
  const flagged = execs.filter((e) => e.status === "flagged").length;
  const failed = execs.filter((e) => e.status === "failed").length;

  const send = (taskId: string, accepted: boolean) => {
    setGiven((prev) => ({ ...prev, [taskId]: true }));
    call({ action: "feedback", taskId, accepted });
  };

  return (
    <div>
      <p className="text-[13px]">
        <span className="font-semibold text-emerald-400">{verified} verified</span>
        {flagged > 0 && <span className="text-amber-400"> · {flagged} flagged</span>}
        {failed > 0 && <span className="text-red-400"> · {failed} failed</span>}
        <span className="text-muted"> — every output was cross-checked before reaching you.</span>
      </p>
      <ul className="mt-3 space-y-3">
        {execs.map((e) => {
          const task = session.workflow?.tasks.find((t) => t.id === e.taskId);
          return (
            <li key={e.taskId} className="rounded-lg border border-line bg-elev p-4 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{task?.title ?? e.taskId}</span>
                <span className="rounded border border-line bg-card px-2 py-0.5 font-mono text-[11px]">{e.model}</span>
                <Badge
                  variant={e.status === "verified" ? "success" : e.status === "flagged" ? "warn" : "danger"}
                >
                  {e.status}
                </Badge>
                <span className="ml-auto text-[11px] text-muted">
                  {e.tokens.input + e.tokens.output} tok · {(e.latencyMs / 1000).toFixed(1)}s
                </span>
              </div>
              {e.verification.issues.length > 0 && (
                <ul className="mt-2 text-[12px] text-amber-400">
                  {e.verification.issues.map((issue) => (
                    <li key={issue}>⚠ {issue}</li>
                  ))}
                </ul>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-muted">View output</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-line bg-card p-3 font-mono text-[11px] leading-relaxed">
                  {e.output}
                </pre>
              </details>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy || given[e.taskId]}
                  onClick={() => send(e.taskId, true)}
                  className="rounded bg-emerald-500/15 px-3 py-1 text-[12px] font-medium text-emerald-400 disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busy || given[e.taskId]}
                  onClick={() => send(e.taskId, false)}
                  className="rounded bg-red-500/15 px-3 py-1 text-[12px] font-medium text-red-400 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {execs.length === 0 && <p className="text-[13px] text-muted">No executions recorded.</p>}
      <p className="mt-4 text-[12px] text-muted">
        Accept/reject feeds the org memory and model reputation scores. Every step above is recorded in
        the Trust Ledger — export it from the dashboard.
      </p>
    </div>
  );
}
