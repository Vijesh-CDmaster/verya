# Verya — Full Phase-1 Specification (locked)

> Features 1–53 from the master spec, **excluding payments** (explicitly deferred by the user).
> All features work as one gated pipeline for Phase 1.
> Companion files: `STACK.md`, `BUILD_PLAN.md`, `CONTENT.md`, `ANALYSIS.md`, `REQUIREMENTS.md`.

## The pipeline (gates in order)

```
Intake → Suitability Gate → Flaw Gate → Stack Gate → Task Breakdown Gate
→ Algorithm Gate → Model Gate → Execution → Verification
→ Human Feedback → Trust Update (Memory + Reputation) → Ledger (all along)
```

## Gates & features

### G0 — Entry & Workflow Intake (F1)
- Chat-style single input (like GPT/Claude/Lovable). Freeform, messy, incomplete OK.
- Full project description + intended workflow. Files (PDF/DOCX/TXT/MD) accepted later.
- Output: `WorkflowSubmission` record.

### G1 — Workflow Suitability Check (F2)
- Read the whole project+workflow as one connected thing, not step-by-step.
- Suitable → say so, continue. Not suitable → explain why in plain language + suggest a
  better workflow. **User accepts suggestion or keeps their own; whatever they approve
  becomes `final_workflow`.**

### G2 — Flaw Detection Gate (F3)
- Find what the user did NOT mention (e.g. security nowhere in the text) AND what is wrong
  in what they DID mention (contradictions, missing error paths...).
- Categories: security, architecture, logic, scale, cost, non-functional.
- Each flaw: plain-language explanation + concrete fix. **User accepts/rejects/edits each fix
  one by one. Nothing moves forward until this gate is cleared** (all critical flaws resolved).

### G3 — Stack Gate (F4)
- Stack mentioned → validate it; say if bad fit and why. Not mentioned → suggest one.
- Criteria: accuracy/fit, efficiency, cost management, space, no token wastage, ecosystem
  maturity, team familiarity.
- Cover the full stack: frontend, backend, database, hosting, auth, storage, critical libs.
- Reason for every choice. **Genuine tie → show both side-by-side with trade-offs, ask user.
  User's pick locks in and carries downstream.**

### G4 — Task Breakdown Gate (F5)
- Only after workflow finalized AND stack settled → break into discrete routable tasks
  ("build login API", "design landing animation", "set up DB schema").
- Show list with dependencies/order. **User can edit, merge, split, remove before proceeding.**

### G5 — Algorithm Gate (F6)
- Per task: best approach based on task AND chosen stack (DB connection method, sorting/
  matching strategy, caching approach, auth flow...).
- Clear best → pick with reason. **Tie → show options with trade-offs, ask user.**
- Record choice + reason per task.

### G6 — Model Gate (F7, Smart Task Router)
- Only after algorithm settled → pick the executing AI model per task.
- Considers: accuracy for that task type, cost, latency, context size, historical performance.
- Per-task-type strength profile per model (not one global score).
- Cheap models for simple/low-risk; strong models for complex/high-risk.
- Routing policies: lowest cost / highest accuracy / balanced / org-approved-only.
- **Tie → show qualifying models with why each qualifies; ask. User can always override.
  Every decision shows its reason.**

### F8 — Universal decision rule at every gate
- Clear winner → auto-decide, but always show reason.
- Genuine tie → never pick silently; always ask the user.
- Never fake confidence the data doesn't support.

## Learning, Trust & Verification (MVP items 7–13)

- **F9 Memory Engine**: store every AI interaction + outcome (accepted/edited/rejected/
  escalated); private org skill map; vector search of similar past tasks when routing;
  strict per-org isolation; export + deletion on request.
- **F10 Trust Ledger**: append-only; captures user+org, task, model, prompt+context, output,
  verification result, human edits, final decision, timestamp, version. Queryable by
  workflow/user/model/task type/date/outcome. Corrections = new linked entries. One-click
  compliance/audit export. Retention configurable.
- **F11 Explainable confidence & escalation**: confidence score + plain-language why for every
  output; surface uncertainty/missing info/risk; escalate below threshold or for high-impact
  tasks regardless; thresholds configurable per department/workflow type; escalated items show
  everything needed to decide fast.
- **F12 Reputation system**: living trust scores per model (and stack/algorithm) from accuracy,
  acceptance rate, correction frequency, failure severity, cost, latency; separate per task
  category; continuous updates; leaderboard + badges.
- **F13 Output verification**: cross-check every output (second model / rules engine / external
  knowledge); detect contradictions, unsupported claims, missing fields, policy violations,
  hallucinations; depth configurable by task risk.
- **F16 Human feedback & calibration**: accept/edit/reject/rate any output; track whether edits
  improved results; reviewer consistency measured; feed only reliable feedback into routing.

## Deferred (after MVP has usage data)
F14 adversarial self-audit, F15 counterfactual comparison, F17–F37 advanced governance,
F48 payments. Security/infra/compliance requirements (F38–F53) apply as the build grows:
auth, tenant isolation, TLS, encryption at rest, secrets vault, input sanitization, rate
limiting, prompt-injection defense, DPDP/GDPR readiness, backups/monitoring, launch checklist.
