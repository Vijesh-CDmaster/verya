export function TieBreaks() {
  const options = [
    {
      label: "A",
      title: "Redis Pub/Sub",
      description: "Dedicated in-memory message broker with sub-millisecond distribution.",
      metrics: [
        { label: "Latency:", value: "1ms" },
        { label: "Cost:", value: "$200/mo" },
        { label: "Ops:", value: "Medium" },
      ],
    },
    {
      label: "B",
      title: "Postgres LISTEN/NOTIFY",
      description: "Utilizes existing database with zero auxiliary infrastructure.",
      metrics: [
        { label: "Latency:", value: "50ms" },
        { label: "Cost:", value: "$0" },
        { label: "Ops:", value: "Low" },
      ],
    },
  ];

  return (
    <section className="section-pad bg-surface">
      <div className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-2 lg:gap-16">
        <div>
          <div className="mb-4 text-xs uppercase tracking-[0.5px] text-muted">
            Transparent Arbitration
          </div>
          <h2 className="mb-6 text-3xl font-bold leading-tight sm:text-4xl">
            When it&apos;s a genuine toss-up, we tell you. We don&apos;t pretend to know.
          </h2>
          <p className="mb-4 text-sm leading-[1.7] text-muted">
            Verya triggers an explicit Tie-Break Gate when technical trade-offs have comparable
            validity. We present the exact latency, cost, and team operational profiles side-by-side,
            map the implications, and let the engineering lead choose.
          </p>
          <div className="mt-6 text-xs text-muted">
            <kbd className="rounded bg-bg px-2 py-1">T</kbd> for tie-break •{" "}
            <kbd className="rounded bg-bg px-2 py-1">→</kbd> accept recommendation
          </div>
        </div>

        <div className="rounded-xl border border-line bg-bg p-6">
          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {options.map((o) => (
              <div
                key={o.label}
                className="mb-2 rounded-lg border border-line bg-surface p-5 transition-all hover:-translate-y-1 hover:shadow-md"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-base font-semibold">{o.title}</div>
                  <input type="radio" name="tiebreak-demo" className="h-5 w-5 cursor-pointer" readOnly />
                </div>
                <p className="mb-4 text-[13px] leading-relaxed text-muted">{o.description}</p>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  {o.metrics.map((m) => (
                    <div key={m.label} className="flex justify-between text-xs">
                      <span className="text-muted">{m.label}</span>
                      <span className="font-semibold">{m.value}</span>
                    </div>
                  ))}
                </div>
                <button className="w-full rounded-md border border-line bg-bg py-3 text-sm font-semibold transition-colors hover:border-accent hover:bg-accent hover:text-accent-fg">
                  Select Option {o.label}
                </button>
              </div>
            ))}
          </div>
          <div className="text-center text-xs text-muted">
            Both options are valid. Architecture depends on your throughput needs and operational
            preferences.
          </div>
        </div>
      </div>
    </section>
  );
}
