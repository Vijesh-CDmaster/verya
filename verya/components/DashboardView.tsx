"use client";

import { useEffect, useState } from "react";

type LedgerEntry = {
  seq: number;
  id: string;
  sessionId: string;
  gate: string;
  eventType: string;
  actor: string;
  taskId?: string;
  model?: string;
  detail: Record<string, unknown>;
  verification?: { passed: boolean; issues: string[] };
  timestamp: string;
};

type LeaderRow = {
  model: string;
  taskCategory: string;
  trustScore: number;
  reputationScore: number;
  samples: number;
  acceptanceRate: number;
  verificationPassRate: number;
};

type SessionRow = {
  id: string;
  createdAt: string;
  gate: string;
  gateStatus: string;
  title: string;
};

type QueueRow = {
  sessionId: string;
  taskId: string;
  taskTitle: string;
  model: string;
  status: string;
  issues: string[];
};

type DashboardData = {
  entries: LedgerEntry[];
  leaderboard: LeaderRow[];
  sessions: SessionRow[];
  reviewQueue: QueueRow[];
  analytics: {
    totalTokens: number;
    avgLatencyMs: number;
    verificationRate: number;
    executionCount: number;
  };
};

export default function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gateFilter, setGateFilter] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-[13px] text-danger">{error}</p>;
  }
  if (!data) {
    return <p className="text-[13px] text-muted">Loading dashboard…</p>;
  }

  const filtered = gateFilter
    ? data.entries.filter((e) => e.gate === gateFilter)
    : data.entries;
  const gates = [...new Set(data.entries.map((e) => e.gate))];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-[13px] text-muted">
            Every decision, on the record. {data.entries.length} ledger entries.
          </p>
        </div>
        <a
          href="/api/dashboard/export"
          className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary no-underline transition hover:opacity-90"
        >
          Export compliance report ↓
        </a>
      </div>

      {/* Analytics cards (F21-lite) */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Tokens used" value={data.analytics.totalTokens.toLocaleString()} />
        <StatCard label="Avg latency" value={`${(data.analytics.avgLatencyMs / 1000).toFixed(1)}s`} />
        <StatCard
          label="Verification pass rate"
          value={`${Math.round(data.analytics.verificationRate * 100)}%`}
        />
        <StatCard label="Task executions" value={String(data.analytics.executionCount)} />
      </div>

      {/* Leaderboard (F12) */}
      <section>
        <h2 className="text-[15px] font-semibold">Model reputation leaderboard</h2>
        {data.leaderboard.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">
            No reputation data yet — run a project and accept/reject outputs to build trust scores.
          </p>
        ) : (
          <table className="mt-3 w-full border-collapse overflow-hidden rounded-lg border border-line text-[13px]">
            <thead>
              <tr className="bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5">Task category</th>
                <th className="px-4 py-2.5">Trust</th>
                <th className="px-4 py-2.5">Accept rate</th>
                <th className="px-4 py-2.5">Verified</th>
                <th className="px-4 py-2.5">Samples</th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.map((row) => (
                <tr key={`${row.model}-${row.taskCategory}`} className="border-t border-line">
                  <td className="px-4 py-2.5 font-mono text-[12px]">{row.model}</td>
                  <td className="px-4 py-2.5">{row.taskCategory}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        row.trustScore >= 70
                          ? "bg-success/15 text-success"
                          : row.trustScore >= 45
                            ? "bg-warn/15 text-warn"
                            : "bg-danger/15 text-danger"
                      }`}
                    >
                      {row.trustScore}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{Math.round(row.acceptanceRate * 100)}%</td>
                  <td className="px-4 py-2.5">{Math.round(row.verificationPassRate * 100)}%</td>
                  <td className="px-4 py-2.5">{row.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Human review / escalation queue (F11, F22) */}
      <section>
        <h2 className="text-[15px] font-semibold">
          Review queue{" "}
          {data.reviewQueue.length > 0 && (
            <span className="ml-1 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
              {data.reviewQueue.length}
            </span>
          )}
        </h2>
        {data.reviewQueue.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">
            Nothing escalated — flagged or failed outputs land here for human review.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.reviewQueue.map((q) => (
              <li
                key={q.sessionId + q.taskId}
                className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-[13px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{q.taskTitle}</span>
                  <span className="rounded border border-line bg-bg px-2 py-0.5 font-mono text-[11px]">{q.model}</span>
                  <span className="rounded bg-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">
                    {q.status}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-muted">{q.sessionId.slice(0, 8)}</span>
                </div>
                {q.issues.length > 0 && (
                  <p className="mt-1 text-[12px] text-muted">{q.issues.join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Session history (F22) */}
      <section>
        <h2 className="text-[15px] font-semibold">Workflow history</h2>
        {data.sessions.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">No sessions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.sessions.map((s) => (
              <li key={s.id} className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.title}</span>
                  <span className="rounded-full border border-line bg-bg px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {s.gate} · {s.gateStatus.replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto text-[11px] text-muted">
                    {new Date(s.createdAt).toLocaleString()} · {s.id.slice(0, 8)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Org skill-map heatmap (F22) */}
      {data.leaderboard.length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold">Org skill map</h2>
          <p className="mt-1 text-[12px] text-muted">
            Trust per model × task category — darker (higher opacity) is more trusted.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.leaderboard.map((row) => {
              const intensity = Math.min(Math.max(row.trustScore, 0), 100) / 100;
              return (
                <div
                  key={`${row.model}-${row.taskCategory}`}
                  title={`${row.model} × ${row.taskCategory}: trust ${row.trustScore}, ${row.samples} samples`}
                  className="rounded-lg border border-line px-3 py-2 text-[12px]"
                  style={{
                    background: `rgba(16, 185, 129, ${0.08 + intensity * 0.5})`,
                  }}
                >
                  <span className="font-mono text-[11px]">{row.model}</span>
                  <span className="mx-1.5 text-muted">×</span>
                  <span className="uppercase tracking-wide text-[10px]">{row.taskCategory}</span>
                  <span className="ml-2 font-semibold">{row.trustScore}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Trust ledger (F10) */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold">Trust ledger</h2>
          <select
            value={gateFilter}
            onChange={(e) => setGateFilter(e.target.value)}
            className="rounded border border-line bg-bg px-2 py-1 text-[12px]"
          >
            <option value="">All gates</option>
            {gates.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Timestamp</th>
                <th className="px-3 py-2.5">Session</th>
                <th className="px-3 py-2.5">Gate</th>
                <th className="px-3 py-2.5">Event</th>
                <th className="px-3 py-2.5">Actor</th>
                <th className="px-3 py-2.5">Model</th>
                <th className="px-3 py-2.5">Summary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="px-3 py-2.5 text-muted">{e.seq}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {e.sessionId.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2.5">{e.gate}</td>
                  <td className="px-3 py-2.5">{e.eventType}</td>
                  <td className="px-3 py-2.5">{e.actor}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{e.model ?? "—"}</td>
                  <td className="px-3 py-2.5">{String(e.detail?.summary ?? "")}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    No ledger entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
