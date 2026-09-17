"use client";

import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AlgoTask = {
  taskId: string;
  taskTitle: string;
  selected: string;
  tieBreakRequired: boolean;
  options: { name: string; approach: string; pros: string[]; cons: string[]; confidence: number }[];
};

export function GateAlgorithms({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  const tasks = ((session.algorithms ?? null) as { tasks: AlgoTask[] } | null)?.tasks ?? [];
  const pending = tasks.filter((t) => t.tieBreakRequired);

  if (pending.length === 0) {
    return (
      <div>
        <p className="text-[13px] text-emerald-400">
          ✓ Approach auto-selected for every task (clear winners, reasons shown).
        </p>
        <ul className="mt-3 space-y-2">
          {tasks.map((t) => (
            <li key={t.taskId} className="rounded-lg border border-line bg-elev px-4 py-3 text-[13px]">
              <span className="font-medium">{t.taskTitle}</span>
              <span className="ml-2 font-mono text-[12px] text-emerald-400">{t.selected}</span>
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
        <span className="font-semibold text-amber-400">{pending.length} close call(s).</span>{" "}
        <span className="text-muted">Two approaches are genuinely comparable — you pick.</span>
      </p>
      <ul className="mt-3 space-y-3">
        {pending.map((t) => (
          <li key={t.taskId} className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-4 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="font-medium">{t.taskTitle}</span>
              <Badge variant="warn">Tie — your call</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {t.options.map((opt) => (
                <div key={opt.name} className="rounded border border-line bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] font-semibold">{opt.name}</span>
                    <span className="text-[11px] text-muted">{Math.round(opt.confidence * 100)}%</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{opt.approach}</p>
                  {opt.pros.length > 0 && <p className="mt-1 text-[11px] text-emerald-400">+ {opt.pros.join("; ")}</p>}
                  {opt.cons.length > 0 && <p className="mt-1 text-[11px] text-amber-400">− {opt.cons.join("; ")}</p>}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full"
                    disabled={busy}
                    onClick={() => call({ action: "algorithm_choose", taskId: t.taskId, choice: opt.name })}
                  >
                    Use {opt.name}
                  </Button>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
