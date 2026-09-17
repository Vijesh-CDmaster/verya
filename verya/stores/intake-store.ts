// Zustand — client/global UI state only (server state lives in TanStack Query).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RoutingPolicy } from "@/schemas/pipeline";

type Theme = "dark" | "light";

type IntakeState = {
  theme: Theme;
  toggleTheme: () => void;

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

export const useIntakeStore = create<IntakeState>()(
  persist(
    (set) => ({
      theme: "dark",
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

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
    { name: "verya-ui" }
  )
);
