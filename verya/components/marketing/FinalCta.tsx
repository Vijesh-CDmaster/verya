import Link from "next/link";

export function FinalCta() {
  return (
    <section className="section-pad bg-cta-bg text-cta-fg">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-4 text-xs uppercase tracking-[0.5px] text-cta-fg/70">Ready</div>
        <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
          Stop guessing. Start building with confidence.
        </h2>
        <p className="mx-auto mb-8 mt-4 max-w-xl text-base text-cta-fg/80">
          Verya eliminates the architectural roulette. Every decision is deterministic, every flaw
          is caught, every line of code is verified before it runs.
        </p>
        <Link
          href="/workspace"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-accent-fg transition-all hover:-translate-y-0.5 hover:opacity-90"
        >
          Start Your Free Tier →
        </Link>
      </div>
    </section>
  );
}
