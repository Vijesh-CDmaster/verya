"use client";

// VS Code Editor: clean dark canvas (#1e1e1e), gutter with line numbers,
// active line highlight, synced scroll, floating find widget.
// No internal cards, no extra pills, no mini status bar.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tokenize, TOKEN_COLORS } from "@/lib/workspace/highlight";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function CodeEditor({
  path,
  content,
  language,
  dirty,
  readOnly,
  onSave,
  saving,
}: {
  path: string;
  content: string;
  language: string;
  dirty: boolean;
  readOnly: string | null;
  onSave: () => void;
  saving: boolean;
}) {
  const editBuffer = useWorkspaceStore((s) => s.editBuffer);
  const search = useWorkspaceStore((s) => s.search);
  const setSearch = useWorkspaceStore((s) => s.setSearch);
  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [activeLine, setActiveLine] = useState(1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineGutterRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => content.split("\n"), [content]);
  const lineCount = lines.length;
  const tokens = useMemo(() => tokenize(content, language), [content, language]);

  // Keep highlight + textarea + gutter + active line scrolled together.
  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (lineGutterRef.current) {
      lineGutterRef.current.scrollTop = ta.scrollTop;
    }
    if (activeLineRef.current) {
      activeLineRef.current.style.transform = `translateY(-${ta.scrollTop}px)`;
    }
  }, []);

  // Track active line from cursor position.
  const updateActiveLine = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const line = content.slice(0, pos).split("\n").length;
    setActiveLine(line);
    if (activeLineRef.current) {
      activeLineRef.current.style.transform = `translateY(-${ta.scrollTop}px)`;
    }
  }, [content]);

  // Ctrl/Cmd+F opens search; Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !readOnly) onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, readOnly, onSave]);

  const matches = useMemo(() => {
    if (!search || search.length < 2) return [] as number[];
    const out: number[] = [];
    const lower = content.toLowerCase();
    const q = search.toLowerCase();
    let idx = lower.indexOf(q);
    while (idx !== -1 && out.length < 500) {
      out.push(idx);
      idx = lower.indexOf(q, idx + q.length);
    }
    return out;
  }, [content, search]);

  const jumpToMatch = () => {
    if (matches.length === 0) return;
    const next = (matchIdx + 1) % matches.length;
    setMatchIdx(next);
    const pos = matches[next];
    const line = content.slice(0, pos).split("\n").length;
    const ta = taRef.current;
    if (ta) {
      const lineHeight = 20;
      ta.scrollTop = Math.max(0, (line - 4) * lineHeight);
      syncScroll();
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-[#1e1e1e] overflow-hidden select-text">
      {saving && (
        <span className="absolute right-4 top-2 z-10 text-[10px] text-[#858585] animate-pulse select-none">
          Saving…
        </span>
      )}

      {/* VS Code Floating Find Widget (top-right corner) */}
      {searchOpen && (
        <div className="absolute right-4 top-2 z-20 flex items-center gap-1.5 rounded bg-[#252526] p-1 shadow-lg border border-[#3c3c3c]">
          <input
            autoFocus
            value={search}
            onChange={(e) => { setSearch(e.target.value); setMatchIdx(0); }}
            placeholder="Find"
            className="h-[24px] w-48 rounded bg-[#1e1e1e] px-2 font-mono text-[11px] text-[#cccccc] outline-none border border-[#3c3c3c] focus:border-[#007acc]"
          />
          <span className="whitespace-nowrap px-1 text-[10px] text-[#858585]">
            {search.length >= 2 ? `${matches.length > 0 ? matchIdx + 1 : 0}/${matches.length}` : ""}
          </span>
          <button
            type="button"
            disabled={matches.length === 0}
            onClick={jumpToMatch}
            className="rounded p-1 text-[#cccccc] hover:bg-[#383838] disabled:opacity-30"
            title="Next match"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            className="rounded p-1 text-[#858585] hover:text-[#cccccc] hover:bg-[#383838]"
            title="Close (Escape)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Editor surface: line numbers gutter + code textarea / pre overlay */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 flex">
          {/* Line numbers gutter */}
          <div
            ref={lineGutterRef}
            className="select-none overflow-hidden bg-[#1e1e1e] border-r border-[#2d2d2d] py-3 text-right font-mono text-[13px] leading-[20px] text-[#858585]"
            style={{ width: "3.5rem", paddingRight: "0.85rem" }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i}
                className={i + 1 === activeLine ? "text-[#c6c6c6] font-medium" : "text-[#555555]"}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code editing surface */}
          <div className="relative min-w-0 flex-1 bg-[#1e1e1e]">
            {/* Active line background */}
            {activeLine > 0 && (
              <div
                ref={activeLineRef}
                className="pointer-events-none absolute left-0 right-0 bg-[#282828]"
                style={{
                  top: (activeLine - 1) * 20 + 12,
                  height: 20,
                  transform: `translateY(-${taRef.current?.scrollTop ?? 0}px)`,
                }}
              />
            )}

            {/* Syntax highlighting token render */}
            <pre
              ref={preRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre px-4 py-3 font-mono text-[13px] leading-[20px]"
            >
              <code>
                {tokens.map((t, i) => (
                  <span key={i} className={TOKEN_COLORS[t.cls] ?? TOKEN_COLORS.plain}>
                    {t.text}
                  </span>
                ))}
                {"\n"}
              </code>
            </pre>

            {/* Editing textarea */}
            <textarea
              ref={taRef}
              value={content}
              readOnly={Boolean(readOnly)}
              spellCheck={false}
              onChange={(e) => editBuffer(path, e.target.value)}
              onScroll={syncScroll}
              onClick={updateActiveLine}
              onKeyUp={updateActiveLine}
              aria-label={`Editor for ${path}`}
              className="absolute inset-0 resize-none overflow-auto whitespace-pre bg-transparent px-4 py-3 font-mono text-[13px] leading-[20px] text-transparent caret-white outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
