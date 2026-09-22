"use client";

// VS Code Secondary Sidebar (AI Agent):
// Clean Copilot/Cursor-style assistant panel.
// No duplicate greeting, no card wrappers, compact metadata strip.

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { WsBuild } from "@/lib/workspace/build";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { api, ApiError } from "@/services/api";

const SUGGESTIONS = [
  "Implement next task",
  "Why was this model selected?",
  "What flaws did planning find?",
  "Explain architecture",
];

export function AgentChat({
  ws,
  sessionId,
  onExecute,
  canExecute,
}: {
  ws: WsBuild;
  sessionId: string;
  onExecute: () => void;
  canExecute: boolean;
}) {
  const messages = useWorkspaceStore((s) => s.messages);
  const addMsg = useWorkspaceStore((s) => s.addMsg);
  const updateMsg = useWorkspaceStore((s) => s.updateMsg);
  const chatBusy = useWorkspaceStore((s) => s.chatBusy);
  const setChatBusy = useWorkspaceStore((s) => s.setChatBusy);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const seededOnce = useRef(false);

  // Seed only once across entire session lifecycle
  useEffect(() => {
    if (!seededOnce.current && messages.length === 0) {
      seededOnce.current = true;
      addMsg({
        role: "agent",
        text: `Ready to implement ${ws.context.target.title}. Model routing and governance policies are active.`,
        steps: [
          `${ws.context.tasks.length} planned tasks`,
          ws.governance.trustBudget ? `Trust: ${Math.round(ws.governance.trustBudget.remaining)}/${Math.round(ws.governance.trustBudget.initial)}` : "Trust: 100%",
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Real execution events streaming from Trust Ledger
  const isExecuting = ws.runState === "running";
  const ledger = useQuery({
    queryKey: ["agent-events", sessionId],
    queryFn: () => api.ledgerRecords(sessionId),
    refetchInterval: isExecuting ? 3000 : false,
    retry: false,
  });
  const lastSeqRef = useRef<number>(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    const records = (ledger.data?.records ?? []) as { seq: number; eventType: string; detail?: { summary?: string } | null }[];
    if (records.length === 0) return;
    const maxSeq = Math.max(...records.map((r) => r.seq));
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSeqRef.current = maxSeq;
      return;
    }
    const fresh = records.filter((r) => r.seq > lastSeqRef.current).sort((a, b) => a.seq - b.seq);
    if (fresh.length === 0) return;
    lastSeqRef.current = maxSeq;
    const store = useWorkspaceStore.getState();
    for (const r of fresh) {
      const summary = r.detail?.summary;
      if (!summary) continue;
      if (/^task_started$|^task_execution$|^task_completed$|^task_failed$|^task_blocked$|^file_created$|^file_modified$|^file_deleted$|^file_op_rejected$|^execution_started$|^execution_completed$|^trust_budget_exhausted$/.test(r.eventType)) {
        const icon = r.eventType === "task_completed" ? "✓" : r.eventType === "task_failed" || r.eventType === "file_op_rejected" ? "✗" : "▶";
        store.addMsg({ role: "agent", text: `${icon} ${summary}`, steps: [] });
      }
    }
  }, [ledger.data]);

  const answerFromContext = (q: string): { text: string; steps: string[] } | null => {
    const lq = q.toLowerCase();
    if (/flaw|risk|issue|concern/.test(lq)) {
      const flaws = ws.context.identifiedFlaws;
      if (flaws.length === 0) return { text: "No flaws flagged during planning.", steps: [] };
      return {
        text: `Surfaced ${flaws.length} planning flaw${flaws.length === 1 ? "" : "s"}:`,
        steps: flaws.slice(0, 5).map((f) => `[${f.severity}] ${f.title} → ${f.fix}`),
      };
    }
    if (/approach|algorithm|architecture|stack|why.*(chose|choose|selected)/.test(lq) && !/model/.test(lq)) {
      return {
        text: `Approved approach choices:`,
        steps: ws.context.approaches.slice(0, 6).map((a) => `${a.taskTitle}: ${a.selected}`),
      };
    }
    if (/model|rout/.test(lq)) {
      return {
        text: `Model assignments (${ws.routingPolicy}):`,
        steps: ws.context.selectedModels.slice(0, 8).map((m) => `${m.taskTitle} → ${m.model}`),
      };
    }
    if (/task|plan|next|order/.test(lq)) {
      return {
        text: `${ws.context.tasks.length} tasks in dependency order:`,
        steps: ws.tasks.map(
          (t) => `${t.status === "verified" ? "✓" : t.status === "running" ? "◐" : "○"} ${t.title}`
        ),
      };
    }
    return null;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || chatBusy) return;
    setInput("");
    addMsg({ role: "user", text });
    const lq = text.toLowerCase();

    // Execute plan
    if (/implement|run|execute|build|start/.test(lq) && !/why|explain/.test(lq)) {
      if (!canExecute) {
        addMsg({
          role: "agent",
          text: "Execution unlocks after Models are finalized.",
          steps: [],
        });
        return;
      }
      addMsg({ role: "agent", text: "Starting implementation pipeline…", steps: ["Dispatching tasks to routed models"], pending: true });
      setChatBusy(true);
      try {
        onExecute();
        addMsg({
          role: "agent",
          text: "Pipeline dispatched. Source files will update as models generate code.",
          steps: [],
        });
      } finally {
        setChatBusy(false);
      }
      return;
    }

    // Explain via backend ledger endpoint
    if (/why|explain|what|how/.test(lq)) {
      setChatBusy(true);
      const pendingId = addMsg({ role: "agent", text: "Querying Trust Ledger…", pending: true });
      try {
        const res = await api.explain({ question: text, sessionId });
        updateMsg(pendingId, { text: res.answer, steps: [`Verified via ${res.recordsUsed} ledger records`], pending: false });
      } catch (err) {
        const fallback = answerFromContext(text);
        const detail = err instanceof ApiError ? err.message : "Service unavailable.";
        updateMsg(pendingId, {
          text: fallback ? fallback.text : `Ledger query failed: ${detail}`,
          steps: fallback?.steps ?? [],
          pending: false,
        });
      } finally {
        setChatBusy(false);
      }
      return;
    }

    // Context fallback
    const local = answerFromContext(text);
    if (local) {
      addMsg({ role: "agent", text: local.text, steps: local.steps });
      return;
    }

    addMsg({
      role: "agent",
      text: "I can run tasks, inspect model assignments, or query the Trust Ledger.",
      steps: [],
    });
  };

  const runningTask = ws.tasks.find((t) => t.status === "running");
  const completedCount = ws.tasks.filter((t) => t.status === "verified" || t.status === "flagged").length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#252526] text-[#cccccc]">
      {/* Compact Status Rows */}
      <div className="border-b border-[#2d2d2d] bg-[#1e1e1e] px-3 py-2 text-[11px] space-y-1 select-none">
        <div className="flex items-center justify-between">
          <span className="text-[#858585]">Status</span>
          <span className="flex items-center gap-1.5 text-white font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${ws.runState === "running" ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
            {ws.governance.agentStatus}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#858585]">Task</span>
          <span className="max-w-[190px] truncate text-[#cccccc]">
            {runningTask ? runningTask.title : `${completedCount}/${ws.tasks.length} tasks completed`}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#858585]">Model</span>
          <span className="font-mono text-[10px] text-[#858585]">
            {runningTask?.model ?? ws.context.selectedModels[0]?.model ?? "Auto"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#858585]">Risk</span>
          <span className="capitalize text-[#cccccc]">{ws.governance.overallRisk}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#858585]">Trust</span>
          <span className="text-[#cccccc]">
            {ws.governance.trustBudget ? `${Math.round(ws.governance.trustBudget.remaining)}/${Math.round(ws.governance.trustBudget.initial)}` : "100"}
          </span>
        </div>
      </div>

      {/* Messages list */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto ide-scroll px-3 py-2">
        {messages.map((m) => (
          <div key={m.id} className="text-[12px] leading-relaxed">
            {m.role === "agent" ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#858585]">
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-[#007acc] text-[8px] text-white">V</span>
                  <span>Verya</span>
                </div>
                <p className={`text-[#cccccc] ${m.pending ? "pulse-soft text-[#858585]" : ""}`}>{m.text}</p>
                {m.steps && m.steps.length > 0 && (
                  <ul className="mt-1 space-y-0.5 border-l border-[#3c3c3c] pl-2 text-[11px] font-mono text-[#858585]">
                    {m.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded bg-[#2a2d2e] px-2.5 py-1.5 text-[#e0e0e0]">
                  <p>{m.text}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="border-t border-[#2d2d2d] bg-[#252526] p-2">
        <div className="mb-1.5 flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="rounded bg-[#2d2d2d] px-2 py-0.5 text-[10px] text-[#858585] hover:bg-[#383838] hover:text-[#cccccc] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Ask agent..."
            className="min-h-[32px] max-h-20 flex-1 resize-none rounded bg-[#1e1e1e] p-2 font-sans text-[12px] text-[#cccccc] placeholder:text-[#666666] outline-none border border-[#3c3c3c] focus:border-[#007acc]"
            aria-label="Message agent"
          />
          <button
            type="button"
            disabled={!input.trim() || chatBusy}
            onClick={() => void send()}
            className="rounded bg-[#007acc] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#0062a3] disabled:opacity-30 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
