import { Header } from "@/components/layout/Header";
import { PageDeck, type PageSection } from "@/components/layout/PageDeck";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/marketing/Hero";
import { Problem } from "@/components/marketing/Problem";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { TieBreaks } from "@/components/marketing/TieBreaks";
import { TrustAudit } from "@/components/marketing/TrustAudit";
import { UseCases } from "@/components/marketing/UseCases";
import { Pricing } from "@/components/marketing/Pricing";
import { Faq } from "@/components/marketing/Faq";
import { GetStarted } from "@/components/marketing/GetStarted";
import { FinalCta } from "@/components/marketing/FinalCta";

const SECTIONS: PageSection[] = [
  { id: "home", node: <Hero /> },
  { id: "problem", node: <Problem /> },
  { id: "how-it-works", node: <HowItWorks /> },
  { id: "tie-breaks", node: <TieBreaks /> },
  { id: "trust", node: <TrustAudit /> },
  { id: "use-cases", node: <UseCases /> },
  { id: "pricing", node: <Pricing /> },
  { id: "faq", node: <Faq /> },
  { id: "get-started", node: <GetStarted /> },
  {
    id: "final-cta",
    node: (
      <>
        <FinalCta />
        <Footer />
      </>
    ),
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <PageDeck sections={SECTIONS} />
      </main>
    </div>
  );
}
