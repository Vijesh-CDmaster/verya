"use client";

import { useState } from "react";
import type { Session } from "@/schemas/pipeline";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TrustBadge } from "@/components/dashboard/TrustBadge";

export type ExecutionView = {
  taskId: string;
  model: string;
  output: string;
  status: string;
  confidence: number;
  latencyMs: number;
  tokens: { input: number; output: number };
  verification: { method: string; passed: boolean; issues: string[]; checkedBy: string };
  humanRating?: number;
  humanNote?: string;
  battleA?: { model: string; output: string; latencyMs: number; tokens: { input: number; output: number } };
  battleB?: { model: string; output: string; latencyMs: number; tokens: { input: number; output: number } };
  battleWinner?: "a" | "b";
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
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const execs = (session.executions ?? []) as ExecutionView[];
  const verified = execs.filter((e) => e.status === "verified").length;
  const flagged = execs.filter((e) => e.status === "flagged").length;
  const failed = execs.filter((e) => e.status === "failed").length;

  // F16: the feedback action now carries rating, note, and the edited output so the
  // backend can measure whether human edits actually improved the result.
  const send = (e: ExecutionView, accepted: boolean) => {
    setGiven((prev) => ({ ...prev, [e.taskId]: true }));
    call({
      action: "feedback",
      taskId: e.taskId,
      accepted,
      rating: ratings[e.taskId],
      note: notes[e.taskId]?.trim() || undefined,
      editedOutput: edits[e.taskId]?.trim() !== e.output && edits[e.taskId] !== undefined ? edits[e.taskId] : undefined,
    });
  };

  const battle = (e: ExecutionView, modelA: string, modelB: string) => {
    call({ action: "battle_run", taskId: e.taskId, modelA, modelB });
  };
  const pickWinner = (e: ExecutionView, winner: "a" | "b") => {
    call({ action: "battle_pick", taskId: e.taskId, winner });
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
          const decided = given[e.taskId] || e.humanRating !== undefined;
          return (
            <li key={e.taskId} className="rounded-lg border border-line bg-elev p-4 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{task?.title ?? e.taskId}</span>
                <span className="rounded border border-line bg-card px-2 py-0.5 font-mono text-[11px]">{e.model}</span>
                <TrustBadge model={e.model} />
                <Badge variant={e.status === "verified" ? "success" : e.status === "flagged" ? "warn" : "danger"}>
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

              {/* F22 AI Battle Mode: alternative model side-by-side */}
              {e.battleA && e.battleB && (
                <div className="mt-3 rounded-lg border border-violet-500/40 bg-violet-500/5 p-3">
                  <p className="text-[12px] font-medium text-violet-300">
                    ⚔ Battle Mode — counterfactual comparison. Pick the better output:
                  </p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {(["a", "b"] as const).map((side) => {
                      const b = side === "a" ? e.battleA! : e.battleB!;
                      const isWinner = e.battleWinner === side;
                      return (
                        <div
                          key={side}
                          className={`rounded border p-2 ${
                            isWinner ? "border-emerald-500/60 bg-emerald-500/5" : "border-line bg-card"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] font-semibold">{b.model}</span>
                            <span className="text-[11px] text-muted">
                              {(b.latencyMs / 1000).toFixed(1)}s · {b.tokens.input + b.tokens.output} tok
                            </span>
                            {isWinner && <Badge variant="success">winner</Badge>}
                          </div>
                          <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
                            {b.output}
                          </pre>
                          {!e.battleWinner && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => pickWinner(e, side)}
                              className="mt-2 w-full rounded bg-violet-500/15 px-2 py-1 text-[12px] font-medium text-violet-300 disabled:opacity-50"
                            >
                              This one is better
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-muted">View output</summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border border-line bg-card p-3 font-mono text-[11px] leading-relaxed">
                  {editing[e.taskId] ? edits[e.taskId] ?? e.output : e.output}
                </pre>
                {editing[e.taskId] && (
                  <textarea
                    value={edits[e.taskId] ?? e.output}
                    onChange={(ev) => setEdits((prev) => ({ ...prev, [e.taskId]: ev.target.value }))}
                    rows={10}
                    className="mt-2 w-full rounded border border-line bg-card p-3 font-mono text-[11px] leading-relaxed"
                    placeholder="Edit the output — your changes are captured and compared to measure edit quality."
                  />
                )}
              </details>

              {/* F16 rating stars */}
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[11px] text-muted">Rate:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy}
                    onClick={() => setRatings((prev) => ({ ...prev, [e.taskId]: n }))}
                    className={`text-[14px] leading-none transition ${
                      (ratings[e.taskId] ?? e.humanRating ?? 0) >= n ? "text-amber-400" : "text-muted hover:text-fg"
                    }`}
                    aria-label={`Rate ${n} of 5`}
                  >
                    ★
                  </button>
                ))}
                <Input
                  value={notes[e.taskId] ?? e.humanNote ?? ""}
                  onChange={(ev) => setNotes((prev) => ({ ...prev, [e.taskId]: ev.target.value }))}
                  placeholder="Optional note for the org memory…"
                  className="ml-2 h-7 flex-1 rounded border border-line bg-card text-[12px]"
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || decided}
                  onClick={() => send(e, true)}
                  className="rounded bg-emerald-500/15 px-3 py-1 text-[12px] font-medium text-emerald-400 disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busy || decided}
                  onClick={() => send(e, false)}
                  className="rounded bg-red-500/15 px-3 py-1 text-[12px] font-medium text-red-400 disabled:opacity-50"
                >
                  Reject
                </button>
                {!editing[e.taskId] ? (
                  <button
                    type="button"
                    disabled={decided}
                    onClick={() => setEditing((prev) => ({ ...prev, [e.taskId]: true }))}
                    className="rounded border border-line px-3 py-1 text-[12px] font-medium text-muted hover:border-fg hover:text-fg disabled:opacity-50"
                  >
                    Edit output
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing((prev) => ({ ...prev, [e.taskId]: false }))}
                    className="rounded border border-line px-3 py-1 text-[12px] font-medium text-muted hover:border-fg hover:text-fg"
                  >
                    Done editing
                  </button>
                )}
                {!e.battleA && (
                  <button
                    type="button"
                    disabled={busy || decided}
                    onClick={() => battle(e, e.model, alternateModel(e.model))}
                    className="rounded bg-violet-500/15 px-3 py-1 text-[12px] font-medium text-violet-300 disabled:opacity-50"
                  >
                    ⚔ Battle vs {alternateModel(e.model)}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {execs.length === 0 && <p className="text-[13px] text-muted">No executions recorded.</p>}
      <p className="mt-4 text-[12px] text-muted">
        Accept/reject/rate/edit feeds the org memory and model reputation scores — including whether your
        edits actually improved the result. Every step above is recorded in the Trust Ledger.
      </p>
    </div>
  );
}

/** Pick a plausible second-model opponent from a different provider family. */
function alternateModel(current: string): string {
  const pool: Record<string, string[]> = {
    "gemini-2.0-flash": ["gpt-4o-mini", "claude-3-5-haiku"],
    "gemini-1.5-pro": ["gpt-4o", "claude-3-5-sonnet"],
    "gpt-4o": ["claude-3-5-sonnet", "gemini-1.5-pro"],
    "gpt-4o-mini": ["gemini-2.0-flash", "claude-3-5-haiku"],
    "claude-3-5-sonnet": ["gpt-4o", "gemini-1.5-pro"],
    "claude-3-5-haiku": ["gpt-4o-mini", "gemini-2.0-flash"],
  };
  const alts = pool[current] ?? ["gpt-4o-mini"];
  return alts[0];
}
