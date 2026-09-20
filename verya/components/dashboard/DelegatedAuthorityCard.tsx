"use client";

// F23 Phase 4 — Delegated Authority dashboard card.
// Lists delegations with explicit capabilities (never vague labels like "Full Access"),
// creation with a pre-creation authority review, lifecycle controls, and an
// authorization preflight evaluator. All data flows through the existing services/api.ts
// delegation methods; lifecycle mutations are admin-gated server-side (the UI reflects
// the same states the Agent Registry card uses).

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { api } from "@/services/api";

type ResourceConstraint = {
  resource: string;
  tool?: string;
  action?: string;
  environment?: string;
  maxAmount?: number;
};

type Delegation = {
  delegationId: string;
  orgId: string;
  delegatorUserId: string;
  agentId: string;
  parentDelegationId?: string | null;
  purpose: string;
  allowedActions: string[];
  allowedTools: string[];
  allowedResources: ResourceConstraint[];
  dataScope: string;
  maximumRisk: string;
  constraints: Record<string, unknown>;
  canDelegate: boolean;
  issuedAt: string;
  expiresAt: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type Agent = {
  agentId: string;
  name: string;
  status: string;
};

const ACTION_OPTIONS = ["read", "analyze", "create", "update", "delete", "execute", "approve", "export"] as const;
const TOOL_OPTIONS = ["postgres", "github", "linear", "jira", "slack", "filesystem", "web-search"] as const;
const DATA_SCOPES = ["public", "task", "workflow", "project", "organization"] as const;
const RISK_LEVELS = ["low", "medium"] as const;

function statusVariant(status: string): "success" | "warn" | "danger" | "default" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "warn";
    case "REVOKED":
    case "EXPIRED":
      return "danger";
    default:
      return "default";
  }
}

const emptyForm = {
  agentId: "",
  purpose: "",
  allowedActions: [] as string[],
  allowedTools: [] as string[],
  resources: "",
  dataScope: "organization",
  maximumRisk: "low",
  canDelegate: false,
  expiresInHours: 72,
  parentDelegationId: "",
};

