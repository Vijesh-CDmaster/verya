// Zustand — client/global UI state only (server state lives in TanStack Query).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RoutingPolicy } from "@/schemas/pipeline";

type Theme = "dark" | "light";

/** Section ids on the marketing deck, in page order (mirrors index.html sections). */
export const PAGE_IDS = [
  "home",
  "problem",
  "how-it-works",
  "tie-breaks",
  "trust",
  "use-cases",
  "pricing",
  "faq",
  "get-started",
  "final-cta",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

/** Anchor aliases from index.html navigation (nav links → page indexes). */
export const PAGE_ALIASES: Record<string, number> = {
  product: 0,
  demo: 0,
  workbench: 0,
  how: 2,
  "how-it-works": 2,
  docs: 2,
  spec: 2,
  sdk: 2,
  cli: 2,
  trust: 4,
  audit: 4,
  soc2: 4,
  policy: 4,
  privacy: 4,
  security: 4,
  about: 5,
  pricing: 6,
  faq: 7,
  signup: 8,
  start: 8,
  "get-started": 8,
};

type UiState = {
  theme: Theme;
  toggleTheme: () => void;

  // Page-mode deck state (marketing home).
  page: number;
  setPage: (n: number) => void;

  // Active pipeline session (id only; the session data itself is server state).
  sessionId: string | null;
  setSessionId: (id: string | null) => void;

  // Intake draft persisted across reloads.
  draftInput: string;
  setDraftInput: (v: string) => void;
  hasStack: boolean;
  setHasStack: (v: boolean) => void;
  statedStack: string;
  setStatedStack: (v: string) => void;
  policy: RoutingPolicy;
  setPolicy: (p: RoutingPolicy) => void;

  reset: () => void;
};

function pageFromHash(hash: string): number {
  const h = hash.replace(/^#/, "");
  const explicit = h.match(/^page-(\d+)$/);
  if (explicit) {
    const n = Number(explicit[1]) - 1;
    if (n >= 0 && n < PAGE_IDS.length) return n;
  }
  const alias = PAGE_ALIASES[h];
  return typeof alias === "number" ? alias : 0;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: "dark",
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      page: 0,
      setPage: (n) =>
        set(() => {
          const page = Math.max(0, Math.min(PAGE_IDS.length - 1, n));
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", page === 0 ? window.location.pathname : `#page-${page + 1}`);
          }
          return { page };
        }),

      sessionId: null,
      setSessionId: (id) => set({ sessionId: id }),

      draftInput: "",
      setDraftInput: (v) => set({ draftInput: v }),
      hasStack: false,
      setHasStack: (v) => set({ hasStack: v }),
      statedStack: "",
      setStatedStack: (v) => set({ statedStack: v }),
      policy: "balanced",
      setPolicy: (p) => set({ policy: p }),

      reset: () =>
        set({ sessionId: null, draftInput: "", hasStack: false, statedStack: "", policy: "balanced" }),
    }),
    {
      name: "verya-ui",
      partialize: (s) => ({
        theme: s.theme,
        sessionId: s.sessionId,
        draftInput: s.draftInput,
        hasStack: s.hasStack,
        statedStack: s.statedStack,
        policy: s.policy,
      }),
    }
  )
);

/** Resolve an anchor/alias or `#page-N` hash to a page index (0 when unknown). */
export function pageIndexFromHash(hash: string): number {
  return pageFromHash(hash);
}
