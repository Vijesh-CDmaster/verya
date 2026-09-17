import type { Metadata } from "next";
import Header from "@/components/Header";
import DashboardView from "@/components/DashboardView";

export const metadata: Metadata = {
  title: "Verya — Dashboard",
  description: "Trust ledger, model reputation, analytics, and compliance export.",
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <DashboardView />
      </main>
      <footer className="border-t border-line py-8 text-center text-[12px] text-muted">
        Verya — every decision, on the record.
      </footer>
    </div>
  );
}
