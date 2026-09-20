"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "verya-onboarding-seen";

export function OnboardingGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(window.localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  if (!open) return null;

  const dismiss = () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  return (
    <section className="mb-8 rounded-xl border border-accent/40 bg-accent/5 p-5" aria-labelledby="onboarding-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">First analysis</p>
          <h2 id="onboarding-title" className="mt-1 text-xl font-semibold">How Verya works</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Submit the project as you would describe it to a teammate. Verya turns it into a plan,
            pauses when a decision is genuinely close, and keeps the reasoning attached to the result.
          </p>
        </div>
        <button type="button" onClick={dismiss} className="text-left text-xs text-muted underline hover:text-fg sm:text-right">
          Got it
        </button>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        <li className="rounded-lg border border-line bg-card p-3 text-sm">
          <strong className="block">1. Describe</strong>
          <span className="mt-1 block text-xs leading-relaxed text-muted">Explain the goal, users, constraints, and any stack you already have.</span>
        </li>
        <li className="rounded-lg border border-line bg-card p-3 text-sm">
          <strong className="block">2. Review</strong>
          <span className="mt-1 block text-xs leading-relaxed text-muted">Resolve suitability and flaw decisions before the plan moves downstream.</span>
        </li>
        <li className="rounded-lg border border-line bg-card p-3 text-sm">
          <strong className="block">3. Choose</strong>
          <span className="mt-1 block text-xs leading-relaxed text-muted">When options are close, compare them and make the tie-break yourself.</span>
        </li>
      </ol>
      <Link href="/help" className="mt-4 inline-block text-xs font-semibold text-accent hover:underline">
        Read the workspace guide →
      </Link>
    </section>
  );
}
