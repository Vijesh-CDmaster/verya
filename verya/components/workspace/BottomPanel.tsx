"use client";

// VS Code Bottom Panel: compact 200px utility panel.
// Flat tabs with subtle active line. Clean monospace row tables for Output/Problems/Events.

import { useQuery } from "@tanstack/react-query";
import type { WsBuild } from "@/lib/workspace/build";
import type { BottomTab } from "@/stores/workspace-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api } from "@/services/api";

const TABS: { id: BottomTab; label: string }[] = [
  { id: "problems", label: "PROBLEMS" },
  { id: "output", label: "OUTPUT" },
  { id: "terminal", label: "EXECUTION MONITOR" },
  { id: "changes", label: "CHANGES" },
  { id: "tests", label: "TESTS" },
  { id: "verification", label: "VERIFICATION" },
  { id: "events", label: "EVENTS" },
];

type LedgerRecord = {
  seq: number;
  createdAt: string;
  gate: string;
  eventType: string;
  actor?: string;
  model?: string;
  detail?: { summary?: string } | null;
};

export function BottomPanel({
  ws,
  sessionId,
}: {
  ws: WsBuild;
  sessionId: string;
}) {
  const tab = useWorkspaceStore((s) => s.bottomTab);
  const setTab = useWorkspaceStore((s) => s.setBottomTab);
  const open = useWorkspaceStore((s) => s.bottomOpen);
  const toggle = useWorkspaceStore((s) => s.toggleBottom);
  const search = useWorkspaceStore((s) => s.search);

  const ledger = useQuery({
    queryKey: ["ws-ledger", sessionId],
    queryFn: () => api.ledgerRecords(sessionId),
    refetchInterval: 8000,
    retry: false,
  });

  const records = ((ledger.data?.records ?? []) as LedgerRecord[]).slice().reverse();

  const modified = ws.files.filter((f) => f.status === "modified");
  const verifiedCount = ws.governance.verification.verified;
  const allIssues = ws.tasks.flatMap(t => (t.verification?.issues ?? []).map(i => ({ issue: i, task: t.title, passed: t.verification?.passed ?? true })));
  const problemCount = allIssues.length;

  return (
    <div className={`flex min-h-0 shrink-0 flex-col border-t border-[#2d2d2d] bg-[#1e1e1e] transition-[height] duration-150 select-none ${open ? "h-[200px]" : "h-[26px]"}`}>
      {/* Flat VS Code Panel Tab Strip */}
      <div className="flex h-[26px] shrink-0 items-center justify-between border-b border-[#2d2d2d] px-2">
        <div className="flex h-full items-center">
          {TABS.map((t) => {
            const isActive = tab === t.id && open;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  if (!open) toggle();
                }}
                className={`relative flex h-full items-center px-2.5 text-[11px] font-medium tracking-wide transition-colors ${
                  isActive
                    ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-white"
                    : "text-[#858585] hover:text-[#cccccc]"
                }`}
              >
                <span>{t.label}</span>
                {t.id === "problems" && problemCount > 0 && (
                  <span className="ml-1 text-[10px] text-[#e2c08d]">({problemCount})</span>
                )}
                {t.id === "changes" && modified.length > 0 && (
                  <span className="ml-1 text-[10px] text-[#73c991]">({modified.length})</span>
                )}
                {t.id === "verification" && verifiedCount > 0 && (
                  <span className="ml-1 text-[10px] text-[#73c991]">({verifiedCount})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel Actions */}
        <div className="flex items-center gap-2 pr-1">
          {tab === "terminal" && open && (
            <input
              value={search}
              onChange={(e) => useWorkspaceStore.getState().setSearch(e.target.value)}
              placeholder="Filter logs..."
              className="h-[18px] w-28 rounded bg-[#252526] px-1.5 font-mono text-[10px] text-[#cccccc] outline-none border border-[#3c3c3c] focus:border-[#007acc]"
            />
          )}
          <button
            type="button"
            onClick={toggle}
            className="p-1 text-[#858585] hover:text-[#cccccc]"
            title={open ? "Hide Panel (Ctrl+J)" : "Show Panel (Ctrl+J)"}
            aria-label={open ? "Hide Panel" : "Show Panel"}
          >
            <svg
              className={`h-3 w-3 transition-transform ${open ? "" : "rotate-180"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Panel Content Body */}
      {open && (
        <div className="min-h-0 flex-1 overflow-auto ide-scroll px-3 py-1.5 font-mono text-[11px] select-text">
          {tab === "problems" && <ProblemsView allIssues={allIssues} />}
          {tab === "output" && <OutputView ws={ws} />}
          {tab === "terminal" && <TerminalView records={records} search={search} loading={ledger.isLoading} error={ledger.isError} />}
          {tab === "changes" && <ChangesView ws={ws} />}
          {tab === "tests" && <TestsView />}
          {tab === "verification" && <VerificationView ws={ws} />}
          {tab === "events" && <EventsView records={records} loading={ledger.isLoading} />}
        </div>
      )}
    </div>
  );
}

function ProblemsView({ allIssues }: { allIssues: { issue: string; task: string; passed: boolean }[] }) {
  if (allIssues.length === 0) {
    return (
      <div className="py-2 text-[11px] text-[#858585]">
        No problems have been detected in the workspace.
      </div>
    );
  }
  return (
    <div className="space-y-0.5 text-[11px]">
      {allIssues.map((item, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 hover:bg-[#2a2d2e] px-1 rounded">
          <span className="text-[#e2c08d]">⚠</span>
          <span className="text-[#cccccc]">{item.issue}</span>
          <span className="ml-auto font-sans text-[10px] text-[#858585]">{item.task}</span>
        </div>
      ))}
    </div>
  );
}

function OutputView({ ws }: { ws: WsBuild }) {
  const done = ws.tasks.filter((t) => t.execution);
  if (done.length === 0) {
    return (
      <div className="py-2 text-[11px] text-[#858585]">
        [Ready] No task execution output yet.
      </div>
    );
  }
  return (
    <div className="divide-y divide-[#2d2d2d] text-[11px]">
      {done.map((t) => (
        <div key={t.id} className="flex items-center justify-between py-1 px-1 hover:bg-[#252526]">
          <span className="font-sans text-[#cccccc] truncate max-w-[280px]">{t.title}</span>
          <span className="font-mono text-[#858585] text-[10px]">{t.model}</span>
          <span className={`text-[10px] font-medium ${t.status === "verified" ? "text-[#73c991]" : t.status === "failed" ? "text-red-400" : "text-[#e2c08d]"}`}>
            {t.status === "verified" ? "✓ verified" : t.status === "failed" ? "✗ failed" : "⚠ flagged"}
          </span>
        </div>
      ))}
    </div>
  );
}

function TerminalView({
  records,
  search,
  loading,
  error,
}: {
  records: LedgerRecord[];
  search: string;
  loading: boolean;
  error: boolean;
}) {
  if (error) {
    return <div className="py-2 text-[11px] text-[#e2c08d]">Ledger stream unavailable.</div>;
  }
  if (loading) return <div className="py-2 text-[11px] text-[#858585]">Connecting to execution monitor...</div>;
  const q = search.trim().toLowerCase();
  const shown = q ? records.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : records;
  if (shown.length === 0) {
    return <div className="py-2 text-[11px] text-[#666666]">{q ? `No logs match "${search}"` : "$ waiting for execution events..."}</div>;
  }
  return (
    <div className="space-y-0.5 text-[11px] leading-relaxed">
      {shown.slice(0, 100).map((r) => (
        <div key={r.seq} className="flex gap-2">
          <span className="text-[#555555]">[{String(r.seq).padStart(3, "0")}]</span>
          <span className="text-[#3794ff]">{r.gate}</span>
          <span className="text-[#dcdcaa]">{r.eventType}</span>
          {r.detail?.summary && <span className="text-[#cccccc]">— {r.detail.summary}</span>}
        </div>
      ))}
    </div>
  );
}

function ChangesView({ ws }: { ws: WsBuild }) {
  const applied = ws.tasks.flatMap((t) =>
    (t.execution?.fileOps ?? [])
      .filter((f) => !f.rejected)
      .map((f) => ({ ...f, taskId: t.id, taskTitle: t.title }))
  );
  if (ws.files.length === 0 && applied.length === 0) {
    return <div className="py-2 text-[11px] text-[#858585]">No file changes recorded yet.</div>;
  }
  return (
    <div className="space-y-0.5 text-[11px]">
      {applied.map((f, i) => (
        <div key={`${f.taskId}-${f.path}-${i}`} className="flex items-center gap-3 py-0.5 hover:bg-[#252526] px-1 rounded">
          <span className={`w-12 font-bold ${f.operation === "create" ? "text-[#73c991]" : f.operation === "delete" ? "text-red-400" : "text-[#e2c08d]"}`}>
            {f.operation.toUpperCase()}
          </span>
          <span className="text-[#cccccc]">{f.path}</span>
          <span className="ml-auto font-sans text-[10px] text-[#666666]">{f.taskTitle}</span>
        </div>
      ))}
    </div>
  );
}

function TestsView() {
  return (
    <div className="py-2 text-[11px] text-[#858585]">
      <p className="text-[#e2c08d]">No external test runner configured.</p>
      <p className="mt-0.5">Automated checks run via rules audits in the Verification tab.</p>
    </div>
  );
}

function VerificationView({ ws }: { ws: WsBuild }) {
  const withVerif = ws.tasks.filter((t) => t.verification);
  if (withVerif.length === 0) {
    return <div className="py-2 text-[11px] text-[#858585]">Verification results will appear as tasks finish.</div>;
  }
  return (
    <div className="space-y-0.5 text-[11px]">
      {withVerif.map((t) => (
        <div key={t.id} className="flex items-center gap-2 py-0.5 hover:bg-[#252526] px-1 rounded">
          <span className={t.verification!.passed ? "text-[#73c991]" : "text-[#e2c08d]"}>
            {t.verification!.passed ? "✓ PASS" : "⚠ ISSUES"}
          </span>
          <span className="text-[#cccccc]">{t.title}</span>
          <span className="ml-auto font-sans text-[10px] text-[#666666]">{t.verification!.method}</span>
        </div>
      ))}
    </div>
  );
}

function EventsView({ records, loading }: { records: LedgerRecord[]; loading: boolean }) {
  if (loading) return <div className="py-2 text-[11px] text-[#858585]">Loading ledger events...</div>;
  if (records.length === 0) return <div className="py-2 text-[11px] text-[#858585]">No ledger events recorded.</div>;
  return (
    <div className="space-y-0.5 text-[11px]">
      {records.slice(0, 50).map((r) => (
        <div key={r.seq} className="flex items-center gap-3 py-0.5 hover:bg-[#252526] px-1 rounded">
          <span className="text-[#555555]">#{r.seq}</span>
          <span className="text-[#3794ff]">{r.eventType}</span>
          <span className="text-[#cccccc]">{r.detail?.summary ?? ""}</span>
          <span className="ml-auto text-[10px] text-[#555555]">{new Date(r.createdAt).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}
