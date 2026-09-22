"use client";

// Task inspector overlay — click a task in the sidebar to inspect its full
// planning + execution record. Review actions (accept/reject/rate) reposition
// the old Review gate here, wired to the same real `feedback` action.

import { useState } from "react";
import type { WsBuild, WsTask } from "@/lib/workspace/build";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TaskInspector({
  ws,
  busy,
  onFeedback,
}: {
  ws: WsBuild;
  busy: boolean;
  onFeedback: (payload: { taskId: string; accepted: boolean; rating?: number; note?: string; editedOutput?: string }) => void;
}) {
  const selectedTaskId = useWorkspaceStore((s) => s.selectedTaskId);
  const selectTask = useWorkspaceStore((s) => s.selectTask);
  const task = ws.tasks.find((t) => t.id === selectedTaskId) ?? null;
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => selectTask(null)}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <TaskDetail task={task} ws={ws} busy={busy} onFeedback={onFeedback} onClose={() => selectTask(null)} />
      </div>
    </div>
  );
}

type FeedbackFn = (payload: { taskId: string; accepted: boolean; rating?: number; note?: string; editedOutput?: string }) => void;

function TaskDetail({
  task,
  ws,
  busy,
  onFeedback,
  onClose,
}: {
  task: WsTask;
  ws: WsBuild;
  busy: boolean;
  onFeedback: FeedbackFn;
  onClose: () => void;
}) {
  const [rating, setRating] = useState<number | undefined>(task.execution ? undefined : undefined);
  const [note, setNote] = useState("");
  const decided = task.status === "verified" || task.status === "failed";
  const approach = ws.context.approaches.find((a) => a.taskId === task.id);
  const modelInfo = ws.context.selectedModels.find((m) => m.taskId === task.id);
  const depTasks = task.dependsOn.map((d) => ws.tasks.find((t) => t.id === d)).filter(Boolean) as WsTask[];

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Task</p>
          <h3 className="truncate text-lg font-semibold text-fg">{task.title}</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-hover hover:text-fg" aria-label="Close task inspector">
          ✕
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant={task.status === "verified" ? "success" : task.status === "flagged" ? "warn" : task.status === "failed" ? "danger" : "muted"}>
          {task.status}
        </Badge>
        <Badge variant={task.risk === "high" ? "danger" : task.risk === "medium" ? "warn" : "muted"}>risk: {task.risk}</Badge>
        <Badge variant="muted">complexity: {task.complexity}</Badge>
        {task.hasArtifact && <Badge variant="accent">code artifact</Badge>}
      </div>

      {/* Model visibility — actual routing data only */}
      <Section title="Assigned model">
        {modelInfo && task.model ? (
          <div className="text-[12px]">
            <p className="font-mono font-semibold text-fg">{task.model}</p>
            <p className="mt-0.5 text-muted">{task.modelReason || modelInfo.reason}</p>
          </div>
        ) : (
          <p className="text-[12px] text-muted">No model assigned yet.</p>
        )}
      </Section>

      <Section title="Approach">
        {task.approach ? (
          <div className="text-[12px]">
            <p className="font-semibold text-fg">{task.approach}</p>
            {approach?.options[0] && <p className="mt-0.5 text-muted">{approach.options[0].approach}</p>}
          </div>
        ) : (
          <p className="text-[12px] text-muted">No approach selected yet.</p>
        )}
      </Section>

      {depTasks.length > 0 && (
        <Section title="Dependencies">
          <ul className="space-y-0.5 text-[12px]">
            {depTasks.map((d) => (
              <li key={d.id} className="text-muted">
                <span className="text-fg">{d.title}</span> · {d.status}
                {d.model ? ` · ${d.model}` : ""}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {task.verification && (
        <Section title="Verification">
          <div className="text-[12px]">
            <p>
              <Badge variant={task.verification.passed ? "success" : "warn"}>{task.verification.passed ? "passed" : "issues found"}</Badge>{" "}
              <span className="ml-1 font-mono text-muted">{task.verification.method}</span>
            </p>
            {task.verification.issues.length > 0 && (
              <ul className="mt-1 text-amber-400">
                {task.verification.issues.map((i) => (
                  <li key={i}>⚠ {i}</li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      )}

      {task.execution && (
        <Section title={`Output · ${task.execution.tokens.input + task.execution.tokens.output} tokens · ${(task.execution.latencyMs / 1000).toFixed(1)}s · confidence ${(task.execution.confidence * 100).toFixed(0)}%`}>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border border-line bg-card px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300">
            {task.execution.output || "(no output)"}
          </pre>
        </Section>
      )}

      {/* Human review — same backend action the Review gate uses */}
      {task.execution && (
        <Section title="Human review">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted">Rate:</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => setRating(n)}
                className={`text-[15px] leading-none ${(rating ?? 0) >= n ? "text-amber-400" : "text-muted hover:text-fg"}`}
                aria-label={`Rate ${n} of 5`}
              >
                ★
              </button>
            ))}
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for org memory…"
              className="h-7 min-w-0 flex-1 text-[12px]"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { onFeedback({ taskId: task.id, accepted: true, rating, note: note.trim() || undefined }); onClose(); }}>
              Accept
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { onFeedback({ taskId: task.id, accepted: false, rating, note: note.trim() || undefined }); onClose(); }}>
              Reject
            </Button>
            {decided && <span className="self-center text-[11px] text-muted">decision recorded in the Trust Ledger</span>}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-line bg-card p-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      {children}
    </div>
  );
}
