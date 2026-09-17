"use client";

import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";

export function GateExecution({
  session,
  busy,
  execute,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
  execute: () => void;
}) {
  const total = session.workflow?.tasks.length ?? 0;
  const done = session.executions.length;

  return (
    <div>
      <p className="text-[13px]">
        {session.gateStatus === "running" ? (
          <span className="pulse-soft text-muted">
            Executing tasks through the routed models… ({done}/{total} done)
          </span>
        ) : (
          <>Ready to execute {total} tasks with the routed models.</>
        )}
      </p>
      <Button className="mt-4" disabled={busy} onClick={execute}>
        {busy ? "Executing…" : "Execute all tasks →"}
      </Button>
    </div>
  );
}
