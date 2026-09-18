import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, isLegalSlug } from "@/lib/legal";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  if (!isLegalSlug(doc)) return { title: "Not found — Verya" };
  const legal = LEGAL_DOCS[doc];
  return { title: `${legal.title} — Verya`, description: legal.description };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isLegalSlug(doc)) notFound();
  const legal = LEGAL_DOCS[doc];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="text-[12px] uppercase tracking-[0.5px] text-muted">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{legal.title}</h1>
        <p className="mt-1 text-[13px] text-muted">Last updated {legal.updated}</p>

        <article className="mt-8 space-y-8">
          {legal.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-[15px] font-semibold text-fg">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-2 text-[13.5px] leading-relaxed text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </article>

        <div className="mt-12 flex flex-wrap gap-4 border-t border-line pt-6 text-[13px]">
          {Object.values(LEGAL_DOCS)
            .filter((d) => d.slug !== legal.slug)
            .map((d) => (
              <Link key={d.slug} href={`/legal/${d.slug}`} className="text-accent hover:underline">
                {d.title}
              </Link>
            ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
