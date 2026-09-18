import Link from "next/link";

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  {
    title: "Product",
    links: [
      { label: "Workbench", href: "/#product" },
      { label: "Audit Ledger", href: "/#audit" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "Engineering",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Tie-breaks", href: "/#tie-breaks" },
      { label: "FAQ", href: "/#faq" },
      { label: "Get started", href: "/#get-started" },
    ],
  },
  {
    title: "Governance",
    links: [
      { label: "Trust & audit", href: "/#trust" },
      { label: "Use cases", href: "/#use-cases" },
      { label: "Sign up", href: "/#get-started" },
      { label: "Final word", href: "/#final-cta" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line px-6 py-10 text-muted">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent font-mono text-sm text-accent-fg">
                V
              </span>
              <strong className="text-fg">Verya</strong>
            </div>
            <p className="text-xs leading-relaxed">
              AI governance platform for deterministic code generation and architectural verification.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.5px] text-fg">{col.title}</h4>
              {col.links.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="mb-3 block text-[13px] transition-colors hover:text-fg"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-4 border-t border-line pt-6 text-xs sm:flex-row sm:justify-between">
          <div>
            © {new Date().getFullYear()} Verya. All rights reserved. •{" "}
            <Link href="/#faq" className="hover:text-fg">
              Privacy
            </Link>{" "}
            •{" "}
            <Link href="/#faq" className="hover:text-fg">
              Terms
            </Link>
          </div>
          <div className="flex gap-6">
            <a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-fg">
              Twitter
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-fg">
              GitHub
            </a>
            <a href="https://discord.com" target="_blank" rel="noreferrer" className="hover:text-fg">
              Discord
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
