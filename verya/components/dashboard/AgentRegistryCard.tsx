"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type Agent = {
  agentId: string;
  orgId: string;
  owner: string;
  name: string;
  description: string;
  purpose: string;
  agentType: string;
  autonomyLevel: string;
  allowedModels: string[];
  allowedTools: string[];
  allowedActions: string[];
  dataScope: string;
  riskLevel: string;
  status: string;
  version: number;
  parentAgentId?: string | null;
  delegationChain: string[];
  createdAt: string;
  updatedAt: string;
};

export function AgentRegistryCard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selection for Detail Modal
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    purpose: "",
    agentType: "custom",
    autonomyLevel: "LEVEL_1",
    dataScope: "organization",
    riskLevel: "low",
    allowedModels: "google/gemini-2.5-flash, openai/gpt-oss-20b",
    allowedTools: "postgres, github",
    allowedActions: "read, analyze",
    parentAgentId: "",
  });

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to load agent registry");
      const json = await res.json();
      setAgents(json.agents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching agents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        purpose: formData.purpose,
        agentType: formData.agentType,
        autonomyLevel: formData.autonomyLevel,
        dataScope: formData.dataScope,
        riskLevel: formData.riskLevel,
        allowedModels: formData.allowedModels.split(",").map((s) => s.trim()).filter(Boolean),
        allowedTools: formData.allowedTools.split(",").map((s) => s.trim()).filter(Boolean),
        allowedActions: formData.allowedActions.split(",").map((s) => s.trim()).filter(Boolean),
        parentAgentId: formData.parentAgentId.trim() || undefined,
      };

      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to create agent");
      }

      setShowCreateModal(false);
      setFormData({
        name: "",
        description: "",
        purpose: "",
        agentType: "custom",
        autonomyLevel: "LEVEL_1",
        dataScope: "organization",
        riskLevel: "low",
        allowedModels: "google/gemini-2.5-flash, openai/gpt-oss-20b",
        allowedTools: "postgres, github",
        allowedActions: "read, analyze",
        parentAgentId: "",
      });
      fetchAgents();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Creation failed");
    }
  };

  const handleStatusChange = async (agentId: string, action: "suspend" | "revoke" | "archive" | "reactivate") => {
    try {
      const res = await fetch(`/api/agents/${agentId}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed to ${action} agent`);
      fetchAgents();
      if (selectedAgent?.agentId === agentId) {
        const updated = await res.json();
        setSelectedAgent(updated.agent);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Status update failed");
    }
  };

  const filteredAgents = agents.filter((a) => {
    if (typeFilter !== "all" && a.agentType !== typeFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(s) ||
        a.purpose.toLowerCase().includes(s) ||
        a.agentId.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const getStatusVariant = (status: string): "success" | "warn" | "danger" | "default" => {
    switch (status) {
      case "active":
        return "success";
      case "suspended":
        return "warn";
      case "revoked":
        return "danger";
      case "draft":
        return "default";
      default:
        return "default";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Agent Registry (F23)</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Persistent agent identities, declared capabilities, risk metadata, and lifecycle controls.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          + Register Agent
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters bar */}
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <Input
            placeholder="Search agents by name, ID, or purpose..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8 text-xs"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-foreground"
          >
            <option value="all">All Types</option>
            <option value="planner">Planner</option>
            <option value="router">Router</option>
            <option value="analyzer">Analyzer</option>
            <option value="executor">Executor</option>
            <option value="verifier">Verifier</option>
            <option value="reviewer">Reviewer</option>
            <option value="auditor">Auditor</option>
            <option value="researcher">Researcher</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="suspended">Suspended</option>
            <option value="revoked">Revoked</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {error && (
          <Alert variant="error" className="mb-3">
            <AlertTitle>Error loading agents</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <p className="py-4 text-center text-xs text-muted">Loading Agent Registry...</p>
        ) : filteredAgents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-muted">
            No agents found matching criteria. Register your first organization agent above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Autonomy</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Models</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.agentId}>
                    <TableCell>
                      <div className="font-medium text-xs">{agent.name}</div>
                      <div className="font-mono text-[10px] text-muted">{agent.agentId}</div>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{agent.agentType}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(agent.status)}>{agent.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{agent.autonomyLevel}</TableCell>
                    <TableCell className="text-xs capitalize">{agent.riskLevel}</TableCell>
                    <TableCell className="font-mono text-xs">v{agent.version}</TableCell>
                    <TableCell className="text-xs text-muted">
                      {agent.allowedModels.length > 0
                        ? `${agent.allowedModels.length} allowed`
                        : "Any"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedAgent(agent)}
                        className="mr-1 h-7 text-[11px] px-2"
                      >
                        Inspect
                      </Button>
                      {agent.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStatusChange(agent.agentId, "suspend")}
                          className="h-7 text-[11px] px-2"
                        >
                          Suspend
                        </Button>
                      )}
                      {agent.status === "suspended" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStatusChange(agent.agentId, "reactivate")}
                          className="h-7 text-[11px] px-2"
                        >
                          Reactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Register Agent Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold">Register New Organization Agent</h3>
            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-medium">Agent Name</label>
                <Input
                  required
                  placeholder="e.g. Architecture Auditor Agent"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">Purpose</label>
                <Input
                  required
                  placeholder="e.g. Reviews structural patterns and security rules"
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-medium">Agent Type</label>
                  <select
                    value={formData.agentType}
                    onChange={(e) => setFormData({ ...formData, agentType: e.target.value })}
                    className="w-full h-9 rounded-md border border-line bg-surface px-2 text-xs"
                  >
                    <option value="planner">Planner</option>
                    <option value="router">Router</option>
                    <option value="analyzer">Analyzer</option>
                    <option value="executor">Executor</option>
                    <option value="verifier">Verifier</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="auditor">Auditor</option>
                    <option value="researcher">Researcher</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">Autonomy Level</label>
                  <select
                    value={formData.autonomyLevel}
                    onChange={(e) => setFormData({ ...formData, autonomyLevel: e.target.value })}
                    className="w-full h-9 rounded-md border border-line bg-surface px-2 text-xs"
                  >
                    <option value="LEVEL_0">LEVEL_0 (Human-only)</option>
                    <option value="LEVEL_1">LEVEL_1 (AI Suggests)</option>
                    <option value="LEVEL_2">LEVEL_2 (Low-risk Execution)</option>
                    <option value="LEVEL_3">LEVEL_3 (Approved Execution)</option>
                    <option value="LEVEL_4">LEVEL_4 (Full Governance)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-medium">Risk Classification</label>
                  <select
                    value={formData.riskLevel}
                    onChange={(e) => setFormData({ ...formData, riskLevel: e.target.value })}
                    className="w-full h-9 rounded-md border border-line bg-surface px-2 text-xs"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">Data Scope</label>
                  <select
                    value={formData.dataScope}
                    onChange={(e) => setFormData({ ...formData, dataScope: e.target.value })}
                    className="w-full h-9 rounded-md border border-line bg-surface px-2 text-xs"
                  >
                    <option value="organization">Organization</option>
                    <option value="project">Project</option>
                    <option value="workflow">Workflow</option>
                    <option value="task">Task</option>
                    <option value="sensitive">Sensitive</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block mb-1 font-medium">Allowed Models (comma separated)</label>
                <Input
                  value={formData.allowedModels}
                  onChange={(e) => setFormData({ ...formData, allowedModels: e.target.value })}
                  placeholder="google/gemini-2.5-flash, openai/gpt-oss-20b"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium">Allowed Tools (declared metadata)</label>
                <Input
                  value={formData.allowedTools}
                  onChange={(e) => setFormData({ ...formData, allowedTools: e.target.value })}
                  placeholder="postgres, github, linear"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save Agent
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Agent Detail Drawer / Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold">{selectedAgent.name}</h3>
                <p className="font-mono text-[11px] text-muted">{selectedAgent.agentId}</p>
              </div>
              <Badge variant={getStatusVariant(selectedAgent.status)}>
                {selectedAgent.status}
              </Badge>
            </div>

            {/* Identity */}
            <div className="space-y-1">
              <h4 className="font-semibold text-muted text-[11px] uppercase tracking-wider">Identity</h4>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-elev p-3">
                <div><span className="text-muted">Type:</span> {selectedAgent.agentType}</div>
                <div><span className="text-muted">Version:</span> v{selectedAgent.version}</div>
                <div><span className="text-muted">Owner:</span> {selectedAgent.owner}</div>
                <div><span className="text-muted">Created:</span> {new Date(selectedAgent.createdAt).toLocaleDateString()}</div>
                <div className="col-span-2"><span className="text-muted">Purpose:</span> {selectedAgent.purpose}</div>
              </div>
            </div>

            {/* Governance */}
            <div className="space-y-1">
              <h4 className="font-semibold text-muted text-[11px] uppercase tracking-wider">Governance</h4>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-elev p-3">
                <div><span className="text-muted">Autonomy:</span> {selectedAgent.autonomyLevel}</div>
                <div><span className="text-muted">Risk Level:</span> {selectedAgent.riskLevel}</div>
                <div><span className="text-muted">Data Scope:</span> {selectedAgent.dataScope}</div>
                <div><span className="text-muted">Models:</span> {selectedAgent.allowedModels.join(", ") || "Any"}</div>
                <div className="col-span-2"><span className="text-muted">Declared Tools:</span> {selectedAgent.allowedTools.join(", ") || "None"}</div>
                <div className="col-span-2"><span className="text-muted">Declared Actions:</span> {selectedAgent.allowedActions.join(", ") || "None"}</div>
              </div>
            </div>

            {/* Hierarchy & Relationships */}
            <div className="space-y-1">
              <h4 className="font-semibold text-muted text-[11px] uppercase tracking-wider">Relationships</h4>
              <div className="rounded-md bg-elev p-3">
                <div><span className="text-muted">Parent Agent:</span> {selectedAgent.parentAgentId || "None (Root Agent)"}</div>
                <div>
                  <span className="text-muted">Delegation Chain:</span>{" "}
                  {selectedAgent.delegationChain.length > 0
                    ? selectedAgent.delegationChain.join(" -> ") + ` -> ${selectedAgent.agentId}`
                    : `${selectedAgent.agentId} (Root)`}
                </div>
              </div>
            </div>

            {/* Trust History */}
            <div className="space-y-1">
              <h4 className="font-semibold text-muted text-[11px] uppercase tracking-wider">Trust Metrics</h4>
              <div className="rounded-md bg-elev p-3 text-muted">
                No agent-specific trust history yet. (Trust accumulation begins as actions execute).
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex gap-1">
                {selectedAgent.status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedAgent.agentId, "suspend")}>
                    Suspend Agent
                  </Button>
                )}
                {selectedAgent.status !== "revoked" && (
                  <Button size="sm" variant="destructive" onClick={() => handleStatusChange(selectedAgent.agentId, "revoke")}>
                    Revoke Agent
                  </Button>
                )}
              </div>
              <Button size="sm" onClick={() => setSelectedAgent(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
