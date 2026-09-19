"use client";

// Session view: gate header + router that renders the active gate component.
import type { Session, GateId } from "@/schemas/pipeline";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useGateAction, useExecute } from "@/hooks/use-session";
import { GateSuitability } from "./GateSuitability";
import { GatePlatform } from "./GatePlatform";
import { GateFlaws } from "./GateFlaws";
import { GateStack } from "./GateStack";
import { GateTasks } from "./GateTasks";
import { GateAlgorithms } from "./GateAlgorithms";
import { GateModels } from "./GateModels";
import { GateExecution } from "./GateExecution";
import { GateReview } from "./GateReview";

const GATES: { id: GateId; label: string }[] = [
  { id: "suitability", label: "Suitability" },
  { id: "platform", label: "Target" },
  { id: "flaws", label: "Flaws" },
  { id: "stack", label: "Stack" },
  { id: "tasks", label: "Tasks" },
  { id: "algorithms", label: "Approach" },
  { id: "models", label: "Models" },
  { id: "execution", label: "Execution" },
  { id: "review", label: "Review" },
];

export function SessionView({ session, onReset }: { session: Session; onReset: () => void }) {
  const act = useGateAction(session.id);
  const execute = useExecute(session.id);

  const call = async (body: unknown) => {
    try {
      await act.mutateAsync(body);
    } catch (err) {
      // Error surfaces through act.error below; nothing else to do here.
      console.error(err);
    }
  };

  const busy = act.isPending || execute.isPending || session.gateStatus === "running";
  const gateError =
    act.error instanceof Error ? act.error.message : execute.error instanceof Error ? execute.error.message : null;

  const currentIdx = GATES.findIndex((g) => g.id === session.gate);

  return (
    <div className="fade-up">
      {/* Gate stepper */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {GATES.map((g, i) => (
          <span key={g.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted">·</span>}
            <Badge
              variant={
                i < currentIdx
                  ? "success"
                  : i === currentIdx
                    ? session.gateStatus === "failed"
                      ? "danger"
                      : session.gateStatus === "awaiting_user"
                        ? "accent"
                        : "warn"
                    : "muted"
              }
            >
              {g.label}
            </Badge>
          </span>
        ))}
        <span className="ml-auto font-mono text-[11px] text-muted">{session.id.slice(0, 8)}</span>
      </div>

      {busy && session.gateStatus === "running" && (
        <p className="pulse-soft mb-3 text-[12px] text-muted">Verya is working…</p>
      )}

      {session.gateStatus === "failed" && (
        <Alert variant="error" className="mb-4">
          <AlertTitle>Analysis could not continue</AlertTitle>
          <AlertDescription>
            {session.error ??
              "The analysis failed before the first review step. Check your backend configuration and try again."}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-line bg-card p-5 shadow-sm">
        {session.gate === "suitability" && <GateSuitability session={session} call={call} busy={busy} />}
        {session.gate === "platform" && <GatePlatform session={session} call={call} busy={busy} />}
        {session.gate === "flaws" && <GateFlaws session={session} call={call} busy={busy} />}
        {session.gate === "stack" && <GateStack session={session} call={call} busy={busy} />}
        {session.gate === "tasks" && <GateTasks session={session} call={call} busy={busy} />}
        {session.gate === "algorithms" && <GateAlgorithms session={session} call={call} busy={busy} />}
        {session.gate === "models" && <GateModels session={session} call={call} busy={busy} onExecute={async () => { try { await execute.mutateAsync(); } catch { /* surfaced below */ } }} />}
        {session.gate === "execution" && <GateExecution session={session} call={call} busy={busy} execute={async () => { try { await execute.mutateAsync(); } catch { /* surfaced below */ } }} />}
        {session.gate === "review" && <GateReview session={session} call={call} busy={busy} />}
        {session.gate === "intake" && <p className="text-sm text-muted">Preparing…</p>}

        {gateError && (
          <Alert variant="error" className="mt-4">
            <AlertTitle>Gate failed</AlertTitle>
            <AlertDescription>{gateError}</AlertDescription>
          </Alert>
        )}
      </div>

      <button type="button" onClick={onReset} className="mt-4 text-[12px] text-muted underline hover:text-fg">
        ← Start a new project
      </button>
    </div>
  );
}
