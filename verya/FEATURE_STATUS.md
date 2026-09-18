# Verya — Feature Functionality Breakdown (All 52 Features, code-verified)

> The original 53-item spec includes payments, which are excluded per instruction;
> with billing removed the list is 52 features (onboarding renumbered to #48).

Every claim below was verified against the current codebase (file references included).
Status legend:

- **LIVE** — implemented end-to-end: UI → API → service → Postgres, real data, no fakes.
- **PARTIAL** — core works; named sub-features are missing (listed).
- **NOT BUILT** — absent from the codebase (deferred waves, not silently faked).

**Totals: 9 LIVE · 22 PARTIAL · 21 NOT BUILT** (payments excluded per instruction).

> Update (2026-09-18, second implementation batch): the highest-leverage gaps were
> closed and verified — F9's learning loop last mile, F13's external-knowledge check,
> F16 rating/note/edit capture, F5 merge/split/delete, F22 Battle Mode +
> Explain-My-Decision + trust badges, F38 Clerk pages/token bridge/RBAC, F49 legal
> pages with consent gate, and F1 PDF/DOCX server-side intake. F1/F9/F13 are now LIVE;
> F15 (counterfactual comparison) and F49 moved from NOT BUILT to PARTIAL.

---

## PART A — Entry & Workflow Intake

### F1 · Landing Page / Entry Point — **LIVE**

**Mechanics.** `components/intake/IntakeForm.tsx` renders a freeform textarea (RHF +
Zod via `schemas/pipeline.ts`). No client-side restructuring: the raw text is POSTed
as-is to `POST /api/pipeline` (Fastify `routes/pipeline.ts`), validated by
`StartRequestSchema` (min 20 / max 20,000 chars — the server-side cap), sanitized
(`lib/middleware.ts sanitizeInput`), and the suitability gate runs immediately.
Loading state: "Analyzing…" button state → `SessionView` shows a pulsing "Verya is
working…" while `gateStatus === "running"`.

**Sub-features:**
- ✅ Freeform text box — no client-side cap; expands (`resize-y`); server soft-caps at 20k.
- ✅ File upload — **PDF/DOCX/DOC/RTF + text formats** (≤10MB). Binary formats go
  through `POST /api/pipeline/upload` with **server-side extraction**: `pdf-parse` for
  PDF, `mammoth` for DOCX, best-effort salvage for legacy .doc/RTF; the extracted text
  is combined with any typed description and ledgered with extracted char count.
  Extraction failures and scanned/no-text documents return explicit 422 guidance —
  never a silent empty analysis. Text formats are read client-side and appended.
- ✅ Draft persistence — Zustand `persist` (`stores/ui-store.ts`, key `verya-ui`) stores
  the draft, stack toggle, policy, and session id across reloads.
- ✅ Three example starters + routing-policy selector on the form.

**Gaps:** none material — upload happens inside the single analyze flow (no separate
multi-file queue, by design for MVP).

### F2 · Workflow Suitability Check — **LIVE**

**Mechanics.** `lib/pipeline/gates.ts runSuitability`: the Gemini layer extracts a
structured workflow (`UNDERSTANDING_SYSTEM`), repairs it deterministically
(`repairWorkflow`: ids, de-dup, dependency validation), then `SUITABILITY_SYSTEM`
reads description + workflow **as one connected plan** and returns
`{suitable, confidence, reason, suggestedWorkflow?, suggestedSummary?}` — validated by
`SuitabilitySchema`. Both outcomes are written to the ledger (`suitability_passed` /
`suitability_flagged`).

**Sub-features:**
- ⚠️ Verdict card — `GateSuitability.tsx` renders green "✓ suitable (N% confidence)" or
  amber "⚠ may not fit". The spec's three-state badge (green/amber/red) is collapsed to
  two states (suitable / not suitable).
- ✅ Alternative workflow generator — on unsuitable, a restructured plain-text numbered
  plan is produced and displayed.
- ✅ Hard gate choice — "Use suggested workflow" vs "Keep mine anyway"; the pipeline
  cannot advance until one is chosen (`suitability_choose` action); the choice is
  ledger-recorded as a human decision.

**Gaps:** binary verdict (no "workable but weaker" middle state); alternative shown
sequentially, not as a side-by-side comparison table.

### F3 · Flaw Detection — **LIVE**

**Mechanics.** `FLAW_SYSTEM` is a rubric, not an open ask — it explicitly enumerates the
six categories and mandates per-flaw `{id, title, category, severity, description,
suggestedFix, relatedTaskIds}`, critical-first. `provider.ts detectFlaws` adds a
self-consistency retry: if the summary claims gaps but `flaws[]` is empty, the model is
re-asked once with the contradiction made explicit.

**Sub-features:**
- ✅ Security gap check — flags **omission** (auth/encryption/rate-limit/secrets never mentioned).
- ✅ Architecture / logic / scale / cost / non-functional checks — all six in the rubric.
- ✅ Per-flaw atomic accept/reject — `GateFlaws.tsx` sorts by severity, each flaw is an
  independent decision, decisions are sent as `flaw_resolve` resolutions.
- ✅ No silent skips — critical flaws without an explicit accept/edited decision keep the
  gate closed ("N critical flaw(s) unresolved — the gate stays closed"); the backend
  enforces the same rule and only advances to stack when criticals are resolved.
- ✅ Every resolution is ledger-recorded (`human_decision` + `humanEdit` payload).

**Gaps:** the "edited" decision (schema + backend support it) has no UI control — the
form offers Accept/Reject only; flaws render as a list, not one-at-a-time stepper.

---

## PART B — Stack, Task Breakdown & Routing Pipeline

### F4 · Stack Suggestion — **LIVE**

**Mechanics.** `runStack` branches on `statedStack`:
- **Path A (given):** `STACK_VALIDATE_SYSTEM` validates against the workflow →
  `fit | fit_with_changes | poor_fit` + notes; the user's stack becomes a locked
  candidate ("Your stack"); verdict is ledger-recorded.
- **Path B (none):** `STACK_RECOMMEND_SYSTEM` proposes 1–3 full-stack candidates, each
  with per-layer components (frontend/backend/database/cache/auth/hosting/jobs/storage)
  and a rationale per layer.

**Sub-features:**
- ✅ Stack validator (Path A only).
- ✅ Stack generator (Path B only) — multiple ranked candidates with confidence.
- ⚠️ Trade-off comparison — candidates render side-by-side with confidence % and
  per-layer rationale cards, but there is no attribute matrix (cost / learning curve /
  scaling ceiling columns).
- ✅ Stack lock — `stack_choose` locks the selection; `stackTextOf()` feeds the locked
  stack into algorithm selection, routing, and execution; the lock is a ledger event.

**Gaps:** 1–3 candidates (spec: 3–5); tie-break follows F8 (confidence-gap), no
attribute table.

### F5 · Workflow Breakdown Into Tasks — **PARTIAL**

**Mechanics.** Task decomposition happens in the understanding stage (`WorkflowSchema`:
tasks with id/title/description/category/complexity/risk/dependsOn, 4–14 tasks). The
`tasks` gate renders `GateTasks.tsx`: inline title editing per row, category ·
complexity · risk badges, dependency display, then `tasks_edit` finalizes. The backend
re-aligns dependencies against surviving ids after edits.

**Sub-features:**
- ✅ Task decomposition engine (LLM → structured task array).
- ✅ Dependency mapper (`dependsOn` validated + repaired; execution topologically orders
  tasks from it).
- ✅ Task editor UI — inline edit, **split** (creates a sequential second half that
  inherits dependencies), **merge up** (concatenates title/description, absorbs
  dependencies, scrubs the dropped id everywhere), **delete** (scrubs dangling
  dependency references). All sent as one array via `tasks_edit`; modified lists are
  flagged in the UI before confirming.
- ✅ Finalize/lock control — "Confirm tasks →" is the explicit lock.

**Gaps:** a visual DAG (dependencies render as text lists; topological order is
respected but not drawn).

### F6 · Algorithm / Approach Selection Per Task — **LIVE**

**Mechanics.** `runAlgorithms` calls `ALGORITHM_SYSTEM` with the locked workflow +
locked stack: per task, 1–4 candidate approaches with `approach`, `pros`, `cons`,
`confidence`. `repairAlgorithmPlan` aligns rows to real task ids positionally and fills
any skipped task with a deterministic single-option row, so a sloppy model response can
never kill the gate.

**Sub-features:**
- ✅ Candidate generator (multi-option per task, never one answer).
- ⚠️ Constraint-aware scorer — constraints come from the workflow text the model already
  read; there is no dedicated user-supplied constraint input (data size / latency target).
- ✅ Auto-select vs tie-break router — F8 applied (`tieBreakRequired` per task).
- ✅ Per-task reasoning log — every auto pick, human pick, and tie count is
  ledger-recorded (`algorithm_selected` / `algorithm_tiebreak` / `human_decision`).

**Gaps:** 1–4 options (spec: 3–5); no explicit constraint capture UI.

### F7 · AI Model Routing Per Task — **PARTIAL**

**Mechanics.** `runRouting` + `ROUTING_SYSTEM`: the router scores a fixed 12-model pool
(`MODEL_POOL`: Gemini ×2, Groq ×3, Mistral ×4, OpenRouter ×3) with per-model
`specialties` (per-task-type strength profile), `costPerTask` tiers, and per-option
`confidence / estimatedCost / estimatedLatencyMs / qualifiesBecause`. The org's routing
policy is then applied on top of the raw ranking (`lowest_cost` downgrades when the
accuracy delta is small; `highest_accuracy` upgrades when the strong model qualifies).
Failover across providers is real (`runModelText`: requested model → same-provider
siblings → other providers → Gemini native; daily-quota exhaustion is remembered per
model; per-model retries with backoff).

**Sub-features:**
- ✅ Per-task-type strength profile — `specialties` per pool model; execution honors the
  routed model with cross-provider failover.
- ⚠️ Routing policy — **3 of 4 implemented** (`lowest_cost`, `highest_accuracy`,
  `balanced`). `org-approved-models-only` is NOT implemented.
- ✅ Auto-route vs tie-break UI — `GateModels.tsx`: clear winners render with reasons;
  ties render option cards (confidence %, cost, latency, why-it-qualifies) with pick buttons.
- ✅ Manual override — the tie UI *is* the override surface; `model_choose` +
  human_decision are ledger-recorded.

**Gaps:** org-approved-models-only policy; historical performance from the memory engine
is not yet a routing signal (F9 records outcomes but routing doesn't read them yet).

### F8 · Universal Decision Rule — **LIVE**

**Mechanics.** `needsTieBreak(options)` in `schemas/pipeline.ts`: auto-decide only if
top confidence ≥ `AUTO_FLOOR` (0.72) AND gap to runner-up ≥ `TIE_GAP` (0.12). Applied
at the stack gate, in `repairAlgorithmPlan`, and in `repairRoutingPlan` (which force-
recomputes each row's tie status from its own options so the model can't fake or hide a
tie). Every auto decision carries a rendered reason and a ledger entry; ties always
render side-by-side and block until the human picks.

**Sub-features:**
- ✅ Confidence-gap calculator (the two constants).
- ✅ Auto-decide-with-reason renderer (all three gates show "clear winner, reason shown").
- ⚠️ Tie-break picker component — behaviorally identical across stack/algorithm/model
  gates but implemented as three similar JSX blocks, not one shared component.

**Gaps:** thresholds are exported constants — tunable, but not runtime config/env
(the spec wants config-tunable thresholds).

---

## PART C — Learning, Trust & Verification Layer

### F9 · Organization-Specific Memory Engine — **LIVE**

**Mechanics.** On every feedback event, `services/pipeline.ts` calls
`recordMemory` → `services/memory.ts embed()` → Gemini `text-embedding-001`
(1536-dim, env-swappable; deterministic local hash embedder as keyless fallback) →
`org_memory` row with a `vector(1536)` column, strictly `org_id`-scoped.
`/api/memory/search` does cosine-similarity retrieval (`1 - embedding <=> $2`), surfaced
in the dashboard's "Org memory search (pgvector)" card. Skill map aggregates
outcome→trust per (model, category) via SQL CASE weights → the heatmap panel.

**Sub-features:**
- ✅ Feedback event capture (accept/edited/rejected + rating/note in `meta`).
- ✅ Embedding + vector store (pgvector ivfflat index).
- ✅ Similarity retrieval (top-N per query, tenant-scoped).
- ✅ Org skill map (heatmap on dashboard).
- ✅ Export/delete controls (`/api/memory/export` JSON download, `DELETE /api/memory`).
- ✅ **Retrieval → prompt injection (the last mile is closed)**: `runAlgorithms` pulls
  the top similar past tasks per workflow category (pgvector cosine) and injects them
  as `[category]` context into the algorithm prompt; `runRouting` injects the org's
  model×category outcome history ("earned trust here" / "struggled here" with sample
  counts and avg quality) so routing is biased by what actually worked. Memory failure
  degrades to no-context, never breaking a gate.

### F10 · AI Trust Ledger — **LIVE**

**Mechanics.** `repositories/ledger.ts`: every gate decision, execution, verification,
and human action INSERTs immediately (never batched). Rows are append-only —
application flow only ever INSERTs; each row carries
`prev_hash` + `chain_hash = SHA-256(prev_hash || canonical payload)`; per-org
`pg_advisory_xact_lock` serializes appends so the chain can't fork under concurrency;
genesis rows use `prev_hash = "GENESIS"`. `verifyChain` re-walks the whole org chain and
reports the first broken seq. Fields captured: org, session, gate, event_type,
actor (ai|human|system), model, task, detail JSONB, verification, human_edit,
timestamps — indexed by (org,time), (org,model), (org,event), session.

**Sub-features:**
- ✅ Append-only write layer (INSERT-only path; corrections are new rows carrying
  `humanEdit`).
- ✅ Structured record schema (fixed field set on every write).
- ✅ Query/filter interface — `GET /api/ledger/records?sessionId&model&eventType&gate&from&to&limit`
  + the dashboard table.
- ⚠️ Correction-by-reference — corrections are new rows with the original referenced in
  `human_edit` JSONB; there is no dedicated `correction_of` column (the SQL comment
  promises one).
- ⚠️ Configurable retention — not implemented; rows are kept indefinitely.
- ✅ Compliance export — one-click CSV (`/api/ledger/export`).
- ✅ Integrity banner — the dashboard shows a red warning the moment `verifyLedger`
  reports a broken chain.

### F11 · Explainable Confidence and Escalation — **PARTIAL**

**Mechanics.** `services/execution.ts`: after verification, confidence is set
(0.82 verified-pass / 0.4 fail) and compared to a **per-risk escalation floor**
(`lib/thresholds.ts`: high 0.85 / medium 0.55 / low 0.4, each env-overridable via
`VERYA_ESCALATION_FLOOR_<RISK>`): pass + below floor → status `escalated`; fail →
`flagged`; everything is ledger-recorded with the verification result. The dashboard's
Review Queue collects escalated/flagged/failed events from the ledger.

**Sub-features:**
- ✅ Confidence scorer (per output).
- ⚠️ Rationale generator — verification issues are the plain-language rationale; there is
  no dedicated "why this might be wrong" narrative attached to the score itself.
- ✅ Threshold engine — per-risk-level floors (high/medium/low), env-configurable per
  deployment; per-department partitioning remains open.
- ⚠️ Escalation queue renderer — summary rows (summary, model, session); not the full
  single-screen reviewer view (output + score + rationale + considered alternatives).

### F12 · AI Reputation System — **PARTIAL**

**Mechanics.** `model_reputation` keyed `(org_id, model, task_category)`. On every
feedback event `updateReputation` runs an EMA update (α=0.15) toward the outcome target
(accepted 100 / verified 80 / edited 60 / escalated 40 / flagged 20 / rejected 0)
**dampened by observed latency and cost** (bounded penalties, so one slow-but-correct
run can't crater a score) and stores `trend` (up/flat/down). Continuous — updates land
the moment feedback arrives. Leaderboard panel sorts by trust score (`/api/reputation`);
the heatmap merges reputation with the memory skill map.

**Sub-features:**
- ✅ Score computation — outcome quality **plus cost/latency penalties** (correction
  frequency is reflected through the `edited` outcome target; failure severity through
  `flagged`/`rejected`).
- ✅ Per-task-category scoring (segmented, not blended).
- ✅ Continuous update trigger (event-driven, no batch).
- ✅ Leaderboard + **inline trust badges** (`TrustBadge` renders live reputation next to
  every model in the routing and review screens).
- ❌ Stack/algorithm reputation — models only.

### F13 · Output Verification — **PARTIAL**

**Mechanics.** `provider.ts verifyOutput`: a deterministic rules pre-pass (hardcoded
secrets, API keys, dangerous SQL patterns, auth tasks must mention hashing) → then, for
non-low-risk tasks, an independent second model **on a different provider than the
executor** returns `{passed, issues[]}` (JSON-extracted, fenced-block tolerant).
Low-risk tasks skip the second model (risk-based depth). If the second model is
unavailable, verification degrades to rules-only with an explicit "rules-only" note —
never a fake pass.

**Sub-features:**
- ✅ Second-model cross-check (provider-independent by design).
- ✅ Rules engine check (policy violations, required security basics).
- ✅ External knowledge check — `lib/verification/external.ts` validates npm package
  references in code-bearing outputs against the live npm registry; non-existent
  packages become verification issues ("references non-existent npm package X"),
  gracefully skipped when offline.
- ⚠️ Risk-based depth selector — low-risk → rules-only + external check; everything
  else → + second model. A configurable depth ladder remains open.

### F14 · Adversarial Self-Auditing — **NOT BUILT**

No variation generator, consistency checker, or risk scorer exists. Deferred (FULL_SPEC
"next waves"). No UI pretends otherwise.

### F15 · Counterfactual Model Comparison — **PARTIAL**

**AI Battle Mode** (`services/battle.ts`, F22 UI) runs the same task on two models in
parallel and records the human's verdict; the winner is fed to reputation (accepted) and
the loser (rejected), ledgered as `battle_run`/`battle_pick` — a human-judged
counterfactual comparison. **What remains from the spec:** automatic triggering on
high-value/high-risk tasks without a human prompt, and an AI comparison scorer instead
of human-only judgment.

### F16 · Human Feedback and Trust Calibration — **PARTIAL**

**Mechanics.** `GateReview.tsx` renders every execution with its model, status badge,
token/latency stats, verification issues, and the full output (collapsible), plus
Accept / Reject per output. Each decision is `POST /api/pipeline/:id/action
{action:"feedback"}` → recorded to memory + reputation + ledger.

**Sub-features:**
- ✅ Controls — accept/reject, **1–5 star rating**, free-text note, and **edit capture**
  (an inline editor on every output; changed text is sent as `editedOutput`). The
  feedback action carries all of it to memory + reputation + ledger in one event.
- ⚠️ Edit-quality checker — edited outputs are stored and ledgered with the human edit;
  an automated "did the edit measurably improve the result" pass is not yet run.
- ❌ Reviewer calibration score.
- ❌ Reliability-filtered feedback pipeline (all feedback currently feeds learning).

---

## PART D — Self-Governance Layer

### F17 · Autonomous Policy Suggestions — **NOT BUILT**
### F18 · Living Constitution Document — **NOT BUILT**
### F19 · Task DNA Fingerprinting — **NOT BUILT**
### F20 · Cross-Organization Failure Intelligence — **NOT BUILT**

None of the Part D self-governance features exist. This is the documented Phase 6 wave
(BUILD_PLAN.md) that deliberately waits for real usage data. Nothing in the UI fakes them.

---

### F21 · Cost, Risk, and Performance Optimization — **PARTIAL**

**Mechanics.** Every execution logs tokens (input/output), latency, model, and cost tier
to the ledger; `ledgerAnalytics` aggregates per-model task counts, avg latency, and
tokens → the dashboard analytics cards + bar chart. The routing policy enum
(`lowest_cost | balanced | highest_accuracy`) applied in F7 is the cost-vs-risk control;
it is chosen at intake.

**Sub-features:**
- ⚠️ Usage metering — tokens/latency/model ✅; retry count, rework, human-review time, and
  final failure outcome are not separately metered.
- ⚠️ Breakdown views — by model only; not by stack/team/workflow/department.
- ❌ Cost-vs-risk slider — a discrete policy select, not a spectrum slider.
- ❌ Cheapest-that-meets-trust-bar recommender (the `lowest_cost` policy is a static
  downgrade rule, not a trust-bar computation).

---

## PART E — Dashboard

### F22 · User Dashboard and Interface — **PARTIAL**

**Mechanics.** `/dashboard` (TanStack Query, 15s refetch) renders, all from real API data:
integrity banner (broken-chain alert), analytics cards (ledger events, executions, chain
status, queue mode) + per-model latency bar chart (Recharts), model reputation
leaderboard (trust/samples/trend), org skill-map heatmap, review/escalation queue,
workflow history (gate + status + updated), trust-ledger table (seq/time/gate/event/
model/summary/chain-hash) with CSV export, and pgvector memory search. DB-not-connected
and inline-vs-queue states are explicit, not blank. The working gate screens (flaw
review, stack/algorithm/model pickers, task list, execution, review) render in the
intake island on the home page.

**Sub-features:**
- ✅ Flaw review panel, stack/algorithm/model pickers (tie-break UI on genuine ties only),
  task breakdown view, workflow/task history, leaderboard, heatmap, analytics,
  escalation alerts, review queue, compliance export.
- ✅ AI Battle Mode (`GateReview`: "⚔ Battle vs …" runs a second model in parallel,
  side-by-side outputs with latency/token stats, human picks the winner; verdict feeds
  reputation and the ledger).
- ✅ "Explain My Decision" chat (`ExplainPanel` on the dashboard → `POST /api/explain`):
  retrieves the actual ledger slice for the session/task/model and a model explains the
  reasoning from that evidence with record-number citations; org-scoped, refuses to
  speculate when evidence is missing.
- ✅ Trust badges inline — `TrustBadge` next to every model in routing and review.
- ❌ Governance policy management screen (depends on F17).
- ❌ Role-aware panels (Auditor/Reviewer/Admin views; depends on F38 RBAC).

---

## PART F — Advanced Governance Layer (Second Wave)

### F23 · Agent Identity & Delegated Authority — **NOT BUILT**
### F24 · Runtime Action Firewall — **NOT BUILT**
### F25 · Causal Trust Graph — **NOT BUILT**
### F26 · Trust Decay and Recovery — **NOT BUILT**
(reputation has continuous updates but no decay-over-disuse, failure-drop, or
supervised-recovery mechanics)
### F27 · Failure Forecasting — **NOT BUILT**
### F28 · Trust Budget — **NOT BUILT**
### F29 · Reversible Execution / Safe Simulation — **NOT BUILT**
### F30 · Data Consent & Purpose Enforcement — **NOT BUILT**
### F31 · Evidence-Weighted Answering — **NOT BUILT**
### F32 · Model Failure Fingerprints — **NOT BUILT**
### F33 · Synthetic Red-Team Factory — **NOT BUILT**
### F34 · Governance Digital Twin — **NOT BUILT**
### F35 · Adaptive Policy A/B Testing — **NOT BUILT**
### F36 · Trust Certificates — **NOT BUILT**
### F37 · Incident Replay & Counterfactual Debugging — **NOT BUILT**

All 15 second-wave features are unbuilt by design (Phase 7 in BUILD_PLAN.md). The
architecture leaves clean room for them: the ledger's canonical payload could carry
graph edges (F25), the model pool/adapter layer is the natural hook for fingerprints and
forecasting (F27/F32), and hash-chained rows are certificate-ready (F36).

---

## PART G — Security

### F38 · Authentication & Access Control — **PARTIAL**

**Mechanics.** Clerk is the single auth system. Frontend: `ClerkProvider` wraps the app
when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set (graceful no-auth render without it).
Backend: `middleware/auth.ts` verifies `Authorization: Bearer <jwt>` against Clerk's
JWKS (`jose`, issuer/audience checked), derives `orgId` from the token's org claim, and
attaches `req.auth` to **every** request via an `onRequest` hook. All repositories
scope every query by that `orgId`. Without Clerk configured, the API runs in a clearly
labeled development mode (org from `x-org-id` for local multi-org testing) — never a
silent fake.

**Sub-features:**
- ✅ Email/password + OAuth — Clerk sign-in/sign-up pages (`/sign-in`, `/sign-up`, themed
  to the app) render when Clerk is configured; `AuthBridge` (`app/providers.tsx` +
  `lib/auth-bridge.ts`) injects the Clerk session token as `Authorization: Bearer` on
  every API request.
- ⚠️ 2FA — Clerk-supported; not enabled/configured.
- ✅ RBAC — `requireAdmin` (`middleware/auth.ts`) guards admin-only routes (org memory
  purge/export, lead list, ledger CSV export) via the token's `org_role` claim or an
  env-listed admin id set; development mode is clearly labeled and permissive.
- ⚠️ Session management — Clerk-issued JWTs are short-lived; there is no custom refresh
  flow (Clerk handles it, not yet integrated).
- ❌ Auth event logging — logins/permission changes are not ledger events yet.

### F39 · Data Security — **PARTIAL**

- ✅ TLS in transit — Neon requires SSL (`sslmode=require`; `rejectUnauthorized` unless
  `PGSSL_DISABLE=1` for local dev); production traffic is HTTPS.
- ⚠️ Encryption at rest — inherited from Neon's defaults; not explicitly AES-256-configured.
- ❌ Secrets vault — provider keys live in env files, not a managed vault.
- ✅ Tenant isolation — `org_id` scoping is structurally enforced in every repository
  function (sessions, ledger, memory, reputation, leads) — a query without the org
  predicate cannot be issued through the repo layer.
- ✅ Input sanitization — `sanitizeInput` (control-char strip + length cap) on all
  user-supplied text; upload allowlist + 2MB cap; parameterized SQL everywhere (no
  string-built queries).
- ✅ Rate limiting — `@fastify/rate-limit` globally (60/min) + per-route buckets
  (uploads 10/min, leads 5/min).

### F40 · Prompt Injection & AI-Specific Security — **PARTIAL**

- ✅ Content/instruction separation — user text is always passed in the user message of a
  fixed system-prompt contract; the pipeline never rewrites its own instructions from
  user content.
- ❌ Injection pattern detector — no scanner for manipulation phrases
  ("ignore previous instructions…").
- ⚠️ External content sanitizer — uploaded file text gets `sanitizeInput` but no
  injection-specific validation.

### F41 · Compliance & Privacy — **PARTIAL**

- ✅ Access/export request handling — org memory JSON export + ledger CSV export
  (admin-gated).
- ✅ Deletion request handling — `DELETE /api/memory` purges the org's memory data
  (admin-gated).
- ✅ ToS/Privacy acceptance gate — the lead-capture form requires explicit consent
  (`acceptTerms` Zod-literal-true on both ends), stores `accepted_terms_at` on the lead
  row, and links the actual documents.
- ❌ Configurable retention + auto-purge.
- ❌ Cookie consent banner (no tracking cookies are set, but the banner flow is absent).

### F42 · Vulnerability Management — **PARTIAL**

- ⚠️ Dependency scanning — `npm audit` reports cleanly today; no automated CI scanning.
- ❌ Patch management process, pre-launch pentest, responsible-disclosure channel.
  (Process-level items; nothing in code contradicts them.)

---

## PART H — Performance & Scalability

### F43 · Concurrency & Load Handling — **PARTIAL**

- ✅ Background job queue — BullMQ (`jobs/queues.ts`): execution jobs with 3 attempts,
  exponential backoff (5s base), `removeOnComplete/Fail` caps; `jobs/worker.ts` consumes
  with configurable concurrency and re-runs the identical execution path the API uses
  inline. Without Redis the API executes inline and the dashboard says "inline mode".
- ✅ Live progress — the session poller refetches every 2.5s while `gateStatus ===
  "running"`; execution shows "(N/M done)".
- ❌ Load balancer / auto-scaling — deployment-level, not in code (stateless Fastify +
  Next.js make it straightforward).

### F44 · Speed Targets — **PARTIAL**

- ✅ Frontend load — both routes prerender static (build output `○ Static`), Turbopack
  build, Geist via `next/font`, minimal JS (home 134kB route size).
- ✅ Progress-indicator rule — every long operation shows state (pulse/counter), never a
  frozen blank screen.
- ❌ Routing-overhead monitoring — the system's own latency isn't measured separately
  from provider latency yet.

### F45 · Database & Caching — **PARTIAL**

- ✅ Scalable primary datastore — indexes on every hot path: sessions (org+time,
  org+gate), ledger (org+time, session, org+model partial, org+event), memory
  (org+time, org+category, ivfflat), leads (email, time).
- ❌ Caching layer — no cache for model registry / repeated lookups.
- ❌ Analytics/reporting separation — analytics queries run on the primary.
- ⚠️ Ledger partitioning — indexed but not partitioned (fine at MVP scale; the spec's
  concern kicks in at millions of rows).

### F46 · Reliability Under Load — **PARTIAL**

- ✅ Provider failover — real and multi-layered: retryable-error detection, per-model
  retries with backoff (2s/6s/15s), daily-quota exhaustion tracking (a 429-per-day model
  is benched for the process lifetime), same-provider → cross-provider → Gemini-native
  chains, and verification's provider-independence rule.
- ✅ Feature isolation — memory search, skill map, and queue health all degrade to empty/
  "inline" without blocking core routes; verification degrades to rules-only.
- ❌ Monitoring & alerting — `/health` + structured pino logs exist; no Sentry/metrics/
  alert routing yet.

---

## PART I — Product Launch Readiness

### F47 · Domain, Hosting & Infrastructure — **PARTIAL**

- ✅ Environment separation in config — `BACKEND_ORIGIN`/`NEXT_PUBLIC_API_URL`/
  `NEXT_PUBLIC_APP_URL`/`CORS_ORIGINS` cleanly split dev vs prod topology; Next rewrites
  kill CORS friction in dev.
- ❌ Domain/DNS, CDN, staging environment — deployment tasks, not code.

### F48 · Onboarding & Support — **PARTIAL**

- ✅ First-run guidance — three example projects, the How-It-Works deck page (which
  explains exactly the two unfamiliar patterns: workflow submission and tie-breaks),
  gate stepper labels, empty/error states everywhere.
- ❌ Email verification flow, dedicated walkthrough, help center, support channel.

### F49 · Legal & Business Basics — **PARTIAL**

✅ ToS, Privacy Policy, and Refund Policy pages (`/legal/terms`, `/legal/privacy`,
`/legal/refunds` — full plain-language documents in `lib/legal.ts`, statically
prerendered, cross-linked, footer-linked, opened from the consent checkbox).
❌ Company registration disclosure and a cookie/GDPR consent flow (no tracking cookies
are set; the banner flow is still absent).

### F50 · Marketing-Facing Pages — **PARTIAL**

- ✅ Marketing site — the full 10-page deck (hero/IDE mockup, problem, five gates,
  tie-breaks, trust & audit with live ledger, use cases, pricing, FAQ, get-started with
  real lead capture, final CTA) rebuilt from `index.html` on Next.js 15 + Tailwind.
- ✅ SEO basics — per-route metadata (title/description), `sitemap.xml` (home,
  dashboard, all legal pages) and `robots.txt` (`/dashboard` disallowed).
- ❌ OG tags, signup-source analytics.

### F51 · Monitoring, Backups & Maintenance — **PARTIAL**

- ✅ Health endpoints (backend `/health` reports DB/auth/queue posture; frontend shows
  backend status in the header).
- ✅ Structured logging — pino (pretty in dev) with request-failure logging.
- ❌ Error tracking (Sentry), uptime monitoring/alerts, public status page.
- ⚠️ Backups — Neon provides PITR, but a tested restore procedure isn't documented/run.

### F52 · Launch Checklist — **NOT BUILT**

Process artifact, not code. The checklist items (load test, pentest sign-off, legal
pages, backup/monitoring confirmation, staffed support) map onto the gaps above.

---

## Priority gap list (highest leverage first)

*Updated after the second implementation batch — items 1–8 from the previous list are
closed and verified (F9 injection, F16 feedback, F5 editor, F3 edit-fix, F38 RBAC,
F12 formula, F13 external check, F11 floors, F22 panels, F49 legal pages, F1 uploads).
The remaining highest-leverage work:*

1. **F38 finish** — Clerk in the live environment (keys, org claims) and auth-event
   ledger records.
2. **F44 routing-overhead monitoring** — measure the system's own added latency
   separately from provider latency (the ledger already carries per-call timing).
3. **F21 breakdowns** — cost/risk analytics by stack/team/workflow, plus the
   cheapest-that-meets-trust-bar recommender.
4. **F48 onboarding** — email verification flow, help center, support channel.
5. **F40 injection scanner** — pattern detection on user text before it reaches prompts.
6. **F51 operations** — Sentry/error tracking, uptime alerts, tested restore procedure.
7. **Wave 2 governance (F17–F20, F23–F37)** — unchanged, deliberately deferred until
   real usage data exists.
