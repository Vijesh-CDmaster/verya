"use client";

import { useDashboard } from "@/hooks/use-session";
import { MemorySearchCard } from "@/components/dashboard/MemorySearchCard";
import { ExplainPanel } from "@/components/dashboard/ExplainPanel";
import { PolicySuggestionsCard } from "@/components/dashboard/PolicySuggestionsCard";
import { ConstitutionCard } from "@/components/dashboard/ConstitutionCard";
import { AgentRegistryCard } from "@/components/dashboard/AgentRegistryCard";
import { DelegatedAuthorityCard } from "@/components/dashboard/DelegatedAuthorityCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

export function DashboardView() {
  const { data, isLoading, isError, error } = useDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-elev" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <Alert variant="error">
        <AlertTitle>Dashboard unavailable</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Backend unreachable"}</AlertDescription>
      </Alert>
    );
  }
  const d = (data ?? {}) as AnyRecord;

  const devStore = d.dbConfigured === false;

  const analytics = (d.analytics ?? {}) as AnyRecord;
  const byModel = (analytics.byModel ?? []) as Array<{ model: string; tasks: number; avgLatencyMs: number; tokens: number }>;
  const byCategory = (analytics.byTaskCategory ?? []) as Array<{ taskCategory: string; tasks: number; avgLatencyMs: number; tokens: number; costUnits: number }>;
  const trustBar = (d.trustBar ?? {}) as { trustBar?: number; minSamples?: number; recommendations?: Array<{ taskCategory: string; model: string | null; costUnits: number | null; trustScore: number | null; samples: number; reason: string }> };
  const policySuggestions = (d.policySuggestions ?? []) as Array<{ id: number; version: number; rule: string; rationale: string; status: string }>;
  const constitution = (d.constitution ?? {}) as { generatedAt?: string; text?: string };
  const reputation = (d.reputation ?? []) as AnyRecord[];
  const heatmap = (d.heatmap ?? []) as AnyRecord[];
  const sessions = (d.sessions ?? []) as AnyRecord[];
  const records = (d.records ?? []) as AnyRecord[];
  const reviewQueue = (d.reviewQueue ?? []) as AnyRecord[];
  const chain = (d.chain ?? {}) as { valid: boolean; checked: number };
  const maxTrust = Math.max(1, ...heatmap.map((h) => Number(h.trustScore) || 0));

  return (
    <div className="space-y-6">
      {devStore && (
        <Alert variant="warn">
          <AlertTitle>Dev store active — Neon not connected yet</AlertTitle>
          <AlertDescription>
            Persistence is running on the local file-backed dev store, so every stat below is real
            recorded data from your pipelines. Add your Neon <code>DATABASE_URL</code> to{" "}
            <code>backend/.env</code> and run <code>npm run migrate</code> inside <code>backend/</code>{" "}
            to switch wholly to Postgres — the dev-store schema is identical.
          </AlertDescription>
        </Alert>
      )}
      {!chain.valid && (
        <Alert variant="error">
          <AlertTitle>Ledger integrity warning</AlertTitle>
          <AlertDescription>Hash chain broken — audit the ledger immediately.</AlertDescription>
        </Alert>
      )}

      {/* Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Execution analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Ledger events" value={String(analytics.totalEvents ?? 0)} />
            <Stat label="Executions" value={String(analytics.executions ?? 0)} />
            <Stat label="Cost units" value={String(analytics.totalCostUnits ?? 0)} />
            <Stat label="Chain" value={chain.valid ? `valid (${chain.checked})` : "BROKEN"} />
            <Stat label="Queue" value={d.queue?.configured ? `waiting: ${d.queue.executionWaiting ?? 0}` : "inline mode"} />
          </div>
          {byModel.length > 0 && (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byModel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="model" tick={{ fontSize: 10, fill: "var(--muted)" }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <ReTooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }} />
                  <Bar dataKey="avgLatencyMs" name="avg latency (ms)" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Org memory semantic search (pgvector) */}
      <MemorySearchCard />

      <Card>
        <CardHeader>
          <CardTitle>Cheapest trusted model</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted">
            Trust bar: {trustBar.trustBar ?? 70} · minimum samples: {trustBar.minSamples ?? 1}
          </p>
          {!trustBar.recommendations?.length ? (
            <p className="text-sm text-muted">No task-category reputation history yet.</p>
          ) : (
            <div className="space-y-2">
              {trustBar.recommendations.map((recommendation) => (
                <div key={recommendation.taskCategory} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-xs">
                  <span className="font-medium">{recommendation.taskCategory}</span>
                  <span className="font-mono">{recommendation.model ?? "No qualifying model"}</span>
                  <span className="text-muted">{recommendation.model ? `${recommendation.costUnits} units · trust ${recommendation.trustScore?.toFixed(1)}` : recommendation.reason}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage by task category</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {byCategory.length === 0 ? <p className="px-5 pb-3 text-sm text-muted">No execution data yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Tasks</TableHead><TableHead>Avg latency</TableHead><TableHead>Tokens</TableHead><TableHead>Cost units</TableHead></TableRow></TableHeader>
              <TableBody>{byCategory.map((row) => <TableRow key={row.taskCategory}><TableCell className="text-xs">{row.taskCategory}</TableCell><TableCell className="text-xs">{row.tasks}</TableCell><TableCell className="text-xs">{row.avgLatencyMs} ms</TableCell><TableCell className="text-xs">{row.tokens}</TableCell><TableCell className="text-xs">{row.costUnits}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* F22 Explain My Decision — ledger-grounded Q&A */}
      <ExplainPanel />

      <PolicySuggestionsCard suggestions={policySuggestions} />
      <ConstitutionCard constitution={constitution} />

      {/* F23 Agent Registry */}
      <AgentRegistryCard />

      {/* F23 Phase 4: Delegated Authority */}
      <DelegatedAuthorityCard />

      {/* Reputation leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Model reputation leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {reputation.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-muted">No reputation data yet — run a pipeline and give feedback.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Task category</TableHead>
                  <TableHead>Trust</TableHead>
                  <TableHead>Samples</TableHead>
                  <TableHead>Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reputation.slice(0, 12).map((r) => (
                  <TableRow key={`${r.model}-${r.taskCategory}`}>
                    <TableCell className="font-mono text-xs">{String(r.model)}</TableCell>
                    <TableCell className="text-xs">{String(r.taskCategory)}</TableCell>
                    <TableCell>
                      <Badge variant={Number(r.trustScore) >= 70 ? "success" : Number(r.trustScore) >= 45 ? "warn" : "danger"}>
                        {Number(r.trustScore).toFixed(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{String(r.samples)}</TableCell>
                    <TableCell className="text-xs">{r.trend === "up" ? "▲" : r.trend === "down" ? "▼" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Skill-map heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Org skill map</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmap.length === 0 ? (
            <p className="text-sm text-muted">No skill data yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {heatmap.map((h) => (
                <span
                  key={`${h.model}-${h.taskCategory}`}
                  title={`${h.model} × ${h.taskCategory}: trust ${h.trustScore}, ${h.samples} samples`}
                  className="rounded-md border border-line px-2 py-1 font-mono text-[11px]"
                  style={{ background: `color-mix(in srgb, var(--success) ${Math.round((Number(h.trustScore) / maxTrust) * 45)}%, transparent)` }}
                >
                  {String(h.model).slice(0, 22)} × {String(h.taskCategory)}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review queue */}
      <Card>
        <CardHeader>
          <CardTitle>Review queue (escalations & flags)</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {reviewQueue.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-muted">Nothing waiting for human review.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Summary</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Session</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewQueue.slice(0, 10).map((r) => (
                  <TableRow key={String(r.seq)}>
                    <TableCell className="text-xs">{String((r.detail as AnyRecord)?.summary ?? "")}</TableCell>
                    <TableCell className="font-mono text-xs">{String(r.model ?? "—")}</TableCell>
                    <TableCell className="font-mono text-[11px]">{String(r.sessionId ?? "").slice(0, 8)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Workflow history */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow history</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {sessions.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-muted">No pipelines yet — start one from the home page.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Gate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={String(s.id)}>
                    <TableCell className="max-w-[240px] truncate text-xs">{String(s.title)}</TableCell>
                    <TableCell className="text-xs">{String(s.gate)}</TableCell>
                    <TableCell>
                      <Badge variant={s.gateStatus === "failed" ? "danger" : s.gateStatus === "awaiting_user" ? "accent" : "muted"}>
                        {String(s.gateStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted">
                      {new Date(String(s.updatedAt)).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Trust ledger</CardTitle>
          <a href={`${process.env.NEXT_PUBLIC_API_URL || ""}/api/ledger/export`}>
            <Button variant="outline" size="sm">
              Export compliance report
            </Button>
          </a>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {records.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-muted">Ledger is empty.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Gate</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Chain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.slice(0, 25).map((r) => (
                  <TableRow key={String(r.seq)}>
                    <TableCell className="text-[11px] text-muted">{String(r.seq)}</TableCell>
                    <TableCell className="text-[11px] text-muted">{new Date(String(r.createdAt)).toLocaleTimeString()}</TableCell>
                    <TableCell className="text-xs">{String(r.gate)}</TableCell>
                    <TableCell className="text-xs">{String(r.eventType)}</TableCell>
                    <TableCell className="font-mono text-[11px]">{String(r.model ?? "—")}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs">
                      {String((r.detail as AnyRecord)?.summary ?? "")}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted" title={String(r.chainHash)}>
                      {String(r.chainHash).slice(0, 8)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-elev px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}
