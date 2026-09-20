import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Help center — Verya",
  description: "Learn how to submit an analysis, resolve decisions, and review Verya output.",
};

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@verya.dev";

const SECTIONS = [
  {
    title: "Submit a project",
    items: [
      ["What should I write?", "Describe the outcome, who will use it, important constraints, expected scale, and any technology you already chose. Plain language is enough."],
      ["Can I upload a plan?", "Yes. The workspace accepts text files, PDF, DOC, DOCX, and RTF files up to 10 MB. Scanned documents without selectable text are rejected with a clear message."],
      ["What happens after I submit?", "Verya extracts a workflow, checks whether the approach is suitable, then moves through flaws, stack, tasks, approaches, models, execution, and review."],
    ],
  },
  {
    title: "Make decisions",
    items: [
      ["Why is the pipeline paused?", "A pause means the current gate needs your decision or an AI stage is still processing. The workspace shows the active gate and progress state."],
      ["What is a tie-break?", "Verya compares confidence and fit. When the leading option is not clearly ahead, it does not guess: it shows the qualifying options and waits for your choice."],
      ["Can I change the plan?", "Yes. Tasks can be edited, split, merged, or deleted before confirmation. Stack, approach, and model choices can be selected where the gate asks for them."],
    ],
  },
  {
    title: "Review results",
    items: [
      ["How are outputs checked?", "Outputs receive deterministic checks. Higher-risk tasks also receive an independent model review, external package checks, and adversarial auditing when applicable."],
      ["What does the ledger contain?", "It records decisions, execution results, verification, human feedback, and integrity hashes. The dashboard can verify and export the audit trail."],
      ["How does feedback help?", "Accept, edit, reject, rate, and note actions update organization-scoped memory and model reputation for future routing."],
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-14">
        <Link href="/workspace" className="text-sm text-muted hover:text-fg">← Back to workspace</Link>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.12em] text-accent">Help center</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Use Verya with confidence.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          A short guide to the two unfamiliar parts of Verya: submitting a workflow and making tie-break decisions.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 divide-y divide-line border-y border-line">
                {section.items.map(([question, answer]) => (
                  <details key={question} className="group py-4">
                    <summary className="cursor-pointer list-none pr-6 text-sm font-medium group-open:text-accent">{question}</summary>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="text-lg font-semibold">Need help with a workspace?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Include the session id, the gate where you are blocked, and the error message. Do not include API keys or confidential project data.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90">
            Contact support
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
