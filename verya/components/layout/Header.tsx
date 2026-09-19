"use client";

import Link from "next/link";
import { useUiStore } from "@/stores/ui-store";
import { AuthControls, UserMenu } from "@/components/layout/AuthControls";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#trust", label: "Trust" },
  { href: "/#use-cases", label: "Use cases" },
  { href: "/#pricing", label: "Pricing" },
];

export function Header() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
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
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="h-[26px] w-[38px] rounded-full border border-line bg-surface text-[13px] leading-none transition-transform hover:-translate-y-0.5 hover:rotate-6"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <Link
            href="/workspace"
            className="hidden rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 sm:block"
          >
            Start analysis
          </Link>
          <AuthControls />
          <UserMenu />
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
      <a href="/workspace" className="font-semibold text-fg hover:text-accent">
        Start analysis
      </a>
    </nav>
  );
}
