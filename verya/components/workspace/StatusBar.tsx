"use client";

// VS Code Status Bar: exactly 22px high.
// Left: Ln 1, Col 1 · Spaces: 2 · UTF-8 · Language
// Right: Trust · Risk · Verya

import type { WsBuild } from "@/lib/workspace/build";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function StatusBar({ ws }: { ws: WsBuild }) {
  const activePath = useWorkspaceStore((s) => s.activePath);
  const buffers = useWorkspaceStore((s) => s.buffers);

  const activeBuffer = activePath ? buffers[activePath] : null;
  const lang = activeBuffer?.language ?? "plaintext";
  const trustBudget = ws.governance.trustBudget;
  const risk = ws.governance.overallRisk;

  const langDisplay =
    lang === "typescript" ? "TypeScript" :
    lang === "javascript" ? "JavaScript" :
    lang === "python" ? "Python" :
    lang === "json" ? "JSON" :
    lang === "sql" ? "SQL" :
    lang === "markdown" ? "Markdown" :
    lang === "txt" ? "Plain Text" :
    lang;

  return (
    <footer
      className="flex h-[22px] shrink-0 items-center justify-between border-t border-[#2d2d2d] bg-[#181818] px-3 text-[11px] text-[#858585] select-none"
      aria-label="Status Bar"
    >
      {/* Left side items */}
      <div className="flex items-center gap-3">
        {activeBuffer && (
          <>
            <span className="hover:text-[#cccccc] cursor-default">Ln 1, Col 1</span>
            <span className="hover:text-[#cccccc] cursor-default">Spaces: 2</span>
            <span className="hover:text-[#cccccc] cursor-default">UTF-8</span>
            <span className="hover:text-[#cccccc] cursor-default">{langDisplay}</span>
          </>
        )}
        {!activeBuffer && (
          <span className="text-[#666666]">Ready</span>
        )}
      </div>

      {/* Right side items */}
      <div className="flex items-center gap-3">
        {ws.runState === "running" && (
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            Running…
          </span>
        )}

        {trustBudget && (
          <span>
            Trust: {Math.round(trustBudget.remaining)}/{Math.round(trustBudget.initial)}
          </span>
        )}

        <span>
          Risk: <span className="capitalize">{risk}</span>
        </span>

        <span className="text-[#666666]">Verya</span>
      </div>
    </footer>
  );
}
