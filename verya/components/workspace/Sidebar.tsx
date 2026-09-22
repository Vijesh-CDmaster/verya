"use client";

// VS Code File Explorer: pure file tree.
// 22px row height, subtle chevrons, no heavy status badges or task sections.

import { useState } from "react";
import { type TreeNode } from "@/lib/workspace/build";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function FileExplorer({
  tree,
  fileContent,
  readOnly,
}: {
  tree: TreeNode;
  fileContent: (path: string) => { content: string; language: string; artifact: { taskId: string; language: string; version: number } } | null;
  readOnly: string | null;
}) {
  const openFile = useWorkspaceStore((s) => s.openFile);
  const activePath = useWorkspaceStore((s) => s.activePath);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (path: string) => setCollapsed((c) => ({ ...c, [path]: !c[path] }));

  const renderNode = (node: TreeNode, depth: number) => {
    if (node.dir) {
      const isCollapsed = collapsed[node.path] ?? false;
      return (
        <div key={node.path}>
          <button
            type="button"
            onClick={() => toggle(node.path)}
            className="flex h-[22px] w-full items-center gap-1 px-2 text-left text-[12px] text-[#cccccc] hover:bg-[#2a2d2e] select-none group"
            style={{ paddingLeft: depth * 12 + 6 }}
          >
            {/* Folder chevron */}
            <svg
              className={`h-3 w-3 shrink-0 text-[#858585] group-hover:text-[#cccccc] transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            {/* Folder icon */}
            <svg className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-1.5V9a3 3 0 00-3-3h-3.879a1.5 1.5 0 01-1.06-.44l-1.122-1.12A3 3 0 007.878 3H4.5A3 3 0 001.5 6v12a3 3 0 003 3h15z" />
            </svg>
            <span className="truncate text-[#cccccc] font-normal">{node.name}</span>
          </button>
          {!isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }

    const isActive = activePath === node.path;
    const isModified = node.status === "modified";
    const isNew = node.status === "new";

    return (
      <button
        key={node.path}
        type="button"
        onClick={() => {
          const f = fileContent(node.path);
          if (f) openFile({ path: node.path, ...f, readOnly });
        }}
        className={`flex h-[22px] w-full items-center gap-1.5 px-2 text-left text-[12px] transition-colors select-none ${
          isActive
            ? "bg-[#37373d] text-white"
            : "text-[#cccccc] hover:bg-[#2a2d2e]"
        }`}
        style={{ paddingLeft: depth * 12 + 18 }}
        title={node.path}
      >
        <FileIcon name={node.name} />
        <span className={`truncate font-mono text-[12px] ${isModified ? "text-[#e2c08d]" : isNew ? "text-[#73c991]" : "text-[#cccccc]"}`}>
          {node.name}
        </span>
        {isModified && (
          <span className="ml-auto mr-1 text-[10px] font-bold text-[#e2c08d]" title="Modified">M</span>
        )}
        {isNew && (
          <span className="ml-auto mr-1 text-[10px] font-bold text-[#73c991]" title="Untracked / New">U</span>
        )}
      </button>
    );
  };

  if (tree.children.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-[#858585]">
        <p>No workspace files.</p>
        <p className="mt-1 text-[11px] text-[#666666]">Files will appear as tasks execute.</p>
      </div>
    );
  }

  return <div className="py-1">{renderNode(tree, 0)}</div>;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  let tag = "TS";
  let color = "text-[#3178c6]";

  if (ext === "tsx") { tag = "TSX"; color = "text-[#3178c6]"; }
  else if (ext === "js") { tag = "JS"; color = "text-[#f7df1e]"; }
  else if (ext === "jsx") { tag = "JSX"; color = "text-[#61dafb]"; }
  else if (ext === "json") { tag = "{}"; color = "text-[#cbcb41]"; }
  else if (ext === "css") { tag = "#"; color = "text-[#42a5f5]"; }
  else if (ext === "html") { tag = "<>"; color = "text-[#e44d26]"; }
  else if (ext === "md") { tag = "M↓"; color = "text-[#858585]"; }
  else if (ext === "py") { tag = "PY"; color = "text-[#3572A5]"; }
  else if (ext === "sql") { tag = "SQL"; color = "text-[#00758f]"; }
  else if (ext === "txt") { tag = "TXT"; color = "text-[#858585]"; }

  return (
    <span className={`inline-flex w-3.5 shrink-0 justify-center text-[9px] font-bold ${color}`}>
      {tag}
    </span>
  );
}
