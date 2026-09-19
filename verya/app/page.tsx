import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/marketing/Hero";
import { Problem } from "@/components/marketing/Problem";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { TrustAudit } from "@/components/marketing/TrustAudit";
import { UseCases } from "@/components/marketing/UseCases";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Problem />
        <HowItWorks />
        <TrustAudit />
        <UseCases />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
