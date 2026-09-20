"use client";

import { useState } from "react";
import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Task = {
  id: string;
  title: string;
  description: string;
  category: string;
  dependsOn: string[];
  complexity: string;
  risk: string;
  fingerprint?: {
    signature: string;
    contextSize: string;
    reasoningRequirement: string;
    outputFormat: string;
    requiredCapabilities: string[];
  };
};

let localSeq = 0;

export function GateTasks({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  const original = (session.workflow?.tasks ?? []) as Task[];
  // Local editable copy: edits, merges, splits, and deletes all happen here and are
  // sent as one complete array — the backend accepts full edited task lists (F5).
  const [tasks, setTasks] = useState<Task[]>(original);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  if (tasks.length === 0 && original.length === 0) {
    return <p className="text-sm text-muted">No tasks to show.</p>;
  }

  const update = (id: string, patch: Partial<Task>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // F5 split: one task becomes two sequential halves; the second inherits dependencies
  // on the first so ordering stays valid.
  const split = (t: Task) => {
    const mid = Math.max(1, Math.floor(t.title.length / 2));
    const breakAt = t.title.indexOf(" ", mid);
    const cut = breakAt > 0 ? breakAt : t.title.length;
    const first: Task = {
      ...t,
      title: t.title.slice(0, cut).trim() || t.title,
    };
    const second: Task = {
      ...t,
      id: `${t.id}-b${++localSeq}`,
      title: t.title.slice(cut).trim() || `${t.title} (cont.)`,
      dependsOn: [first.id],
    };
    setTasks((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      return [...prev.slice(0, idx), first, second, ...prev.slice(idx + 1)];
    });
  };

  // F5 merge: combine a task into the previous one — title and description concat,
  // the survivor absorbs the dropped task's dependencies (minus itself).
  const mergeUp = (idx: number) => {
    if (idx === 0) return;
    setTasks((prev) => {
      const a = prev[idx - 1];
      const b = prev[idx];
      const merged: Task = {
        ...a,
        title: `${a.title} + ${b.title}`,
        description: [a.description, b.description].filter(Boolean).join(" "),
        dependsOn: Array.from(new Set([...a.dependsOn, ...b.dependsOn.filter((d) => d !== a.id)])),
      };
      return [...prev.slice(0, idx - 1), merged, ...prev.slice(idx + 1)];
    });
  };

  // F5 delete: drop the task and scrub it from every remaining dependency list.
  const remove = (id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id));
    setTasks((prev) =>
      prev
        .filter((t) => t.id !== id)
        .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== id) }))
    );
  };

  const confirm = () => {
    call({ action: "tasks_edit", tasks });
  };

  const changed =
    tasks.length !== original.length || removedIds.size > 0 || tasks.some((t, i) => t !== original[i]);

  return (
    <div>
      <p className="text-[13px] text-muted">
        {tasks.length} tasks. Edit titles, split, merge, delete, or confirm — dependencies follow your
        edits.
      </p>
      <ul className="mt-3 space-y-2">
        {tasks.map((t, idx) => (
          <li key={t.id} className="rounded-lg border border-line bg-elev px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted">{t.id}</span>
              <Input
                value={t.title}
                onChange={(e) => update(t.id, { title: e.target.value })}
                className="h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent hover:border-line"
              />
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase text-muted">
                {t.category} · {t.complexity} · risk {t.risk}
              </span>
            </div>
            {t.dependsOn.length > 0 && (
              <p className="mt-1 text-[11px] text-muted">depends on: {t.dependsOn.join(", ")}</p>
            )}
            {t.fingerprint && (
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted">
                <span className="rounded border border-violet-500/40 px-1.5 py-0.5 text-violet-300">
                  DNA {t.fingerprint.signature}
                </span>
                <span className="rounded border border-line px-1.5 py-0.5">
                  {t.fingerprint.contextSize} context · {t.fingerprint.reasoningRequirement} reasoning
                </span>
                <span className="rounded border border-line px-1.5 py-0.5">
                  {t.fingerprint.outputFormat} · {t.fingerprint.requiredCapabilities.slice(0, 3).join(", ") || "general"}
                </span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => split(t)}
                className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:border-fg hover:text-fg"
              >
                ⇅ Split
              </button>
              <button
                type="button"
                disabled={busy || idx === 0}
                onClick={() => mergeUp(idx)}
                className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:border-fg hover:text-fg disabled:opacity-40"
              >
                ⇄ Merge up
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(t.id)}
                className="rounded border border-line px-2 py-0.5 text-[11px] text-muted hover:border-red-400 hover:text-red-400"
              >
                ✕ Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {changed && (
        <p className="mt-2 text-[12px] text-amber-400">
          Task list modified — downstream gates will use your edited version.
        </p>
      )}
      <Button className="mt-4" disabled={busy || tasks.length === 0} onClick={confirm}>
        Confirm tasks →
      </Button>
    </div>
  );
}
