"use client";

import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";

export function GateExecution({
  session,
  call,
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
  const budget = session.trustBudget;

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
      {budget && <p className={`mt-2 text-xs ${budget.status === "exhausted" ? "text-amber-400" : "text-muted"}`}>Trust budget: {budget.remaining.toFixed(0)} / {budget.initial.toFixed(0)} units remaining</p>}
      {budget?.status === "exhausted" && <Button className="mt-3" variant="outline" disabled={busy} onClick={() => call({ action: "trust_budget_approve", amount: 50 })}>Approve 50 more trust units</Button>}
      <Button className="mt-4" disabled={busy} onClick={execute}>
        {busy ? "Executing…" : "Execute all tasks →"}
      </Button>
    </div>
  );
}
