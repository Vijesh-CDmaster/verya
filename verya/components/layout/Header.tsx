"use client";

import Link from "next/link";
import { useUiStore } from "@/stores/ui-store";
import { useBackendHealth } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#trust", label: "Trust" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#about", label: "About" },
];

export function Header() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const health = useBackendHealth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-header-bg backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent font-mono text-sm text-accent-fg">
            V
          </span>
          <span className="tracking-tight">Verya</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:opacity-70">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span
            title={
              health.data
                ? `Backend: ${health.data.auth} mode`
                : health.isError
                  ? "Backend unreachable"
                  : "Checking backend"
            }
            className={cn(
              "h-2 w-2 rounded-full",
              health.data ? "bg-success" : health.isError ? "bg-danger" : "bg-warn animate-pulse"
            )}
          />
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="h-[26px] w-[38px] rounded-full border border-line bg-surface text-[13px] leading-none transition-transform hover:-translate-y-0.5 hover:rotate-6"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <Link
            href="/#get-started"
            className="hidden rounded-md border border-line bg-bg px-4 py-1.5 text-sm transition-all hover:-translate-y-0.5 hover:bg-surface sm:block"
          >
            Sign In
          </Link>
          <Link
            href="/#get-started"
            className="rounded-md bg-accent px-4 py-1.5 text-sm text-accent-fg transition-all hover:-translate-y-0.5 hover:opacity-90"
          >
            Get Started
          </Link>
        </div>
      </div>
      <MobileNav />
    </header>
  );
}

function MobileNav() {
  return (
    <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-line px-4 py-2 text-[13px] text-muted md:hidden">
      {NAV_LINKS.map((l) => (
        <a key={l.href} href={l.href} className="hover:text-fg">
          {l.label}
        </a>
      ))}
      <a href="/dashboard" className="hover:text-fg">
        Dashboard
      </a>
    </nav>
  );
}
