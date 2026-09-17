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

type DashboardData = {
  entries: LedgerEntry[];
  leaderboard: LeaderRow[];
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
