"use client";

import Link from "next/link";
import { useIntakeStore } from "@/stores/intake-store";
import { useBackendHealth } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export function Header() {
  const theme = useIntakeStore((s) => s.theme);
  const toggleTheme = useIntakeStore((s) => s.toggleTheme);
  const health = useBackendHealth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent font-mono text-sm text-accent-fg">
            V
          </span>
          <span className="tracking-tight">Verya</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#how"
            className="hidden rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-hover hover:text-fg sm:block"
          >
            How it works
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-hover hover:text-fg"
          >
            Dashboard
          </Link>
          <span
            title={
              health.data
                ? `Backend: ${health.data.auth} mode`
                : health.isError
                  ? "Backend unreachable"
                  : "Checking backend"
            }
            className={cn(
              "ml-1 h-2 w-2 rounded-full",
              health.data ? "bg-emerald-400" : health.isError ? "bg-red-400" : "bg-amber-400 animate-pulse"
            )}
          />
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="rounded-md border border-line px-2.5 py-1.5 text-sm transition-colors hover:bg-hover"
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </nav>
      </div>
    </header>
  );
}
