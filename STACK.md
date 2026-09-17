# Verya — Approved Technology Stack

> **Status: DECIDED.** This is the stack for building the Verya website and product.
> Where the older planning document (see `BUILD_PLAN.md`) suggests different tools
> (Vite, NestJS, WebContainers…), the stack below **wins**. Superseded items are noted.

## 1. Frontend

| Layer | Technology | Why |
| --- | --- | --- |
| Framework | **Next.js 15** (React, App Router, Server Components) | SSR/SSG for fast dashboard loads; built-in API routes for backend integration; React ecosystem (largest talent pool) |
| UI Library | **shadcn/ui + Tailwind CSS** | Customizable, accessible components; no vendor lock-in (copy-paste components); fast, lightweight |
| State Management | **Zustand or TanStack Query** | Zustand: simple global state (trust scores, user session); TanStack Query: server-state caching (workflow history, analytics) |
| Forms | **React Hook Form + Zod** | Type-safe validation; minimal re-renders |
| Charts | **Recharts or Tremor** | Dashboard analytics (cost, latency, trust scores); Tremor: purpose-built for admin dashboards |
| Auth UI | **Clerk or NextAuth.js** | Clerk: fastest integration (multi-tenant, org switching); NextAuth: self-hosted, more control |

## 2. Backend

| Layer | Technology | Why |
| --- | --- | --- |
| Runtime | **Node.js 22 or Bun** | Node: mature ecosystem, TypeScript support; Bun: 3x faster than Node, drop-in replacement |
| Framework | **Fastify or Express** | Fastify: 2x faster than Express, schema validation built-in; Express: largest middleware ecosystem |
| Language | **TypeScript** | Type safety across frontend + backend; shared types (Zod schemas) |
| API Style | **REST (for MVP) → GraphQL (later)** | REST: simple, cacheable; GraphQL: flexible queries (dashboard filters, nested workflows) |
| Background Jobs | **BullMQ (Redis-based)** | Workflow processing, model routing, verification tasks; retry logic, dead-letter queues |

## 3. Database

| Layer | Technology | Why |
| --- | --- | --- |
| Primary DB | **Neon PostgreSQL** | Serverless Postgres — branching, autoscaling, zero-ops for MVP |
| Vector store | **pgvector (on Neon)** *(from planning doc, carried forward)* | Org memory / similarity search without a second database |

## 4. Reconciled against the earlier planning document

| Topic | Planning doc said | **Decision** |
| --- | --- | --- |
| Frontend build | React + Vite | **Next.js 15** (above) |
| Backend | NestJS or FastAPI | **Fastify/Express on Node 22/Bun** (above) |
| Sandbox/runtime for generated apps | WebContainers / Firecracker | Still relevant for the *in-browser editor* feature, but not part of the website stack; decide when that feature is built |
| Code editor (Monaco) | Monaco Editor | Still relevant for the editor feature only |
| DB | PostgreSQL | **Neon PostgreSQL** (hosted form of the same) |
| Ledger storage | Append-only table + hash-chaining | Carried forward — implement on Neon Postgres |
| Payments | Stripe / Razorpay | Carried forward for launch phase |
| Auth | Clerk / NextAuth | Same as decided above — pick one at build time |
| Monitoring | Sentry + Grafana/Datadog | Carried forward for launch phase |

## 5. Base UI reference

`index.html` (single-file static site, ~2,050 lines) is the **design/visual reference**.
The website will be rebuilt on the stack above; look, feel, section structure, theme
toggle, page-mode navigation, and dark theme behavior come from that file.
