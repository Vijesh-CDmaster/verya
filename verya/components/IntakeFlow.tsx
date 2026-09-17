"use client";

import { useCallback, useRef, useState } from "react";
import type {
  ExecutionResult,
  PipelineSession,
  StackProposal,
} from "@/lib/pipeline/types";

type Phase = "landing" | "busy" | "gate" | "error";

const EXAMPLES = [
  "Build an e-commerce platform with authentication, product search, payments and order tracking.",
  "A team wiki with real-time collaborative editing, version history, and per-workspace permissions. Around 500 users at launch.",
  "Internal tool: ingest CSV uploads up to 50MB, validate rows against business rules, show failures, and export corrected files.",
];

function GateBadge({ gate }: { gate: string }) {
  const labels: Record<string, string> = {
    intake: "Intake",
    suitability: "Suitability check",
    flaws: "Flaw review",
    stack: "Stack",
    tasks: "Task breakdown",
    algorithms: "Approach per task",
    models: "Model routing",
    execution: "Execution",
    review: "Your review",
  };
  return (
    <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
      {labels[gate] ?? gate}
    </span>
  );
}

function TieTag() {
  return (
    <span className="rounded-full border border-warn/50 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">
      your call
    </span>
  );
}

export default function IntakeFlow() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [input, setInput] = useState("");
  const [bringStack, setBringStack] = useState(false);
  const [statedStack, setStatedStack] = useState("");
  const [session, setSession] = useState<PipelineSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskEdits, setTaskEdits] = useState<{ [id: string]: { title: string; description: string } }>({});
  const busyRef = useRef(false);

  const busy = phase === "busy";

  const call = useCallback(async (url: string, body?: unknown) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("busy");
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | { session?: PipelineSession; error?: string }
        | null;
      if (!res.ok || !data?.session) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setSession(data.session);
      setPhase("gate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase(session ? "gate" : "error");
    } return;
  }, [session]);

  // ---------- Gate renderers ----------
  const renderGate = () => {
    if (!session) return null;
    switch (session.gate) {
      case "suitability":
        return <SuitabilityGate session={session} call={call} busy={busy} />;
      case "flaws":
        return <FlawsGate session={session} call={call} busy={busy} />;
      case "stack":
        return <StackGate session={session} call={call} busy={busy} />;
      case "tasks":
        return (
          <TasksGate
            session={session}
            busy={busy}
            taskEdits={taskEdits}
            setTaskEdits={setTaskEdits}
            onConfirm={() =>
              call(`/api/pipeline/${session.id}/action`, {
                action: "tasks_edit",
                tasks: session.workflow!.tasks.map((t) => ({
                  ...t,
                  title: taskEdits[t.id]?.title ?? t.title,
                  description: taskEdits[t.id]?.description ?? t.description,
                })),
              })
            }
          />
        );
      case "algorithms":
        return <AlgorithmsGate session={session} call={call} busy={busy} />;
      case "models":
        return <ModelsGate session={session} call={call} busy={busy} />;
      case "execution":
        return (
          <div className="text-[13px] text-muted">
            Ready to execute {session.workflow?.tasks.length} tasks with the routed models.
            <div className="mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => call(`/api/pipeline/${session.id}/execute`)}
                className="rounded-md bg-primary px-5 py-2 text-[13px] font-semibold text-on-primary disabled:opacity-60"
              >
                {busy ? "Executing…" : "Execute all tasks →"}
              </button>
            </div>
          </div>
        );
      case "review":
        return <ReviewGate session={session} call={call} busy={busy} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {phase === "landing" && (
        <section className="fade-up mx-auto max-w-3xl px-6 pt-16 pb-10 text-center sm:pt-24">
          <span className="inline-block rounded-full border border-line bg-surface px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            For teams shipping with AI
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">
            Before your AI writes a single line, Verya checks if the plan is even good.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            Paste the whole thing — messy, incomplete, whatever you have. Verya checks the
            plan, and you decide every close call.
          </p>
        </section>
      )}

      <section id="start" className="mx-auto max-w-3xl px-6 pb-16">
        {phase === "landing" ? (
          <div className="rounded-xl border border-line bg-bg shadow-sm">
            <div className="border-b border-line px-5 py-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
              Your project
            </div>
            <div className="p-5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && input.trim().length >= 20) {
                    e.preventDefault();
                    call("/api/pipeline", { input, statedStack: bringStack ? statedStack : "" });
                  }
                }}
                rows={6}
                placeholder="Describe your project and the workflow you have in mind. No structure needed — brain-dump is fine."
                className="w-full resize-y rounded-lg border border-line bg-bg p-4 font-mono text-[13px] leading-relaxed placeholder:text-muted/70"
              />
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={bringStack}
                  onChange={(e) => setBringStack(e.target.checked)}
                  className="h-4 w-4 accent-current"
                />
                I already have a stack — validate it, don&apos;t pick one
              </label>
              {bringStack && (
                <input
                  value={statedStack}
                  onChange={(e) => setStatedStack(e.target.value)}
                  placeholder="e.g. React + Node.js + PostgreSQL + Redis"
                  className="mt-3 w-full rounded-lg border border-line bg-bg px-4 py-2.5 font-mono text-[13px] placeholder:text-muted/70"
                />
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[12px] text-muted">
                  Enter to start · Shift+Enter for a new line
                </span>
                <button
                  type="button"
                  disabled={input.trim().length < 20}
                  onClick={() => call("/api/pipeline", { input, statedStack: bringStack ? statedStack : "" })}
                  className="rounded-md bg-primary px-5 py-2 text-[13px] font-semibold text-on-primary transition hover:opacity-90 disabled:opacity-40"
                >
                  Analyze my project →
                </button>
              </div>
              {error && <ErrorBox message={error} />}
            </div>
          </div>
        ) : (
          <>
            {/* Session header */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <GateBadge gate={session?.gate ?? "intake"} />
              {busy && <span className="pulse-soft text-[12px] text-muted">Verya is working…</span>}
              {session && (
                <span className="ml-auto text-[12px] text-muted">
                  session {session.id.slice(0, 8)}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-line bg-bg p-5 shadow-sm">
              {renderGate()}
              {error && <ErrorBox message={error} />}
            </div>
            <button
              type="button"
              onClick={() => {
                setSession(null);
                setPhase("landing");
                setInput("");
                setStatedStack("");
                setBringStack(false);
                setTaskEdits({});
              }}
              className="mt-4 text-[12px] text-muted underline hover:text-fg"
            >
              ← Start a new project
            </button>
          </>
        )}

        {phase === "landing" && input.trim().length === 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">
              Or start from an example
            </p>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="block w-full rounded-lg border border-line bg-surface px-4 py-3 text-left text-[13px] text-muted transition hover:border-fg hover:text-fg"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger">
      {message}
    </div>
  );
}

// ---------- Gate components ----------

type GateProps = {
  session: PipelineSession;
  call: (url: string, body?: unknown) => Promise<void>;
  busy: boolean;
};

function SuitabilityGate({ session, call, busy }: GateProps) {
  const s = session.suitability;
  if (!s) return <p className="text-[13px] text-muted">Checking…</p>;
  return (
    <div>
      {s.suitable ? (
        <>
          <p className="text-[14px] font-semibold text-success">
            ✓ Workflow suitable ({Math.round(s.confidence * 100)}% confidence)
          </p>
          <p className="mt-1 text-[13px] text-muted">{s.reason}</p>
          {session.workflow && (
            <div className="mt-4 rounded-lg border border-line bg-surface p-4 text-[13px]">
              <p className="font-semibold">{session.workflow.title}</p>
              <p className="mt-1 text-muted">{session.workflow.summary}</p>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => call(`/api/pipeline/${session.id}/action`, { action: "suitability_choose", choice: "original" })}
            className="mt-4 rounded-md bg-primary px-5 py-2 text-[13px] font-semibold text-on-primary disabled:opacity-60"
          >
            Continue to flaw review →
          </button>
        </>
      ) : (
        <>
          <p className="text-[14px] font-semibold text-warn">
            ⚠ This workflow may not fit the project
          </p>
          <p className="mt-1 text-[13px] text-muted">{s.reason}</p>
          {s.suggestedWorkflow && (
            <div className="mt-4 rounded-lg border border-warn/40 bg-warn/5 p-4 text-[13px] whitespace-pre-wrap">
              <p className="mb-2 font-semibold">Suggested workflow:</p>
              {s.suggestedWorkflow}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => call(`/api/pipeline/${session.id}/action`, { action: "suitability_choose", choice: "suggested" })}
              className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary disabled:opacity-60"
            >
              Use suggested workflow
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => call(`/api/pipeline/${session.id}/action`, { action: "suitability_choose", choice: "original" })}
              className="rounded-md border border-line px-4 py-2 text-[13px] font-medium disabled:opacity-60"
            >
              Keep mine anyway
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FlawsGate({ session, call, busy }: GateProps) {
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "rejected" | "edited">>(() => {
    const init: Record<string, "accepted" | "rejected" | "edited"> = {};
    for (const f of session.flawReport?.flaws ?? []) {
      if (f.severity === "critical") init[f.id] = "accepted";
    }
    return init;
  });
  const [edits] = useState<Record<string, string>>({});
  const report = session.flawReport;

  if (!report) return <p className="text-[13px] text-muted">Loading…</p>;

  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const sorted = [...report.flaws].sort(
    (a, b) => sevOrder[a.severity] - sevOrder[b.severity]
  );
  const unresolvedCritical = report.flaws.filter(
    (f) => f.severity === "critical" && decisions[f.id] !== "accepted" && decisions[f.id] !== "edited"
  );

  const submit = () => {
    const resolutions = report.flaws.map((f) => ({
      flawId: f.id,
      decision: decisions[f.id] ?? "rejected",
      editedFix: edits[f.id],
    }));
    call(`/api/pipeline/${session.id}/action`, { action: "flaw_resolve", resolutions });
  };

  return (
    <div>
      <p className="text-[13px] text-muted">{report.summary}</p>
      <p className="mt-1 text-[12px] text-muted">
        Risk level: <span className="font-semibold">{report.overallRisk}</span>. Accept or
        reject each fix — critical flaws must be resolved before the pipeline moves on.
      </p>
      <ul className="mt-4 space-y-2">
        {sorted.map((flaw) => (
          <li key={flaw.id} className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{flaw.title}</span>
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {flaw.category} · {flaw.severity}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-muted">{flaw.description}</p>
            <p className="mt-1.5 text-[12px]">
              <span className="font-medium">Fix:</span>{" "}
              <span className="text-muted">{flaw.suggestedFix}</span>
            </p>
            <div className="mt-2 flex gap-2">
              {(["accepted", "rejected"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecisions((prev) => ({ ...prev, [flaw.id]: d }))}
                  className={`rounded px-3 py-1 text-[12px] font-medium transition ${
                    decisions[flaw.id] === d
                      ? d === "accepted"
                        ? "bg-success/20 text-success"
                        : "bg-danger/20 text-danger"
                      : "border border-line text-muted hover:border-fg hover:text-fg"
                  }`}
                >
                  {d === "accepted" ? "Accept fix" : "Reject"}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {sorted.length === 0 && (
        <p className="mt-3 text-[13px] text-success">No flaws found. The plan looks clean.</p>
      )}
      {unresolvedCritical.length > 0 && (
        <p className="mt-3 text-[12px] text-warn">
          {unresolvedCritical.length} critical flaw(s) unresolved — the gate stays closed.
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="mt-4 rounded-md bg-primary px-5 py-2 text-[13px] font-semibold text-on-primary disabled:opacity-60"
      >
        Continue to stack →
      </button>
    </div>
  );
}

function StackGate({ session, call, busy }: GateProps) {
  const gate = session.stackGate;
  if (!gate) return <p className="text-[13px] text-muted">Loading…</p>;

  return (
    <div>
      {gate.provided && gate.validation && (
        <p className="text-[13px]">
          <span className="font-semibold">Verdict: </span>
          <span className={gate.validation.verdict === "fit" ? "text-success" : "text-warn"}>
            {gate.validation.verdict.replace(/_/g, " ")}
          </span>
          {gate.validation.notes.length > 0 && (
            <span className="text-muted"> — {gate.validation.notes.join("; ")}</span>
          )}
        </p>
      )}
      <div className={`mt-3 grid gap-3 ${gate.candidates.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {gate.candidates.map((c) => <StackCard key={c.proposal.name} candidate={c} gate={gate} call={call} session={session} busy={busy} />)}
      </div>
    </div>
  );
}

function StackCard({
  candidate,
  gate,
  call,
  session,
  busy,
}: {
  candidate: { proposal: StackProposal; confidence: number; reason: string };
  gate: NonNullable<PipelineSession["stackGate"]>;
  call: GateProps["call"];
  session: PipelineSession;
  busy: boolean;
}) {
  const isChosen = gate.selected === candidate.proposal.name;
  return (
    <div
      className={`rounded-lg border p-4 text-[13px] ${
        isChosen ? "border-success/60 bg-success/5" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{candidate.proposal.name}</span>
        {gate.candidates.length > 1 && <TieTag />}
        <span className="ml-auto text-[11px] text-muted">
          {Math.round(candidate.confidence * 100)}% fit
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-[12px] text-muted">
        {candidate.proposal.components.map((comp) => (
          <li key={comp.layer}>
            <span className="uppercase tracking-wide text-[10px]">{comp.layer}</span>{" "}
            <span className="font-mono text-fg">{comp.choice}</span>
            {comp.rationale && <span> — {comp.rationale}</span>}
          </li>
        ))}
      </ul>
      {gate.candidates.length > 1 && (
        <button
          type="button"
          disabled={busy || isChosen}
          onClick={() => call(`/api/pipeline/${session.id}/action`, { action: "stack_choose", choice: candidate.proposal.name })}
          className="mt-3 rounded-md bg-primary px-4 py-1.5 text-[12px] font-semibold text-on-primary disabled:opacity-60"
        >
          {isChosen ? "Locked in ✓" : "Use this stack"}
        </button>
      )}
    </div>
  );
}

function TasksGate({
  session,
  taskEdits,
  setTaskEdits,
  onConfirm,
  busy,
}: {
  session: PipelineSession;
  taskEdits: { [id: string]: { title: string; description: string } };
  setTaskEdits: React.Dispatch<React.SetStateAction<{ [id: string]: { title: string; description: string } }>>;
  onConfirm: () => void;
  busy: boolean;
}) {
  const tasks = session.workflow?.tasks ?? [];
  return (
    <div>
      <p className="text-[13px] text-muted">
        {tasks.length} tasks. Edit, remove, or confirm — dependencies follow your edits.
      </p>
      <ul className="mt-3 space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted">{t.id}</span>
              <input
                value={taskEdits[t.id]?.title ?? t.title}
                onChange={(e) =>
                  setTaskEdits((prev) => ({
                    ...prev,
                    [t.id]: { ...(prev[t.id] ?? { description: t.description }), title: e.target.value },
                  }))
                }
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent font-medium hover:border-line"
              />
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase text-muted">
                {t.category} · {t.complexity} · risk {t.risk}
              </span>
            </div>
            {t.dependsOn.length > 0 && (
              <p className="mt-1 text-[11px] text-muted">depends on: {t.dependsOn.join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className="mt-4 rounded-md bg-primary px-5 py-2 text-[13px] font-semibold text-on-primary disabled:opacity-60"
      >
        Confirm tasks →
      </button>
    </div>
  );
}

function AlgorithmsGate({ session, call, busy }: GateProps) {
  const tasks = session.algorithms?.tasks ?? [];
  const pending = tasks.filter((t) => t.tieBreakRequired);
  if (pending.length === 0) {
    return (
      <div>
        <p className="text-[13px] text-success">
          ✓ Approach auto-selected for every task (clear winners, reasons shown).
        </p>
        <ul className="mt-3 space-y-2">
          {tasks.map((t) => (
            <li key={t.taskId} className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">
              <span className="font-medium">{t.taskTitle}</span>
              <span className="ml-2 font-mono text-[12px] text-success">{t.selected}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] text-muted">Routing models next…</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[13px]">
        <span className="font-semibold text-warn">{pending.length} close call(s).</span>{" "}
        <span className="text-muted">Two approaches are genuinely comparable — you pick.</span>
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((t) => (
          <li key={t.taskId} className="rounded-lg border border-warn/50 bg-warn/5 p-4 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-medium">{t.taskTitle}</span>
              <TieTag />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {t.options.map((opt) => (
                <div key={opt.name} className="rounded border border-line bg-bg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] font-semibold">{opt.name}</span>
                    <span className="text-[11px] text-muted">{Math.round(opt.confidence * 100)}%</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{opt.approach}</p>
                  {opt.pros.length > 0 && (
                    <p className="mt-1 text-[11px] text-success">+ {opt.pros.join("; ")}</p>
                  )}
                  {opt.cons.length > 0 && (
                    <p className="mt-1 text-[11px] text-warn">− {opt.cons.join("; ")}</p>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => call(`/api/pipeline/${session.id}/action`, { action: "algorithm_choose", taskId: t.taskId, choice: opt.name })}
                    className="mt-2 w-full rounded border border-line px-3 py-1.5 text-[12px] font-medium transition hover:border-fg"
                  >
                    Use {opt.name}
                  </button>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModelsGate({ session, call, busy }: GateProps) {
  const routes = session.routing?.routes ?? [];
  const pending = routes.filter((r) => r.tieBreakRequired);
  if (pending.length === 0) {
    return (
      <div>
        <p className="text-[13px] text-success">
          ✓ Model auto-routed for every task. Estimated cost: ${session.routing?.estimatedCostUsd.toFixed(2)}
        </p>
        <ul className="mt-3 space-y-2">
          {routes.map((r) => (
            <li key={r.taskId} className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">
              <span className="font-medium">{r.taskTitle}</span>
              <span className="ml-2 rounded border border-line bg-bg px-2 py-0.5 font-mono text-[11px]">
                {r.selectedModel}
              </span>
              <p className="mt-1 text-[12px] text-muted">{r.reason}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => call(`/api/pipeline/${session.id}/execute`)}
            className="rounded-md bg-primary px-5 py-2 text-[13px] font-semibold text-on-primary disabled:opacity-60"
          >
            {busy ? "Executing…" : "Execute all tasks →"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[13px]">
        <span className="font-semibold text-warn">{pending.length} model choice(s) are close.</span>{" "}
        <span className="text-muted">Both qualify — you pick.</span>
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((r) => (
          <li key={r.taskId} className="rounded-lg border border-warn/50 bg-warn/5 p-4 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-medium">{r.taskTitle}</span>
              <TieTag />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {r.options.map((opt) => (
                <div key={opt.model} className="rounded border border-line bg-bg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] font-semibold">{opt.model}</span>
                    <span className="text-[11px] text-muted">{Math.round(opt.confidence * 100)}%</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{opt.qualifiesBecause}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    cost ≈ ${opt.estimatedCost.toFixed(2)} · ≈{(opt.estimatedLatencyMs / 1000).toFixed(0)}s
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => call(`/api/pipeline/${session.id}/action`, { action: "model_choose", taskId: r.taskId, choice: opt.model })}
                    className="mt-2 w-full rounded border border-line px-3 py-1.5 text-[12px] font-medium transition hover:border-fg"
                  >
                    Use {opt.model}
                  </button>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewGate({ session, call, busy }: GateProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean>>({});
  const execs = session.executions;
  const verified = execs.filter((e) => e.status === "verified").length;
  const flagged = execs.filter((e) => e.status === "flagged").length;
  const failed = execs.filter((e) => e.status === "failed").length;

  const sendFeedback = async (taskId: string, accepted: boolean) => {
    setFeedbackGiven((prev) => ({ ...prev, [taskId]: true }));
    await call(`/api/pipeline/${session.id}/feedback`, { taskId, accepted });
  };

  return (
    <div>
      <p className="text-[13px]">
        <span className="font-semibold text-success">{verified} verified</span>
        {flagged > 0 && <span className="text-warn"> · {flagged} flagged</span>}
        {failed > 0 && <span className="text-danger"> · {failed} failed</span>}
        <span className="text-muted"> — every output was cross-checked before reaching you.</span>
      </p>
      <ul className="mt-3 space-y-3">
        {execs.map((e: ExecutionResult) => {
          const task = session.workflow?.tasks.find((t) => t.id === e.taskId);
          return (
            <li key={e.taskId} className="rounded-lg border border-line bg-surface p-4 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{task?.title ?? e.taskId}</span>
                <span className="rounded border border-line bg-bg px-2 py-0.5 font-mono text-[11px]">{e.model}</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    e.status === "verified"
                      ? "bg-success/15 text-success"
                      : e.status === "flagged"
                        ? "bg-warn/15 text-warn"
                        : "bg-danger/15 text-danger"
                  }`}
                >
                  {e.status}
                </span>
                <span className="ml-auto text-[11px] text-muted">
                  {e.tokens.input + e.tokens.output} tok · {(e.latencyMs / 1000).toFixed(1)}s
                </span>
              </div>
              {e.verification.issues.length > 0 && (
                <ul className="mt-2 text-[12px] text-warn">
                  {e.verification.issues.map((issue) => (
                    <li key={issue}>⚠ {issue}</li>
                  ))}
                </ul>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] text-muted">View output</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded border border-line bg-bg p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {e.output}
                </pre>
              </details>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy || feedbackGiven[e.taskId]}
                  onClick={() => sendFeedback(e.taskId, true)}
                  className="rounded bg-success/15 px-3 py-1 text-[12px] font-medium text-success disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busy || feedbackGiven[e.taskId]}
                  onClick={() => sendFeedback(e.taskId, false)}
                  className="rounded bg-danger/15 px-3 py-1 text-[12px] font-medium text-danger disabled:opacity-50"
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
        Accept/reject feeds the org memory and model reputation scores. Every step above is
        recorded in the Trust Ledger — export it from the dashboard.
      </p>
    </div>
  );
}
