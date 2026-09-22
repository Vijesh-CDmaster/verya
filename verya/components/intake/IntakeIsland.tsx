"use client";

import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useSession } from "@/hooks/use-session";
import { IntakeForm } from "./IntakeForm";
import { SessionView } from "@/components/pipeline/SessionView";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { Session } from "@/schemas/pipeline";

// Gates that belong to the coding workspace rather than the planning stepper.
// Execution + Review are repositioned there (agent activity / changes + verification);
// the backend concepts are unchanged.
const IN_WORKSPACE = new Set(["execution", "review"]);

export function IntakeIsland() {
  const sessionId = useUiStore((s) => s.sessionId);
  const setSessionId = useUiStore((s) => s.setSessionId);
  const reset = useUiStore((s) => s.reset);
  const { data, isLoading, isError, error } = useSession(sessionId);

  const session = (data?.session ?? null) as Session | null;
  const [viewMode, setViewMode] = useState<"ide" | "project">("ide");

  // Support ?session=<id> and ?view=project direct linking & browser back/forward
  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("session");
      if (p && p !== sessionId) {
        setSessionId(p);
      }
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "project") {
        setViewMode("project");
      } else if (v === "ide") {
        setViewMode("ide");
      }
    }
  }, [sessionId, setSessionId]);

  useEffect(() => {
    const onPopState = () => {
      const v = new URLSearchParams(window.location.search).get("view");
      setViewMode(v === "project" ? "project" : "ide");
      const sid = new URLSearchParams(window.location.search).get("session");
      if (sid && sid !== sessionId) {
        setSessionId(sid);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [sessionId, setSessionId]);

  const canBeInWorkspace = Boolean(
    sessionId &&
    session &&
    (IN_WORKSPACE.has(session.gate) || (session.gate === "models" && session.modelsFinalized === true))
  );

  const handleBackToProject = () => {
    setViewMode("project");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("view", "project");
      if (sessionId) url.searchParams.set("session", sessionId);
      window.history.pushState(null, "", url.toString());
    }
  };

  const handleReturnToWorkspace = () => {
    setViewMode("ide");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      if (sessionId) url.searchParams.set("session", sessionId);
      window.history.pushState(null, "", url.toString());
    }
  };

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
        {canBeInWorkspace && viewMode !== "project" ? (
          // Planning is complete (through Models): the same page transforms into the
          // full-screen coding workspace — no separate navigation. A finalized Models
          // stage also lands here (execution is armed, Run unlocks in the shell).
          <WorkspaceShell
            session={session!}
            onReset={() => {
              setSessionId(null);
              reset();
            }}
            onBack={handleBackToProject}
          />
        ) : sessionId && session ? (
          <SessionView
            session={session}
            onReset={() => {
              setSessionId(null);
              reset();
            }}
            onOpenWorkspace={handleReturnToWorkspace}
            canOpenWorkspace={canBeInWorkspace}
          />
        ) : null}
      </div>
    </div>
  );
}
