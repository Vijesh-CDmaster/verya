import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { IntakeIsland } from "@/components/intake/IntakeIsland";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <section className="fade-up mx-auto max-w-3xl px-6 pb-10 pt-16 text-center sm:pt-24">
          <span className="inline-block rounded-full border border-line bg-surface px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            For teams shipping with AI
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">
            Before your AI writes a single line, Verya checks if the plan is even good.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            Paste the whole thing — messy, incomplete, whatever you have. Verya checks the plan, and
            you decide every close call.
          </p>
        </section>

        <section id="start" className="mx-auto max-w-3xl px-6 pb-16">
          <IntakeIsland />
        </section>

        <section id="how" className="mx-auto max-w-3xl px-6 pb-20">
          <h2 className="text-xl font-semibold">How it works</h2>
          <ol className="mt-4 space-y-3 text-[13px] text-muted">
            <li>
              <span className="font-semibold text-fg">1. Suitability</span> — the whole plan is read as
              one thing; if it doesn&apos;t fit, you get a better workflow and choose.
            </li>
            <li>
              <span className="font-semibold text-fg">2. Flaws</span> — missing security, broken logic,
              scale cliffs and cost traps, each with a fix you accept or reject.
            </li>
            <li>
              <span className="font-semibold text-fg">3. Stack & tasks</span> — your stack is validated
              (or one is picked), then the work is broken into routable tasks.
            </li>
            <li>
              <span className="font-semibold text-fg">4. Approach & models</span> — an algorithm and a
              model from a four-provider pool per task; ties go to you.
            </li>
            <li>
              <span className="font-semibold text-fg">5. Execution & review</span> — outputs are
              verified before you see them; your accept/reject feeds the trust scores.
            </li>
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  );
}
