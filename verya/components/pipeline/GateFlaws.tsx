"use client";

import { useState } from "react";
import type { Session, Severity } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";

type Flaw = {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  description: string;
  suggestedFix: string;
};

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function GateFlaws({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  const report = (session.flawReport ?? null) as
    | { summary: string; overallRisk: Severity; flaws: Flaw[] }
    | null;
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected" | "edited">>(() => {
    const init: Record<string, "accepted" | "rejected" | "edited"> = {};
    for (const f of report?.flaws ?? []) {
      if (f.severity === "critical") init[f.id] = "accepted";
    }
    return init;
  });
  const [editedFixes, setEditedFixes] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  if (!report) return <p className="text-sm text-muted">Loading…</p>;

  const sorted = [...report.flaws].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const unresolvedCritical = report.flaws.filter(
    (f) => f.severity === "critical" && decisions[f.id] !== "accepted" && decisions[f.id] !== "edited"
  );

  return (
    <div>
      <p className="text-[13px] text-muted">{report.summary}</p>
      <p className="mt-1 text-[12px] text-muted">
        Risk level: <span className="font-semibold">{report.overallRisk}</span>. Accept or reject each
        fix — critical flaws must be resolved before the pipeline moves on.
      </p>
      <ul className="mt-4 space-y-2">
        {sorted.map((flaw) => (
          <li key={flaw.id} className="rounded-lg border border-line bg-elev px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{flaw.title}</span>
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {flaw.category} · {flaw.severity}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-muted">{flaw.description}</p>
            <p className="mt-1.5 text-[12px]">
              <span className="font-medium">Fix:</span> <span className="text-muted">{flaw.suggestedFix}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["accepted", "rejected"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecisions((prev) => ({ ...prev, [flaw.id]: d }))}
                  className={`rounded px-3 py-1 text-[12px] font-medium transition ${
                    decisions[flaw.id] === d
                      ? d === "accepted"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                      : "border border-line text-muted hover:border-fg hover:text-fg"
                  }`}
                >
                  {d === "accepted" ? "Accept fix" : "Reject"}
                </button>
              ))}
              {/* F3 edited-fix path: accept your own wording of the fix */}
              {!editing[flaw.id] ? (
                <button
                  type="button"
                  onClick={() => setEditing((prev) => ({ ...prev, [flaw.id]: true }))}
                  className={`rounded px-3 py-1 text-[12px] font-medium transition ${
                    decisions[flaw.id] === "edited"
                      ? "bg-amber-500/20 text-amber-400"
                      : "border border-line text-muted hover:border-fg hover:text-fg"
                  }`}
                >
                  Edit fix
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDecisions((prev) => ({ ...prev, [flaw.id]: "edited" }));
                    setEditing((prev) => ({ ...prev, [flaw.id]: false }));
                  }}
                  className="rounded bg-amber-500/20 px-3 py-1 text-[12px] font-medium text-amber-400"
                >
                  Save edit
                </button>
              )}
            </div>
            {editing[flaw.id] && (
              <textarea
                value={editedFixes[flaw.id] ?? ""}
                onChange={(e) => setEditedFixes((prev) => ({ ...prev, [flaw.id]: e.target.value }))}
                rows={3}
                placeholder="Write your own fix for this flaw…"
                className="mt-2 w-full rounded border border-line bg-card p-2 text-[12px]"
              />
            )}
          </li>
        ))}
      </ul>
      {sorted.length === 0 && (
        <p className="mt-3 text-[13px] text-emerald-400">No flaws found. The plan looks clean.</p>
      )}
      {unresolvedCritical.length > 0 && (
        <p className="mt-3 text-[12px] text-amber-400">
          {unresolvedCritical.length} critical flaw(s) unresolved — the gate stays closed.
        </p>
      )}
      <Button
        className="mt-4"
        disabled={busy}
        onClick={() =>
          call({
            action: "flaw_resolve",
            resolutions: report.flaws.map((f) => ({
              flawId: f.id,
              decision: decisions[f.id] ?? "rejected",
              ...(decisions[f.id] === "edited" && editedFixes[f.id]?.trim()
                ? { editedFix: editedFixes[f.id].trim() }
                : {}),
            })),
          })
        }
      >
        Continue to stack →
      </Button>
    </div>
  );
}
