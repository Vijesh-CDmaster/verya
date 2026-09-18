import { LeadForm } from "@/components/forms/LeadForm";
import { IntakeIsland } from "@/components/intake/IntakeIsland";

export function GetStarted() {
  return (
    <section className="section-pad">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <LeadForm />
          <div>
            <div className="mb-4 text-xs uppercase tracking-[0.5px] text-muted">
              Or jump straight in
            </div>
            <h3 className="mb-6 text-2xl font-bold leading-snug">
              Paste your project — get a checked plan.
            </h3>
            <IntakeIsland />
          </div>
        </div>
      </div>
    </section>
  );
}