export function DelegatedAuthorityCard() {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalInput, setEvalInput] = useState({ agentId: "", action: "read", tool: "postgres", resource: "db:main", risk: "low" });
  const [evalResult, setEvalResult] = useState<string | null>(null);

  const activeAgents = useMemo(() => agents.filter((a) => a.status === "active"), [agents]);
  const agentNameOf = (agentId: string) => agents.find((a) => a.agentId === agentId)?.name ?? agentId;

  const buildPayload = () => ({
    agentId: form.agentId,
    purpose: form.purpose,
    allowedActions: form.allowedActions,
    allowedTools: form.allowedTools,
    allowedResources: form.resources
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((resource) => ({ resource })),
    dataScope: form.dataScope,
    maximumRisk: form.maximumRisk,
    canDelegate: form.canDelegate,
    expiresAt: new Date(Date.now() + form.expiresInHours * 3_600_000).toISOString(),
    ...(form.parentDelegationId.trim() ? { parentDelegationId: form.parentDelegationId.trim() } : {}),
  });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dRes, aRes] = await Promise.all([api.listDelegations(), fetch("/api/agents").then((r) => r.json())]);
      setDelegations((dRes.delegations as Delegation[]) ?? []);
      setAgents((aRes.agents as Agent[]) ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching delegations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const handleLifecycle = async (id: string, action: "suspend" | "revoke" | "reactivate") => {
    try {
      await (action === "suspend"
        ? api.suspendDelegation(id)
        : action === "revoke"
          ? api.revokeDelegation(id)
          : api.reactivateDelegation(id));
      setNotice(`Delegation ${action}d.`);
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} delegation`);
    }
  };

  const handleCreate = async () => {
    try {
      await api.createDelegation(buildPayload());
      setShowCreateModal(false);
      setShowReview(false);
      setForm(emptyForm);
      setNotice("Delegation created.");
      fetchAll();
    } catch (err) {
      const issues = err && typeof err === "object" && "issues" in err ? (err as { issues?: string[] }).issues : undefined;
      setError(issues?.length ? issues.join("; ") : err instanceof Error ? err.message : "Creation failed");
    }
  };

  const handleEvaluate = async () => {
    setEvalResult(null);
    try {
      const res = await api.evaluateAuthorization({
        agentId: evalInput.agentId,
        action: evalInput.action,
        tool: evalInput.tool,
        resource: evalInput.resource,
        risk: evalInput.risk,
      });
      const e = res.evaluation as { decision: string; reason: string; delegationId?: string };
      setEvalResult(`${e.decision} — ${e.reason}${e.delegationId ? ` (via ${e.delegationId})` : ""}`);
    } catch (err) {
      setEvalResult(err instanceof Error ? err.message : "Evaluation failed");
    }
  };

  const filtered = delegations.filter((d) => {
    if (agentFilter !== "all" && d.agentId !== agentFilter) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return d.purpose.toLowerCase().includes(s) || d.delegationId.toLowerCase().includes(s) || d.agentId.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Delegated Authority (F23 Phase 4)</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Capability grants with explicit actions, tools, and resources; fail-closed authorization evaluation.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          + Delegate Authority
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <Input
            placeholder="Search by purpose, agent, or delegation ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8 text-xs"
          />
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-foreground"
          >
            <option value="all">All Agents</option>
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REVOKED">Revoked</option>
            <option value="EXPIRED">Expired</option>
          </select>
          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setEvalOpen((v) => !v)}>
            {evalOpen ? "Hide evaluator" : "Evaluate authorization"}
          </Button>
        </div>

        {notice && (
          <Alert variant="success" className="mb-3">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="error" className="mb-3">
            <AlertTitle>Delegation error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {evalOpen && (
          <div className="mb-4 rounded-lg border border-line bg-elev p-3 text-xs space-y-2">
            <p className="font-medium">Authorization preflight (fail-closed evaluation)</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={evalInput.agentId}
                onChange={(e) => setEvalInput({ ...evalInput, agentId: e.target.value })}
                className="h-8 rounded-md border border-line bg-surface px-2 text-xs"
              >
                <option value="">Select agent…</option>
                {agents.map((a) => (
                  <option key={a.agentId} value={a.agentId}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Input
                placeholder="action (e.g. read)"
                value={evalInput.action}
                onChange={(e) => setEvalInput({ ...evalInput, action: e.target.value })}
                className="h-8 w-28 text-xs"
              />
              <Input
                placeholder="tool (e.g. postgres)"
                value={evalInput.tool}
                onChange={(e) => setEvalInput({ ...evalInput, tool: e.target.value })}
                className="h-8 w-32 text-xs"
              />
              <Input
                placeholder="resource (e.g. db:payments)"
                value={evalInput.resource}
                onChange={(e) => setEvalInput({ ...evalInput, resource: e.target.value })}
                className="h-8 w-40 text-xs"
              />
              <select
                value={evalInput.risk}
                onChange={(e) => setEvalInput({ ...evalInput, risk: e.target.value })}
                className="h-8 rounded-md border border-line bg-surface px-2 text-xs"
              >
                <option value="low">low risk</option>
                <option value="medium">medium risk</option>
                <option value="high">high risk</option>
                <option value="critical">critical risk</option>
              </select>
              <Button size="sm" className="h-8 text-[11px]" disabled={!evalInput.agentId} onClick={handleEvaluate}>
                Evaluate
              </Button>
            </div>
            {evalResult && <p className="font-mono text-[11px]">{evalResult}</p>}
          </div>
        )}

        {loading ? (
          <p className="py-4 text-center text-xs text-muted">Loading delegations...</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-muted">
            No delegations found. Delegate a specific capability to an agent to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Delegator</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk limit</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Tools</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead>Data scope</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Controls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.delegationId}>
                    <TableCell>
                      <div className="text-xs font-medium">{agentNameOf(d.agentId)}</div>
                      <div className="font-mono text-[10px] text-muted">{d.delegationId}</div>
                      {d.parentDelegationId && (
                        <div className="font-mono text-[10px] text-muted">↑ child of {d.parentDelegationId.slice(0, 12)}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{d.delegatorUserId}</TableCell>
                    <TableCell className="max-w-48 text-xs">{d.purpose}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{d.maximumRisk}</TableCell>
                    <TableCell className="text-[11px]">{d.allowedActions.join(", ") || "—"}</TableCell>
                    <TableCell className="text-[11px]">{d.allowedTools.join(", ") || "—"}</TableCell>
                    <TableCell className="text-[11px]">
                      {d.allowedResources.length ? d.allowedResources.map((rc) => rc.resource).join(", ") : "any"}
                    </TableCell>
                    <TableCell className="text-xs capitalize">{d.dataScope}</TableCell>
                    <TableCell className="text-[11px]">{new Date(d.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-[11px]">{new Date(d.expiresAt).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">v{d.version}</TableCell>
                    <TableCell className="text-right">
                      {d.status === "ACTIVE" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => handleLifecycle(d.delegationId, "suspend")}>
                          Suspend
                        </Button>
                      )}
                      {d.status === "SUSPENDED" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => handleLifecycle(d.delegationId, "reactivate")}>
                          Reactivate
                        </Button>
                      )}
                      {(d.status === "ACTIVE" || d.status === "SUSPENDED") && (
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-[11px]" onClick={() => handleLifecycle(d.delegationId, "revoke")}>
                          Revoke
                        </Button>
                      )}
                      {(d.status === "REVOKED" || d.status === "EXPIRED") && (
                        <span className="text-[10px] text-muted">terminal</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create / review modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-2xl">
            <h3 className="text-base font-semibold">Delegate Authority to an Agent</h3>

            {!showReview ? (
              <form
                className="space-y-3 text-xs"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.agentId) {
                    setError("Select an agent to receive the delegation.");
                    return;
                  }
                  if (form.allowedActions.length === 0 || form.allowedTools.length === 0) {
                    setError("Select at least one action and one tool — vague authority is not delegable.");
                    return;
                  }
                  setError(null);
                  setShowReview(true);
                }}
              >
                <div>
                  <label className="mb-1 block font-medium">Agent</label>
                  <select
                    required
                    value={form.agentId}
                    onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                    className="h-9 w-full rounded-md border border-line bg-surface px-2 text-xs"
                  >
                    <option value="">Select an active agent…</option>
                    {activeAgents.map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        {a.name} ({a.agentId.slice(0, 14)}…)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-medium">Purpose</label>
                  <Input
                    required
                    minLength={3}
                    placeholder="e.g. Read nightly payment totals for the reconciliation report"
                    value={form.purpose}
                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  />
                </div>

                <div>
                  <label className="mb-1 block font-medium">Actions (explicit — no wildcards)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ACTION_OPTIONS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            allowedActions: f.allowedActions.includes(a)
                              ? f.allowedActions.filter((x) => x !== a)
                              : [...f.allowedActions, a],
                          }))
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          form.allowedActions.includes(a) ? "border-fg bg-fg text-surface" : "border-line text-muted"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-medium">Tools (explicit — no wildcards)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TOOL_OPTIONS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            allowedTools: f.allowedTools.includes(t) ? f.allowedTools.filter((x) => x !== t) : [...f.allowedTools, t],
                          }))
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          form.allowedTools.includes(t) ? "border-fg bg-fg text-surface" : "border-line text-muted"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-medium">Resources (comma or newline separated, e.g. db:payments — empty = any resource)</label>
                  <Input
                    placeholder="db:payments, db:audit*"
                    value={form.resources}
                    onChange={(e) => setForm({ ...form, resources: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block font-medium">Data scope</label>
                    <select
                      value={form.dataScope}
                      onChange={(e) => setForm({ ...form, dataScope: e.target.value })}
                      className="h-9 w-full rounded-md border border-line bg-surface px-2 text-xs"
                    >
                      {DATA_SCOPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium">Risk limit</label>
                    <select
                      value={form.maximumRisk}
                      onChange={(e) => setForm({ ...form, maximumRisk: e.target.value })}
                      className="h-9 w-full rounded-md border border-line bg-surface px-2 text-xs"
                    >
                      {RISK_LEVELS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium">Expires in</label>
                    <select
                      value={form.expiresInHours}
                      onChange={(e) => setForm({ ...form, expiresInHours: Number(e.target.value) })}
                      className="h-9 w-full rounded-md border border-line bg-surface px-2 text-xs"
                    >
                      <option value={24}>24 hours</option>
                      <option value={72}>3 days</option>
                      <option value={168}>7 days</option>
                      <option value={720}>30 days</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-medium">Parent delegation (optional — child authority is bounded by it)</label>
                  <Input
                    placeholder="delg-… (leave empty for a root delegation)"
                    value={form.parentDelegationId}
                    onChange={(e) => setForm({ ...form, parentDelegationId: e.target.value })}
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.canDelegate}
                    onChange={(e) => setForm({ ...form, canDelegate: e.target.checked })}
                  />
                  Allow this delegation to be re-delegated (sub-delegation)
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Review authority
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="font-medium">Review the authority you are about to grant</p>
                <div className="space-y-1 rounded-md bg-elev p-3 font-mono text-[11px]">
                  <div>agent: {agentNameOf(form.agentId)}</div>
                  <div>purpose: {form.purpose}</div>
                  <div>actions: {form.allowedActions.join(", ")}</div>
                  <div>tools: {form.allowedTools.join(", ")}</div>
                  <div>resources: {form.resources.trim() || "any resource"}</div>
                  <div>data scope: {form.dataScope}</div>
                  <div>risk limit: {form.maximumRisk}</div>
                  <div>sub-delegation: {form.canDelegate ? "allowed" : "not allowed"}</div>
                  <div>parent: {form.parentDelegationId.trim() || "none (root delegation)"}</div>
                  <div>expires: {new Date(Date.now() + form.expiresInHours * 3_600_000).toLocaleString()}</div>
                </div>
                <p className="text-muted">
                  Wildcard actions/tools, sensitive or restricted data scopes, and high/critical risk limits are
                  reserved for administrators. The server enforces this and re-validates every parent bound.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowReview(false)}>
                    Back
                  </Button>
                  <Button size="sm" onClick={handleCreate}>
                    Grant authority
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
