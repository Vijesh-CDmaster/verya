import Header from "@/components/Header";
import IntakeFlow from "@/components/IntakeFlow";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <IntakeFlow />
      </main>
      <footer className="border-t border-line py-8 text-center text-[12px] text-muted">
        Verya — deterministic decisions before code. MVP intake preview.
      </footer>
    </div>
  );
}
