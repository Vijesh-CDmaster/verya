"use client";

// VS Code Breadcrumbs: subtle, low-contrast, seamlessly blends into editor chrome.

import { useWorkspaceStore } from "@/stores/workspace-store";

export function Breadcrumbs() {
  const activePath = useWorkspaceStore((s) => s.activePath);
  if (!activePath) return null;

  const segments = activePath.replace(/^project\//, "").split("/");

  return (
    <div className="flex h-[24px] shrink-0 items-center gap-1 border-b border-[#2d2d2d] bg-[#1e1e1e] px-4 text-[11px] select-none">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[#555555]">›</span>}
          <span className={i === segments.length - 1 ? "text-[#cccccc]" : "text-[#858585] hover:text-[#aaaaaa] cursor-default"}>
            {seg}
          </span>
        </span>
      ))}
    </div>
  );
}
