import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { DashboardView } from "@/components/dashboard/DashboardView";

export const metadata: Metadata = {
  title: "Verya — Dashboard",
  description: "Trust ledger, model reputation, analytics and review queue.",
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
        <DashboardView />
      </main>
      <Footer />
    </div>
  );
}
