import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { DashboardView } from "@/components/dashboard/DashboardView";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verya — Dashboard",
  description: "Trust ledger, model reputation, analytics and review queue.",
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Workspace</p>
            <h1 className="mt-1 text-2xl font-bold">Your governance overview</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Review decisions, model performance, and anything waiting for your approval.
            </p>
          </div>
          <Link
            href="/workspace"
            className="inline-flex w-fit rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            New analysis
          </Link>
        </div>
        <DashboardView />
      </main>
      <Footer />
    </div>
  );
}
