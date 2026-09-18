import Link from "next/link";

export function Pricing() {
  return (
    <section className="section-pad">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl rounded-xl border border-line bg-bg p-10 text-center transition-all hover:-translate-y-1 hover:shadow-lg">
          <div className="mb-4 text-xs uppercase tracking-[0.5px] text-muted">Pricing</div>
          <h3 className="mb-4 text-3xl font-bold">Simple. Transparent. Based on usage.</h3>
          <p className="mb-6 text-sm leading-[1.7] text-muted">
            Free tier for builders and open-source projects. Scale as you grow. No surprise bills.
            Ever.
          </p>
          <Link
            href="/#get-started"
            className="inline-flex items-center gap-1 font-semibold transition-all hover:translate-x-1 hover:text-blue-600 dark:hover:text-blue-400"
          >
            View Pricing →
          </Link>
        </div>
      </div>
    </section>
  );
}
