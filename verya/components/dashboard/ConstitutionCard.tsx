"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ConstitutionCard({ constitution }: { constitution: { generatedAt?: string; text?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Living constitution</CardTitle>
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => setOpen((value) => !value)}>{open ? "Hide" : "Read"}</button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted">Compiled from approved policies, live thresholds, verification requirements, and organization reputation.</p>
        {open && <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded border border-line bg-elev p-3 font-mono text-xs leading-relaxed">{constitution.text || "No constitution data yet."}</pre>}
        {constitution.generatedAt && <p className="mt-3 text-[11px] text-muted">Generated {new Date(constitution.generatedAt).toLocaleString()}</p>}
      </CardContent>
    </Card>
  );
}