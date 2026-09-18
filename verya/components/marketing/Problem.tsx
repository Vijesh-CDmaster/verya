export function Problem() {
  return (
    <section className="section-pad bg-surface">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 text-center text-xs uppercase tracking-[0.5px] text-muted">
          The Hallucination Debt
        </div>
        <h2 className="mb-8 text-center text-3xl font-bold leading-tight sm:text-4xl">
          You already know this happens.
        </h2>

        <p className="mb-6 text-base leading-[1.8]">
          You give an agent an architectural prompt. It returns 400 lines of pristine, beautifully
          styled TypeScript in three seconds. You feel an immediate dopamine rush.
        </p>
        <p className="mb-6 text-base leading-[1.8]">
          Then you wire up the database. The migrations don&apos;t run because the AI picked an
          abandoned ORM adapter. The auth tokens leak state across tenants because it assumed a
          single-process serverless instance. Two hours later, you&apos;re knee-deep in GitHub
          issues from 2022 trying to resolve a circular dependency on an API that doesn&apos;t
          exist.
        </p>
        <p className="mb-6 text-base font-semibold leading-[1.8]">
          The code was fine. The plan was doomed from line zero.
        </p>
        <p className="text-base leading-[1.8]">
          AI models are optimizers for syntactic plausibility, not systems architects. If you
          don&apos;t enforce deterministic governance before execution begins, you are simply
          automating the generation of technical bankruptcy.
        </p>
      </div>
    </section>
  );
}
