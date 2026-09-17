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
};

export function GateTasks({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  const tasks = (session.workflow?.tasks ?? []) as Task[];
  const [titles, setTitles] = useState<Record<string, string>>({});

  const confirm = () => {
    call({
      action: "tasks_edit",
      tasks: tasks.map((t) => ({ ...t, title: titles[t.id] ?? t.title })),
    });
  };

  return (
    <div>
      <p className="text-[13px] text-muted">
        {tasks.length} tasks. Edit, remove, or confirm — dependencies follow your edits.
      </p>
      <ul className="mt-3 space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-line bg-elev px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted">{t.id}</span>
              <Input
                value={titles[t.id] ?? t.title}
                onChange={(e) => setTitles((prev) => ({ ...prev, [t.id]: e.target.value }))}
                className="h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent hover:border-line"
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
      <Button className="mt-4" disabled={busy || tasks.length === 0} onClick={confirm}>
        Confirm tasks →
      </Button>
    </div>
  );
}
