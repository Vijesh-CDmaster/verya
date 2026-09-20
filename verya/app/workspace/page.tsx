import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { IntakeIsland } from "@/components/intake/IntakeIsland";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";

export const metadata: Metadata = {
  title: "New analysis — Verya",
  description: "Describe your project and get a verified implementation plan.",
};

export default function WorkspacePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-8 max-w-2xl">
            <Link href="/" className="text-sm text-muted hover:text-fg">
              ← Back to Verya
            </Link>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              New analysis
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Turn your idea into a plan you can trust.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted">
              Describe what you are building in plain language. Verya will surface risks, validate
              your stack, break the work into tasks, and explain each decision before execution.
            </p>
          </div>
          <div className="max-w-3xl">
            <OnboardingGuide />
            <IntakeIsland />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
