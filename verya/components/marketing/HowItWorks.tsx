const STEPS = [
  {
    title: "Tell it what you're building",
    body: "Drop in raw markdown, Slack requirement threads, or terminal prompts with custom operational flags.",
    visual: "input",
  },
  {
    title: "It finds what you missed",
    body: "Multi-model semantic analysis checks edge cases, unhandled concurrency collisions, and security blind spots.",
    visual: "warning",
  },
  {
    title: "It picks your stack, or checks yours",
    body: "Objective trade-off matrix evaluation against your exact throughput, latency, and operational team profile.",
    visual: "stack",
  },
  {
    title: "It breaks the work down",
    body: "Generates a directed acyclic graph (DAG) of verified tasks so models don't attempt upstream dependencies prematurely.",
    visual: "dag",
  },
  {
    title: "It matches the right model to each task",
    body: "Zero model loyalty. Complex logic goes to high-reasoning models; high-token schema translations go to fast, low-cost engines.",
    visual: "models",
  },
] as const;

function StepVisual({ kind }: { kind: (typeof STEPS)[number]["visual"] }) {
  if (kind === "input") {
    return (
      <div className="font-mono text-[13px] leading-relaxed">
        <div className="mb-2 text-sm font-semibold uppercase tracking-[0.5px] text-muted">
          Your Input
        </div>
        <div>
          <span className="text-muted"># Multi-tenant sync engine</span>
        </div>
        <div>
          <span className="text-blue-600 dark:text-blue-400">throughput:</span> 4k-writes/sec
        </div>
      </div>
    );
  }
  if (kind === "warning") {
    return (
      <div className="text-xs leading-relaxed text-muted">
        ⚠️ No TTL/eviction policy specified for sliding window deduplication keys under spiky
        ingestion.
      </div>
    );
  }
  if (kind === "stack") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { name: "Go + Valkey + AWS SQS", desc: "Low-latency option" },
          { name: "Node.js + BullMQ + S3", desc: "Developer experience focus" },
        ].map((s) => (
          <div key={s.name} className="rounded-lg bg-surface p-5">
            <div className="mb-2 text-base font-semibold">{s.name}</div>
            <div className="mb-3 text-[13px] leading-relaxed text-muted">{s.desc}</div>
            <button className="w-full rounded-md border border-line bg-bg px-4 py-2 text-sm transition-all hover:-translate-y-0.5 hover:bg-hover">
              Select
            </button>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "dag") {
    return (
      <div className="text-xs leading-relaxed text-muted">
        Task graph generated with 3 parallel branches and dependency ordering validated.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      {[
        { name: "Claude 3.7", status: "✓ Assigned" },
        { name: "GPT-4o", status: "Timeout" },
        { name: "DeepSeek V3", status: "Budget match" },
      ].map((m) => (
        <div key={m.name} className="rounded bg-surface p-3 text-center">
          <div className="font-semibold">{m.name}</div>
          <div className="mt-1 text-muted">{m.status}</div>
        </div>
      ))}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="section-pad">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 text-center text-xs uppercase tracking-[0.5px] text-muted">Process</div>
        <h2 className="mb-12 text-center text-3xl font-bold leading-tight sm:text-4xl">
          Five gates from idea to verified code.
        </h2>

        <div className="relative">
          <div className="absolute left-[23px] top-3 hidden h-[calc(100%-24px)] w-0.5 bg-line sm:block" />
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="relative mb-16 grid gap-6 pl-12 last:mb-0 sm:grid-cols-[280px_1fr] sm:pl-12"
            >
              <span className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-bg text-xs font-semibold">
                {i + 1}
              </span>
              <div>
                <h3 className="mb-3 text-xl font-semibold leading-snug">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
              <div className="min-h-[144px] rounded-lg border border-line bg-bg p-6 transition-all hover:-translate-y-1 hover:shadow-md">
                <StepVisual kind={step.visual} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-lg bg-surface p-6 text-center">
          <p className="text-sm leading-relaxed text-muted">
            Every decision is cryptographically logged and auditable. The entire decision tree is
            replayed and verified before any line of code executes.
          </p>
        </div>
      </div>
    </section>
  );
}
