"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Header() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("verya-theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3 text-[15px] font-semibold no-underline">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-primary text-[13px] font-bold text-on-primary">
            V
          </span>
          <span>Verya</span>
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
            className="h-8 w-8 rounded-full border border-line bg-surface text-sm transition hover:border-fg"
          >
            {mounted ? (dark ? "☀" : "☾") : "☾"}
          </button>
          <a
            href="#how"
            className="hidden rounded-md border border-line px-4 py-2 text-[13px] font-medium no-underline transition hover:bg-surface sm:block"
          >
            How it works
          </a>
          <a
            href="#start"
            className="rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary no-underline transition hover:opacity-90"
          >
            Get Started
          </a>
        </div>
      </div>
    </header>
  );
}
