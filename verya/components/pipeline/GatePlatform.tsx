"use client";

import type { TargetPlatform, Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";

const OPTIONS: Array<{
  value: TargetPlatform;
  title: string;
  description: string;
}> = [
  { value: "android", title: "Android only", description: "Optimize the review for Android APIs, devices, and release tooling." },
  { value: "ios", title: "iOS only", description: "Optimize the review for Apple platforms, APIs, and App Store delivery." },
  { value: "both", title: "Android + iOS", description: "Review a shared cross-platform product and both native targets." },
];

export function GatePlatform({
  session,
  call,
  busy,
}: {
  session: Session;
  call: (body: unknown) => void;
  busy: boolean;
}) {
  return (
    <div>
      <p className="text-lg font-semibold">Where will this app run?</p>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
        Choose the target before Verya checks for platform-specific flaws. You can change this choice
        only by starting a new analysis.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={busy}
            onClick={() => call({ action: "platform_choose", targetPlatform: option.value })}
            className="rounded-xl border border-line bg-elev p-4 text-left transition hover:-translate-y-0.5 hover:border-accent hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="block font-semibold">{option.title}</span>
            <span className="mt-2 block text-xs leading-relaxed text-muted">{option.description}</span>
            <span className="mt-4 inline-flex text-xs font-semibold text-accent">Use this target →</span>
          </button>
        ))}
      </div>
      {session.targetPlatform && (
        <Button className="mt-4" disabled>
          Selected: {session.targetPlatform === "both" ? "Android + iOS" : session.targetPlatform}
        </Button>
      )}
    </div>
  );
}
