import Link from "next/link";

const CODE_LINES = [
  { comment: "# Real-time multi-tenant sync engine" },
  { keyword: "const", rest: " architecture = {" },
  { indent: true, key: "tenantIsolation", value: "shared-process-per-tenant", last: false },
  { indent: true, key: "persistence", value: "sqlite-wal-mode", last: false },
  { indent: true, key: "transport", value: "ws-cluster", last: false },
  { indent: true, key: "authCycle", value: "stateless-bearer-jwt", last: false },
  { indent: true, key: "reconciliation", value: "optimistic-client-rollback", last: true },
  { rest: "};" },
];

const ISSUES = [
  {
    title: "Auth Token Revocation",
    severity: "Critical",
    description:
      "Persistent WS channels with long-lived tokens won't revoke during permission demotions.",
    actions: ["Review Fix", "Implement Architecture"],
  },
  {
    title: "State Consistency",
    severity: "High",
    description: "Client speculative state lacks causal vector clocks.",
    actions: ["Review Fix", "Suggest Alternative"],
  },
];

export function Hero() {
  return (
    <section className="section-pad relative overflow-hidden">
      <div className="mx-auto max-w-6xl text-center">
        <span className="inline-block rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] text-muted">
          ✨ AI-Governed Code Generation
        </span>
        <h1 className="mx-auto mb-6 mt-6 max-w-4xl text-4xl font-bold leading-[1.2] sm:text-5xl">
          Deterministic decisions. Verified code. Audit-ready proof.
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-base">
          Before any AI model writes code or produces output, Verya reviews your architecture for
          flaws, then decides—in a fixed order—the technology stack, the algorithm per task, and the
          AI model that executes it.
        </p>

        <div className="mb-16 flex flex-wrap justify-center gap-4">
          <Link
            href="/workspace"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-accent-fg transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            Start Building →
          </Link>
          <Link
            href="/#how-it-works"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg px-6 py-3 text-base font-semibold text-fg transition-all hover:-translate-y-0.5 hover:bg-surface"
          >
            See how it works ↓
          </Link>
        </div>

        {/* IDE mockup */}
        <div className="mx-auto mb-4 max-w-5xl overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
          <div className="flex items-center gap-2 border-b border-line bg-bg px-4 py-3">
            <div className="flex gap-2">
              <span className="h-3 w-3 rounded-full bg-danger" />
              <span className="h-3 w-3 rounded-full bg-warn" />
              <span className="h-3 w-3 rounded-full bg-success" />
            </div>
            <span className="ml-4 flex-1 text-left font-mono text-xs text-muted">
              verya.dev/workbench
            </span>
            <span className="rounded-md border border-line bg-bg px-4 py-1.5 text-sm">Running</span>
          </div>
          <div className="grid md:grid-cols-2">
            <div className="border-b border-line p-6 text-left md:border-b-0 md:border-r">
              <div className="mb-4 text-sm font-semibold uppercase tracking-[0.5px] text-muted">
                Input
              </div>
              {CODE_LINES.map((l, i) => (
                <div key={i} className="mb-2 font-mono text-[13px] leading-relaxed">
                  {"comment" in l && l.comment ? (
                    <span className="text-muted">{l.comment}</span>
                  ) : "keyword" in l && l.keyword ? (
                    <>
                      <span className="text-blue-600 dark:text-blue-400">{l.keyword}</span>
                      {l.rest}
                    </>
                  ) : (
                    <>
                      {l.indent ? "\u00a0\u00a0" : ""}
                      {l.key}: <span className="text-success">&apos;{l.value}&apos;</span>
                      {l.last ? "" : ","}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="p-6 text-left">
              <div className="mb-4 text-sm font-semibold uppercase tracking-[0.5px] text-muted">
                Flagged Issues
              </div>
              {ISSUES.map((issue) => (
                <div
                  key={issue.title}
                  className="mb-4 rounded-lg border border-line bg-surface p-4 transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-danger" />
                      {issue.title}
                    </div>
                    <span className="text-xs text-muted">{issue.severity}</span>
                  </div>
                  <p className="mb-3 text-[13px] leading-relaxed text-muted">{issue.description}</p>
                  <div className="flex gap-2">
                    {issue.actions.map((a) => (
                      <button
                        key={a}
                        type="button"
                        className="rounded border border-line bg-bg px-3 py-1 text-xs transition-colors hover:border-accent hover:bg-accent hover:text-accent-fg"
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
