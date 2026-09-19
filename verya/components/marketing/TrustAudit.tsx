"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useUiStore } from "@/stores/ui-store";
import { Badge } from "@/components/ui/badge";

type LedgerEntry = {
  seq: number;
  gate: string;
  eventType: string;
  createdAt: string;
  chainHash: string;
  detail?: { summary?: string };
};

const PILLARS = [
  {
    label: "01 / Append-Only",
    title: "Nothing gets edited, only added.",
    body: "All agent outputs and rejected architecture paths are preserved. You can replay the exact decision tree that led to any commit.",
  },
  {
    label: "02 / Zero-Egress",
    title: "Your data stays yours.",
    body: "No training on your specifications or source trees. Zero data retention policies applied across all underlying model vendor calls.",
  },
  {
    label: "03 / Continuous SOC2",
    title: "Built for the audit, not just the build.",
    body: "Export cryptographic proofs of multi-tenant safety and compliance reviews straight to your compliance auditor.",
  },
];

/** Illustrative rows shown only when the real ledger is empty or unreachable. */
const ILLUSTRATIVE_ROWS: LedgerEntry[] = [
  {
    seq: 1,
    gate: "flaws",
    eventType: "Flaw Detection",
    createdAt: "2024-01-15T14:23:47Z",
    chainHash: "audit_7f2c8",
    detail: { summary: "Auth token revocation policy gap identified in multi-tenant flow" },
  },
  {
    seq: 2,
    gate: "stack",
    eventType: "Stack Selection",
    createdAt: "2024-01-15T14:24:12Z",
    chainHash: "audit_8a1d5",
    detail: { summary: "Redis vs Postgres for event distribution: user selected Option A" },
  },
  {
    seq: 3,
    gate: "models",
    eventType: "Model Assignment",
    createdAt: "2024-01-15T14:25:33Z",
    chainHash: "audit_9b3e6",
    detail: { summary: "Claude 3.7 Sonnet assigned for architecture verification" },
  },
  {
    seq: 4,
    gate: "execution",
    eventType: "Verification",
    createdAt: "2024-01-15T14:26:01Z",
    chainHash: "audit_2c4f7",
    detail: { summary: "Code generation passed all architectural constraint checks" },
  },
];

function statusVariant(eventType: string): "success" | "warn" | "danger" | "muted" {
  if (/pass|verified|success/i.test(eventType)) return "success";
  if (/tiebreak|tie|flag|warn|escalat/i.test(eventType)) return "warn";
  if (/fail|critical|broken/i.test(eventType)) return "danger";
  return "muted";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function TrustAudit() {
  const sessionId = useUiStore((s) => s.sessionId);
  const { data } = useQuery({
    queryKey: ["ledger-preview", sessionId],
    queryFn: () => api.ledgerRecords(sessionId ?? undefined),
    enabled: true,
    staleTime: 15_000,
    retry: false,
  });

  const records = (data?.records ?? []) as LedgerEntry[];
  const live = records.length > 0;
  const rows = live ? records.slice(0, 5) : ILLUSTRATIVE_ROWS;

  return (
    <section className="section-pad">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 text-center text-xs uppercase tracking-[0.5px] text-muted">
          Security & Compliance
        </div>
        <h2 className="mb-6 text-center text-3xl font-bold leading-tight sm:text-4xl">
          Every decision, on the record.
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted">
          Tamper-evident logs of every prompt evaluation, model assignment, security scan, and human
          tie-break override. Built for technical due diligence and zero-trust engineering standards.
        </p>

        <div className="mb-12 grid gap-6 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.label}
              className="rounded-lg border border-line bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.5px] text-muted">
                {p.label}
              </div>
              <h3 className="mb-3 text-lg font-semibold">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>

        <table className="w-full overflow-hidden rounded-lg border border-line bg-bg">
          <thead className="border-b border-line bg-surface">
            <tr>
              {["Timestamp", "Event Type", "Status", "Description", "Audit ID"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-4 text-left text-[13px] font-semibold uppercase tracking-[0.5px]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.seq)} className="border-b border-line last:border-b-0">
                <td className="px-4 py-4 font-mono text-[13px]">{fmtTime(r.createdAt)}</td>
                <td className="px-4 py-4 text-[13px]">{r.eventType}</td>
                <td className="px-4 py-4">
                  <Badge variant={statusVariant(r.eventType)}>{r.eventType.split("_")[0]}</Badge>
                </td>
                <td className="px-4 py-4 text-[13px]">{r.detail?.summary ?? ""}</td>
                <td className="px-4 py-4 font-mono text-xs text-muted">
                  {r.chainHash.slice(0, 8)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!live && (
          <p className="mt-3 text-center text-xs text-muted">
            Illustrative rows — the append-only ledger fills this table with your org&apos;s real
            audit trail as soon as the database is connected and pipelines run.
          </p>
        )}
      </div>
    </section>
  );
}
