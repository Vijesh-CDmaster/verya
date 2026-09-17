# Verya — Base UI Analysis & Build Readiness

> Analysis of the existing base UI (`index.html`) against the approved stack
> (`STACK.md`), build plan (`BUILD_PLAN.md`), and site copy (`CONTENT.md`).
> Written ahead of the detailed build requirements so the gap list is explicit.

---

## 1. What the base UI (`index.html`) is

A single-file, dependency-free static site (~2,050 lines: HTML + CSS + vanilla JS).
Product: **Verya — AI governance & orchestration platform** ("Deterministic decisions.
Verified code. Audit-ready proof.").

### Sections in order (top-level `<section>` elements, used as "pages")

1. **Hero** — eyebrow, headline ("Deterministic decisions. Verified code. Audit-ready proof."), subheading, CTAs, and an IDE-style mockup ("Input" vs "Flagged Issues" panes with severity dots and Review Fix buttons).
2. **The Hallucination Debt (problem)** — narrative copy: AI optimizes for syntactic plausibility, plans are doomed from line zero, etc.
3. **How It Works** — 5 numbered steps with a rail: tell it what you're building → it finds what you missed → it picks your stack (with two selectable stack-option cards) → it breaks the work down (DAG of tasks) → it matches the right model to each task (3 model chips: assigned/timeout/budget match).
4. **Transparent Arbitration (tie-breaks)** — side-by-side option cards (Redis Pub/Sub vs Postgres LISTEN/NOTIFY) with radio inputs, latency/cost/ops metrics, "Select Option A/B" buttons, keyboard hint (`T` for tie-break).
5. **Trust & Audit** — three pillars (Append-Only, Zero-Egress, Continuous SOC2) + a 4-row audit ledger table (timestamp, event type, status badge, description, audit ID).
6. **Use Cases (audience)** — three cards: Builders & small teams, Platform & engineering leads, Compliance & risk teams.
7. **Pricing teaser** — "Simple. Transparent. Based on usage."
8. **FAQ** — 4 Q&As (flaw detection, bring-your-own keys, disagreeing with suggestions, data training).
9. **Lead capture** — name/email/phone form posting to a placeholder API URL with a dev-mode fallback.
10. **Final CTA** — "Stop guessing. Start building with confidence."
11. **Footer** — brand blurb, Product/Engineering/Governance link columns, copyright, social links.

### Notable implemented behaviors (vanilla JS)

- **Dark/light theme toggle** with `localStorage` persistence (`verya-theme`) and CSS custom-property theming (light default, dark overrides).
- **"Page mode" navigation** — the long scroll is converted into slide-like pages: right-side dot navigation with tooltips, prev/next buttons, a page counter (`01 / 11`), arrow-key/PageUp/PageDown navigation, hash-based deep links (`#page-N` plus alias map like `#signup` → page 8), enter/leave animations, `prefers-reduced-motion` respected.
- **Anchor aliasing** — nav links (`#product`, `#trust`, `#faq`, `#signup`, etc.) map onto pages.
- **Lead form** — validation, success/error message states, placeholder endpoint.

### Design language

- Minimal black/white system (`--primary: #000`, light gray surfaces), thin borders, small radii; dark theme flips to deep navy (#0b1020) with light text.
- System font stack; monospace for code lines; status colors (success/warning/error) used sparingly in badges and issue dots.
- Sticky blurred header with logo, nav, search icon, theme toggle, Sign In / Get Started.
- Hover animations throughout (translateY lifts, underlines, arrow shifts); IDE mockup with chrome dots; audit table with status badges.
- Responsive breakpoints at 768px and 480px (nav collapses to column, grids go single-column).

---

## 2. Gap analysis — base UI vs decided stack

| Area | Base UI today | Decided stack | Gap |
| --- | --- | --- | --- |
| Framework | Single static HTML file | Next.js 15 (App Router, Server Components) | Everything must be ported into components; no routing, no RSC, no `app/` structure yet |
| Styling | Handwritten CSS (~1,500 lines) with CSS vars | Tailwind CSS + shadcn/ui | Port design tokens to a Tailwind theme; rebuild patterns as shadcn components |
| State | None (DOM manipulation) | Zustand / TanStack Query | Theme + page-mode state → Zustand; server data → TanStack Query |
| Forms | Vanilla JS handler with placeholder endpoint | React Hook Form + Zod | Rebuild lead form; wire to a real API route; Zod validation |
| Charts | None (static table only) | Recharts/Tremor | New work — analytics/dashboard charts don't exist yet |
| Auth UI | Only "Sign In" links | Clerk or NextAuth | Not started |
| Backend | None (fetch to `https://your-api-endpoint.com/api/leads`) | Fastify/Express on Node 22/Bun + Neon Postgres + BullMQ | Leads endpoint, DB schema, queues all pending |
| Animations | CSS keyframes, page transitions | — | Port as CSS modules/Tailwind; consider Framer Motion only if needed |
| Accessibility basics | aria-hidden page states, focus-visible styles, reduced-motion support | — | Good bones; keep and improve during port |

## 3. Copy drift — index.html vs CONTENT.md

The live HTML still uses the older/denser copy; `CONTENT.md` is the newer, approved voice. Key deltas to apply when rebuilding:

- **Hero:** HTML = "Deterministic decisions. Verified code. Audit-ready proof." → CONTENT.md = "Before your AI writes a single line, Verya checks if the plan is even good." (with the "shows its work" subheadline).
- **Problem:** HTML = "The Hallucination Debt" framing → CONTENT.md = "You already know this happens." plain-language version.
- **How it works:** CONTENT.md headline "One project. Five decisions. You're in the loop on every close call." with friendlier step copy (HTML has the technical version).
- **Editor section (new):** CONTENT.md adds a dedicated "Then you build it, right here." product-demo section that doesn't exist in the HTML — needs a new visual (Monaco file tree + live preview mockup).
- **Tie-breaks, Trust, Use cases, FAQ:** same spirit, CONTENT.md wording is warmer; FAQ differs (CONTENT.md has "Does this replace my usual coding assistant?" which HTML lacks).
- **Final CTA:** HTML = "Stop guessing. Start building with confidence." → CONTENT.md = "Give it a real project. See what it catches." + "No credit card. First project's on us."
- **Designer notes:** no neural-network graphics; hero visual does the explaining; give Sections 5–6 extra visual weight; no fabricated testimonials.

## 4. Missing pages/flows (from BUILD_PLAN Phase 0)

- Real routes: `/` (marketing), `/pricing`, `/signup` + auth screens, `/dashboard` shell.
- Legal: ToS, Privacy, Refund.
- Onboarding flow stub.
- Pricing page (only a teaser exists).

## 5. Ready state — what we can start the moment requirements land

- `STACK.md` and `BUILD_PLAN.md` are locked; `index.html` is the visual reference; `CONTENT.md` is the copy source.
- Recommended first build step (pending your requirements): scaffold Next.js 15 + Tailwind + shadcn/ui, port the design tokens, rebuild the hero/IDE mockup, page-mode navigation as client components, and the lead form with RHF+Zod → API route → Neon Postgres.
