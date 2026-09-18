"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "How does Verya detect flaws before writing code?",
    a: "Verya constructs an abstract architectural state graph from your requirements prompt. It evaluates this graph against formal verification heuristics for distributed concurrency, data consistency, authentication lifecycles, and known CVE/OWASP vectors using cross-model consensus before invoking any code generator.",
  },
  {
    q: "Can I bring my own API keys or custom enterprise models?",
    a: "Yes. You can supply your own Anthropic, OpenAI, or self-hosted vLLM/Ollama endpoints. Verya acts as the orchestrator and deterministic governance gatekeeper, routing only the required task contexts to your designated infrastructure.",
  },
  {
    q: "What happens if I disagree with Verya's suggested stack or model?",
    a: "You always have ultimate architectural veto power. When Verya flags a stack incompatibility or triggers a Tie-Break, you can override with a single keypress. The audit ledger simply notes the human override with your timestamp and rationale.",
  },
  {
    q: "Does Verya store or train on my project specifications?",
    a: "Never. We enforce zero-data-retention agreements with all upstream model providers. Your specifications, schemas, and source code are processed strictly in ephemerally mounted memory buffers and destroyed immediately upon task completion.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="section-pad bg-surface">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 text-center text-xs uppercase tracking-[0.5px] text-muted">
          Questions
        </div>
        <h2 className="mb-12 text-center text-3xl font-bold leading-tight sm:text-4xl">
          Frequently Asked Questions
        </h2>

        <div>
          {FAQS.map((f, i) => (
            <div key={f.q} className="mb-8 border-b border-line pb-8 last:mb-0 last:border-b-0 last:pb-0">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 text-left text-lg font-semibold"
              >
                {f.q}
                <span className="text-muted">{open === i ? "−" : "+"}</span>
              </button>
              {open === i && <p className="mt-4 text-sm leading-[1.7] text-muted">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
