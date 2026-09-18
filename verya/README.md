# Verya — AI governance & orchestration platform

Deterministic decisions. Verified code. Audit-ready proof. Verya reviews an AI
project plan for flaws before any code is written, decides stack → algorithm →
model in a fixed order with human tie-breaks, executes, verifies, and records
every decision in an append-only, hash-chained trust ledger.

## Architecture

```
Next.js 15 (App Router, RSC)          Fastify (Node 22, TypeScript)
Tailwind CSS + shadcn/ui     ←REST→   routes → services → repositories
Zustand (UI state)                    Neon PostgreSQL + pgvector
TanStack Query (server state)         Redis + BullMQ (background jobs)
React Hook Form + Zod                 Clerk (JWT auth, dev-mode fallback)
```

| Path | What it is |
| --- | --- |
| `app/` | Next.js routes (`/` marketing deck, `/dashboard` analytics) |
| `components/` | `ui/` (shadcn-style), `layout/`, `marketing/`, `intake/`, `pipeline/`, `dashboard/`, `forms/` |
| `stores/` | Zustand store (theme, page-mode deck, session id, intake draft) |
| `hooks/` | TanStack Query hooks (all server state) |
| `services/` | Typed API client — the only place the frontend calls the backend |
| `schemas/` | Zod schemas shared by forms and the API contract |
| `backend/src/routes/` | HTTP handlers (pipeline, ledger, dashboard, leads) |
| `backend/src/services/` | Business logic (pipeline gates, ledger, memory, reputation) |
| `backend/src/repositories/` | SQL access (sessions, ledger, org memory, reputation, leads) |
| `backend/src/lib/pipeline/` | The gate engine (suitability → flaws → stack → tasks → algorithms → models) |
| `backend/src/lib/ai/` | Multi-provider model layer + prompts (swap point for custom ML) |
| `backend/src/jobs/` | BullMQ queues + execution worker |
| `backend/src/db/` | Pool, migration runner, versioned SQL migrations |

## Run it

### 1. Backend

```bash
cd backend
cp .env.example .env        # set DATABASE_URL (Neon) + at least one AI provider key
npm install
npm run migrate             # creates tables + pgvector extension
npm run dev                 # http://localhost:4000
```

Optional background execution:

```bash
# point REDIS_URL at any Redis instance, then:
npm run worker
```

Without Redis the API runs execution inline; with Redis, execution moves to the
BullMQ worker with retries and backoff.

### 2. Frontend

```bash
cd ..                       # verya/
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

In development Next.js proxies `/api/*` and `/health` to the backend
(`BACKEND_ORIGIN`, default `http://localhost:4000`). In production set
`NEXT_PUBLIC_API_URL` to the backend origin and call it directly.

## What's real

- **Trust ledger** — append-only, hash-chained (`chain_hash = SHA-256(prev_hash || payload)`),
  serialized per org with advisory locks, verifiable end-to-end, exportable as CSV.
- **pgvector org memory** — every accepted/edited/rejected output is embedded and
  searchable by cosine similarity, strictly per-org.
- **Model reputation** — living trust scores per model × task category, updated on
  every human decision.
- **Gated pipeline** — suitability → flaws (per-flaw accept/reject) → stack
  (validate/recommend, tie-breaks) → tasks (editable) → algorithms → model routing
  (policy-aware, tie-breaks) → execution → verification → feedback.
- **Leads** — the marketing form writes real rows through `POST /api/leads`.

## Scripts

Frontend (`verya/`): `npm run dev` · `npm run build` · `npm start` · `npm run lint`

Backend (`verya/backend/`): `npm run dev` · `npm run build` · `npm start` ·
`npm run migrate` · `npm run worker` · `npm run typecheck` · `npm run lint`

## Data model

`organizations`, `users`, `sessions` (pipeline state), `ledger_entries`
(append-only, hash-chained), `org_memory` (pgvector embeddings),
`model_reputation` (per model × task category), `leads`, `schema_migrations`.

## Docs

- `../STACK.md` — decided technology stack
- `../FULL_SPEC.md` — the gated pipeline spec (features F1–F22)
- `../REQUIREMENTS.md` — product requirements
- `../CONTENT.md` — website copy reference
- `../index.html` — original visual design reference
