"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Suggestion = { id: number; version: number; rule: string; rationale: string; status: string; evidence?: Record<string, unknown> };

export function PolicySuggestionsCard({ suggestions }: { suggestions: Suggestion[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);
  const decide = async (id: number, decision: "approved" | "rejected") => {
    setBusy(id);
    try {
      await api.decidePolicySuggestion(id, decision);
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Policy suggestions</CardTitle>
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => void api.detectPolicySuggestions().then(() => qc.invalidateQueries({ queryKey: ["dashboard"] }))}>
          Scan patterns
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.length === 0 ? <p className="text-sm text-muted">No recurring failure pattern has crossed the suggestion threshold.</p> : suggestions.slice(0, 8).map((suggestion) => (
          <div key={suggestion.id} className="rounded-lg border border-line bg-elev p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={suggestion.status === "approved" ? "success" : suggestion.status === "rejected" ? "danger" : "warn"}>{suggestion.status}</Badge><span className="text-muted">v{suggestion.version}</span></div>
            <p className="mt-2 font-medium">{suggestion.rule}</p>
            <p className="mt-1 text-muted">{suggestion.rationale}</p>
            {suggestion.status === "pending" && <div className="mt-3 flex gap-2"><button type="button" disabled={busy === suggestion.id} onClick={() => void decide(suggestion.id, "approved")} className="rounded bg-emerald-500/15 px-3 py-1 text-emerald-400">Approve</button><button type="button" disabled={busy === suggestion.id} onClick={() => void decide(suggestion.id, "rejected")} className="rounded bg-red-500/15 px-3 py-1 text-red-400">Reject</button></div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}