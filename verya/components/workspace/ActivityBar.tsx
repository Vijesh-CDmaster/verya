"use client";

// VS Code Activity Bar: 48px wide, vertical stack of quiet monochrome icons.
// No text labels. Clean active indicator.

import { useWorkspaceStore, type ActiveView } from "@/stores/workspace-store";

export function ActivityBar() {
  const activeView = useWorkspaceStore((s) => s.activeView);
  const setActiveView = useWorkspaceStore((s) => s.setActiveView);
  const explorerOpen = useWorkspaceStore((s) => s.explorerOpen);
  const setExplorerOpen = useWorkspaceStore((s) => s.setExplorerOpen);

  const handleToggle = (view: ActiveView) => {
    if (activeView === view && explorerOpen) {
      setExplorerOpen(false);
    } else {
      setActiveView(view);
      setExplorerOpen(true);
    }
  };

  return (
    <aside
      className="flex w-[48px] shrink-0 flex-col justify-between border-r border-[#2d2d2d] bg-[#181818] select-none"
      aria-label="Activity Bar"
    >
      {/* Top action icons */}
      <div className="flex flex-col items-center">
        {/* Explorer */}
        <button
          type="button"
          onClick={() => handleToggle("explorer")}
          className={`relative flex h-[48px] w-[48px] items-center justify-center transition-colors ${
            activeView === "explorer" && explorerOpen
              ? "text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-white"
              : "text-[#858585] hover:text-[#cccccc]"
          }`}
          title="Explorer (Ctrl+Shift+E)"
          aria-label="Explorer"
        >
          <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6A2.25 2.25 0 004.883 20.25h14.234a2.25 2.25 0 002.226-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          </svg>
        </button>

        {/* Search */}
        <button
          type="button"
          onClick={() => handleToggle("search")}
          className={`relative flex h-[48px] w-[48px] items-center justify-center transition-colors ${
            activeView === "search" && explorerOpen
              ? "text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-white"
              : "text-[#858585] hover:text-[#cccccc]"
          }`}
          title="Search (Ctrl+Shift+F)"
          aria-label="Search"
        >
          <svg className="h-[20px] w-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </button>

        {/* Source Control / Changes */}
        <button
          type="button"
          onClick={() => handleToggle("changes")}
          className={`relative flex h-[48px] w-[48px] items-center justify-center transition-colors ${
            activeView === "changes" && explorerOpen
              ? "text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-white"
              : "text-[#858585] hover:text-[#cccccc]"
          }`}
          title="Source Control / Changes"
          aria-label="Source Control"
        >
          <svg className="h-[21px] w-[21px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
          </svg>
        </button>

        {/* Run */}
        <button
          type="button"
          onClick={() => handleToggle("run")}
          className={`relative flex h-[48px] w-[48px] items-center justify-center transition-colors ${
            activeView === "run" && explorerOpen
              ? "text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-white"
              : "text-[#858585] hover:text-[#cccccc]"
          }`}
          title="Run & Execution Status"
          aria-label="Run"
        >
          <svg className="h-[20px] w-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
        </button>

        {/* Governance */}
        <button
          type="button"
          onClick={() => handleToggle("governance")}
          className={`relative flex h-[48px] w-[48px] items-center justify-center transition-colors ${
            activeView === "governance" && explorerOpen
              ? "text-white before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-white"
              : "text-[#858585] hover:text-[#cccccc]"
          }`}
          title="Trust & Governance"
          aria-label="Governance"
        >
          <svg className="h-[20px] w-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </button>
      </div>

      {/* Bottom setting/account icons */}
      <div className="flex flex-col items-center pb-2">
        <button
          type="button"
          onClick={() => handleToggle("governance")}
          className="flex h-[40px] w-[40px] items-center justify-center text-[#858585] hover:text-[#cccccc] transition-colors"
          title="Settings / Preferences"
          aria-label="Settings"
        >
          <svg className="h-[20px] w-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
