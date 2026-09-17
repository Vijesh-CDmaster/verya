"use client";

import { useIntakeStore } from "@/stores/intake-store";
import { useSession } from "@/hooks/use-session";
import { IntakeForm } from "./IntakeForm";
import { SessionView } from "@/components/pipeline/SessionView";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { Session } from "@/schemas/pipeline";

export function IntakeIsland() {
  const sessionId = useIntakeStore((s) => s.sessionId);
  const setSessionId = useIntakeStore((s) => s.setSessionId);
  const reset = useIntakeStore((s) => s.reset);
  const { data, isLoading, isError, error } = useSession(sessionId);

  const session = (data?.session ?? null) as Session | null;

  return (
    <div className="rounded-xl border border-line bg-card shadow-sm">
      <div className="border-b border-line px-5 py-3 text-[12px] font-semibold uppercase tracking-wider text-muted">
        Your project
      </div>
      <div className="p-5">
        {!sessionId && (
          <IntakeForm
            onStarted={(s) => {
              setSessionId(s.id);
            }}
          />
        )}
        {sessionId && isLoading && <p className="pulse-soft text-sm text-muted">Loading session…</p>}
        {sessionId && isError && (
          <Alert variant="error">
            <AlertTitle>Could not load session</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Unknown error"}
              <button className="mt-2 block text-xs underline" onClick={() => reset()}>
                Start over
              </button>
            </AlertDescription>
          </Alert>
        )}
        {sessionId && session && (
          <SessionView
            session={session}
            onReset={() => {
              setSessionId(null);
              reset();
            }}
          />
        )}
      </div>
    </div>
  );
}
