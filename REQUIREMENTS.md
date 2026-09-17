# Verya — Requirements (MVP build in progress)

> Companion files: `STACK.md` (locked stack), `BUILD_PLAN.md` (phases), `CONTENT.md` (copy),
> `ANALYSIS.md` (base UI analysis). Base visual reference: `index.html`.

## R1 — Entry & Workflow Intake (Landing page)

- Single **chat-style input page** like GPT / Claude / Lovable / Emergent — one box; user pastes or types the whole thing.
- User gives the **entire project details + the workflow they have in mind** (freeform text, or uploaded doc/plan — upload can come later).
- Must accept a **full project description even if messy, incomplete, or unstructured** — **no forced form fields**.

## R2 — AI engine policy

- **Use the Gemini API key alone for all AI work for now.**
- The user is building **separate ML models** for the pipeline components; they will be integrated later. So every AI component must sit behind a **provider/model adapter interface** so the custom ML can replace Gemini per-component without touching the pipeline.

## R3 — Decision pipeline (the core intelligence)

The system dynamically chooses the pipeline based on what the user gives.

### Case A — User gives only a requirement
```
Requirement → Workflow Understanding → Task Decomposition → Workflow Flaw Detection
  → Stack already given? NO → STACK RECOMMENDATION → human approves/edits
  → ALGORITHM RECOMMENDATION → human tie-break if needed
  → MODEL SELECTION → EXECUTE
```

### Case B — User already gives the stack
```
User Stack → Validate Stack → Workflow Decomposition
  → per task: Algorithm Recommendation → AI Model Recommendation → Execute → Verify
```

### Conditional rules
- **Stack:** IF user provides stack → validate/use it. ELSE → recommend stack.
- **Algorithm:** IF one approach clearly superior → auto-select. ELSE → human tie-break.
- **Model:** IF one model clearly superior → auto-select. ELSE → human tie-break.

**Principle:** *Verya automates decisions when evidence is sufficient and delegates decisions to humans when evidence is genuinely ambiguous.*

Formal sequence: `Requirement → Workflow → Stack → Algorithm → AI Model → Execution → Verification → Feedback`.

### Model architecture (future — for context)
8 planned components: Workflow Understanding (LLM), Flaw Detection (LLM+rules), Stack Recommendation (ranking+LLM), Algorithm Recommendation (ranking+KB), AI Model Selection/Router (ranking ML), Failure/Risk Prediction (XGBoost/LightGBM), Output Verification (LLM ensemble+rules), Reputation/Trust (statistical/ML). Supporting engines (policy, ledger, cost calc, memory, audit) are deterministic system components, not ML.

### MVP Phase 1 — build 4 AI components
1. Workflow LLM (understanding + decomposition)
2. Flaw Detection
3. Stack + Algorithm Recommendation
4. Model Router

…surrounded by deterministic engines (policy, trust ledger, cost calculator, memory, audit). Later ML (failure predictor, trust/reputation, cost/performance predictor) trains on Verya's own operational data.

**MVP note (this build):** with Gemini-only access, the "Model Router" routes between Gemini variants (e.g. `gemini-2.5-pro` for complex reasoning vs `gemini-2.5-flash` for simple/high-volume tasks) using deterministic confidence thresholds; execution is not started in the MVP intake — the pipeline stops after model selection with the full decision record.

## Status

- [x] Requirements captured (this file)
- [x] Next.js 15 scaffold (App Router, TypeScript, Tailwind)
- [x] Chat-style intake page (R1)
- [x] Gemini adapter + pipeline (R2, R3)
- [x] **Full Phase-1 gated pipeline (see FULL_SPEC.md):** suitability gate, flaw gate with
  per-flaw accept/reject, stack validate/recommend with tie-breaks, task editing,
  algorithm gate, model gate, execution, second-model + rules verification,
  trust ledger (hash-chained, append-only), org memory + skill map, reputation scores,
  feedback loop, dashboard with leaderboard/analytics/compliance export
- [ ] Upload doc/plan support (later)
- [ ] Separate ML integration (later — `StageAdapters` interface in
  `verya/lib/pipeline/provider.ts` is the swap point)

## Run it

```bash
cd verya
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

- `/` — the gated intake flow
- `/dashboard` — ledger, reputation leaderboard, analytics, compliance export
- API: `/api/pipeline` (start), `/api/pipeline/<id>/action` (gate actions),
  `/api/pipeline/<id>/execute`, `/api/pipeline/<id>/feedback`, `/api/dashboard`,
  `/api/dashboard/export`
