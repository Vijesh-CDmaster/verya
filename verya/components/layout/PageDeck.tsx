"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_IDS, pageIndexFromHash, useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

const PAGE_NAMES: Record<(typeof PAGE_IDS)[number], string> = {
  home: "Home",
  problem: "The problem",
  "how-it-works": "How it works",
  "tie-breaks": "Tie-breaks",
  trust: "Trust & audit",
  "use-cases": "Use cases",
  pricing: "Pricing",
  faq: "FAQ",
  "get-started": "Get started",
  "final-cta": "Next steps",
};

export type PageSection = {
  id: (typeof PAGE_IDS)[number];
  node: React.ReactNode;
};

export function PageDeck({ sections }: { sections: PageSection[] }) {
  const page = useUiStore((s) => s.page);
  const setPage = useUiStore((s) => s.setPage);
  const [leaving, setLeaving] = useState<number | null>(null);
  const lockRef = useRef(false);

  const goTo = useCallback(
    (n: number) => {
      if (lockRef.current) return;
      const next = Math.max(0, Math.min(sections.length - 1, n));
      if (next === page) return;
      lockRef.current = true;
      setLeaving(page);
      setPage(next);
      window.setTimeout(() => {
        setLeaving(null);
        lockRef.current = false;
      }, 260);
    },
    [page, sections.length, setPage]
  );

  // Deep links: #page-N and anchor aliases (e.g. #signup, #trust).
  useEffect(() => {
    const applyHash = () => setPage(pageIndexFromHash(window.location.hash));
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [setPage]);

  // Keyboard navigation: ← → / PgUp / PgDn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(page - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [goTo, page]);

  // Reset scroll when the page changes.
  useEffect(() => {
    document.querySelector(".page-viewport")?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <>
      {/* Right-side dot progress (index.html .page-progress) */}
      <div
        className="fixed right-3 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2.5 sm:right-6"
        role="navigation"
        aria-label="Page navigation"
      >
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            title={PAGE_NAMES[s.id] ?? `Page ${i + 1}`}
            aria-label={`Open ${PAGE_NAMES[s.id] ?? `Page ${i + 1}`}`}
            aria-current={i === page ? "page" : "false"}
            onClick={() => goTo(i)}
            className={cn(
              "h-2 w-2 rounded-full border border-muted bg-transparent transition-transform hover:scale-[1.45]",
              i === page && "scale-[1.45] border-accent bg-accent"
            )}
          />
        ))}
      </div>

      {/* Prev / next controls (bottom-left) */}
      <div className="fixed bottom-4 left-3 z-50 flex gap-2 sm:left-6">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-bg/90 text-fg transition-transform hover:-translate-y-0.5 hover:bg-accent hover:text-accent-fg disabled:cursor-not-allowed disabled:opacity-35"
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Next page"
          disabled={page === sections.length - 1}
          onClick={() => goTo(page + 1)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-bg/90 text-fg transition-transform hover:-translate-y-0.5 hover:bg-accent hover:text-accent-fg disabled:cursor-not-allowed disabled:opacity-35"
        >
          →
        </button>
      </div>

      {/* Counter (bottom-right) */}
      <div className="fixed bottom-5 right-3 z-50 text-[11px] font-semibold tracking-[0.12em] text-muted sm:right-[22px]">
        {String(page + 1).padStart(2, "0")} / {String(sections.length).padStart(2, "0")}
      </div>

      {/* The active page, with exit animation on the previous one. */}
      <div className="page-viewport">
        {leaving !== null && sections[leaving] ? (
          <div aria-hidden className="page-exit">
            {sections[leaving].node}
          </div>
        ) : null}
        <div key={`page-${page}`} className="page-enter">
          {sections[page]?.node}
        </div>
      </div>
    </>
  );
}
