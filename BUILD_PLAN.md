# Verya — Build Plan (with in-browser AI code editor, like Bolt / Lovable / Emergent)

> Companion files: `STACK.md` (approved tech stack — where they conflict, STACK.md wins),
> `CONTENT.md` (website copy). Base visual reference: `index.html`.

## 0. What "editor like Bolt/Lovable/Emergent" actually means technically

Those tools all share the same core loop, and Verya needs to replicate it before any
governance feature makes sense:

```
User prompt/workflow → AI generates code → code streams into a live file tree
→ code runs in an in-browser sandbox → live preview updates → user chats to iterate
→ user can open any file and hand-edit it → changes sync back into the AI's context
```

So "the editor" isn't one feature — it's four things working together:

1. **File tree + code editor** (Monaco, same editor VS Code uses).
2. **In-browser runtime/sandbox** that actually executes the generated code
   (WebContainers — what Bolt uses — or a container-per-session backend
   like Emergent/Replit style).
3. **Live preview pane** (iframe pointed at the running sandbox).
4. **Streaming AI agent** that writes/edits files turn by turn, with diffs shown before applying.

Everything from the 53 requirements (flaw detection, stack picking, algorithm/model routing,
trust ledger, etc.) sits around this loop — it decides what the agent builds and which
model builds it, but the editor+sandbox is the execution surface.

### Layout of the editor shell

- **Left panel:** Chat/intake — where the user pastes the project + workflow.
- **Center panel:** A live "build canvas" — workflow diagram, flaw list, stack picker,
  task breakdown, routing decisions as they resolve, and eventually generated
  code/config, all updating in real time as Verya works.
- **Right panel / tabs:** A real code editor (Monaco) with file tree — for viewing/editing
  any code Verya generates per task, plus a live preview pane (iframe) for the running app.
- **Bottom/side:** Terminal/logs pane showing routing decisions, model calls, and the
  trust ledger stream live.

This editor is not a separate product bolted on later — it's the delivery surface for
almost every feature (1, 2, 3, 5, 6, 7, 15, 22, 43–46 all render through it). So it's
built early, in Phase 1, as thin as possible, then thickened over time.

## 1. Recommended Tech Stack

> ⚠️ Superseded by `STACK.md` for the website: Next.js 15 replaces Vite; Fastify/Express
> replaces NestJS; Neon PostgreSQL replaces plain Postgres. Items below marked
> *(editor feature only)* are decided when that feature is built.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend app | React + TypeScript, Tailwind | Standard, fast to iterate → **build as Next.js 15 per STACK.md** |
| Code editor | Monaco Editor *(editor feature only)* | Same as VS Code, free, embeddable |
| In-browser sandbox | WebContainers (StackBlitz) for Node/web projects; fallback to server-side Docker/Firecracker microVMs *(editor feature only)* | WebContainers = instant, no server cost, runs in-browser. Docker/Firecracker needed for Python/Go/other stacks |
| Live preview | Iframe bound to sandbox dev server URL | Same pattern as Bolt/Lovable |
| Backend API | Node.js (NestJS) or Python (FastAPI) → **Fastify/Express per STACK.md** | Pairs well with TS frontend |
| Agent orchestration | LangGraph or a custom state machine (not a black-box framework) | Fine control over the flaw-gate → stack → algorithm → model pipeline |
| Model access | Anthropic, OpenAI, Gemini APIs via a unified adapter layer | Multi-model routing is core to Verya |
| Vector DB | Pgvector (Postgres) or Qdrant → **pgvector on Neon per STACK.md** | Org memory / similarity search |
| Primary DB | PostgreSQL → **Neon PostgreSQL per STACK.md** | Ledger, users, orgs, projects |
| Ledger storage | Append-only Postgres table + periodic hash-chaining (or a proper immutable log like AWS QLDB) | Needed for FR-LED requirements |
| Queue | Redis + BullMQ (or SQS) | For async flaw detection, verification, sandbox provisioning |
| Auth | Auth.js / Clerk / Supabase Auth | Don't build auth from scratch |
| File storage | S3-compatible object storage | Generated project files, exports |
| Infra | AWS/GCP, containers on ECS/GKE, autoscaling groups | Matches NFR-SCL and NFR-AVL requirements |
| Monitoring | Sentry (errors) + Grafana/Prometheus or Datadog (metrics) | Required for launch checklist |
| Payments | Stripe (or Razorpay for India) | Required for #48 |

## 2. High-Level Architecture (adds the editor to the earlier core-architecture table)

| Layer | Responsibility |
| --- | --- |
| Landing/Marketing site | Public pages, pricing, signup (feature #51, #50) |
| API Gateway | All requests, auth, rate limiting |
| Workflow Orchestrator | Suitability check → flaw gate → task breakdown |
| Stack Advisor | Validates/suggests stack, handles ties |
| Algorithm Selector | Picks approach per task, handles ties |
| Task Router | Picks model per task, handles ties |
| Agent Runtime | Streams code generation into files, manages multi-turn edits |
| Sandbox Manager | Spins up WebContainer or backend container per project session, tears down on idle |
| Editor Service | Serves file tree, diffs, Monaco sync, handles manual user edits |
| Model Adapter Layer | Connects to all AI providers |
| Memory Engine | Org-specific embeddings/history |
| Verification Engine | Output checking |
| Trust Ledger | Immutable record store |
| Policy Engine | Rules, escalation, compliance |
| Analytics Engine | Cost, performance, reputation |
| Admin Dashboard | All the panels from feature #22 |
| Billing Service | Stripe/Razorpay integration |
| Notification Service | Email/in-app alerts (escalations, build status) |

## 3. Phased Build Plan

### Phase 0 — Foundation (weeks 1–4)

Nothing else works without this.

- Auth, org/tenancy model, RBAC (#38, #39).
- Base API gateway, DB schema, secrets vault.
- CI/CD pipeline, dev/staging/prod environments (#47).
- Landing/marketing shell + signup flow (#49, #51).
- Legal pages: ToS, Privacy, Refund (#50).

**Exit criteria:** a user can sign up, log in, see an empty dashboard, org isolation verified.

### Phase 1 — Core Intake & Editor Loop (weeks 4–10)

This is the "make it feel like Bolt/Lovable" phase — get something demoable fast.

- Landing chat-style input page (#1).
- Basic single-model code generation (no routing intelligence yet — just call one model).
- Monaco file tree + editor (#0 editor requirement).
- WebContainer sandbox + live preview iframe.
- Streaming generation with diff-before-apply.
- Manual file editing synced back to agent context.

**Exit criteria:** user types a project idea, gets a working generated app, can see/edit
code, see it run live. This is the demo-able skeleton everything else attaches to.

### Phase 2 — Intelligence Gate (weeks 10–16)

Now add the governance-before-generation layer.

- Workflow suitability check (#2).
- Flaw detection engine + accept/reject panel (#3).
- Stack Advisor with tie-break UI (#4).
- Task breakdown view with dependencies (#5).
- Algorithm Selector with tie-break UI (#6).
- Smart Task Router — multi-model routing with tie-break UI (#7).
- The universal tie-break rule enforced everywhere (#8).

**Exit criteria:** submitting a project now goes through suitability check → flaw review →
stack pick → task breakdown → algorithm pick → model pick, before the agent starts
generating code in the Phase-1 editor.

### Phase 3 — Trust & Verification (weeks 16–22)

- Organization-Specific Memory Engine (#9).
- AI Trust Ledger (#10).
- Explainable Confidence and Escalation (#11).
- AI Reputation System (#12).
- Output Verification (#13).
- Cost/latency/accuracy analytics (#14 partial, #21).
- Basic admin dashboard (#22 core panels).
- Compliance/audit export (#10 export piece).

**Exit criteria:** every generation is scored, logged immutably, and can be exported as an
audit report; models start earning/losing trust per task type.
→ **This is your real MVP. Ship/pilot here before Phase 4.**

### Phase 4 — Security, Scale, Reliability (weeks 22–28)

Build this before wider rollout, not after.

- Full security hardening: input sanitization, prompt-injection defenses, rate limiting (#40, #43 partial).
- Auto-scaling infra, load balancer, queue-based heavy processing (#43, #44).
- DB scaling + caching layer, analytics DB separated from live DB (#45).
- Failover between AI providers, monitoring/alerting (#46).
- Penetration test + vulnerability scan (#42).
- Load testing against target concurrent-user numbers (#53).

**Exit criteria:** system holds up under simulated concurrent load without lag; security review passed.

### Phase 5 — Advanced AI Quality Features (weeks 28–34)

- Adversarial Self-Auditing (#14).
- Counterfactual Model Comparison (#15).
- Human Feedback and Trust Calibration (#16).
- Cost/Risk/Performance Optimization dashboard (cost-vs-risk slider) (#21 UI).
- Remaining dashboard panels: skill-map heatmap, AI Battle Mode, "Explain My Decision" chat (#22 remaining).

### Phase 6 — Self-Governance Layer (weeks 34–42, only after real usage data exists)

- Autonomous Policy Suggestions (#17).
- Living Constitution Document (#18).
- Task DNA Fingerprinting (#19).
- Cross-Organization Failure Intelligence (#20) — needs multiple paying orgs first.

### Phase 7 — Agentic Governance Layer (weeks 42+, second wave)

The five features flagged as most novel — build in this order:

1. Agent Identity and Delegated Authority (#23).
2. Runtime Action Firewall (#24).
3. Causal Trust Graph (#25).
4. Trust Decay and Failure Forecasting (#26 + #27).
5. Governance Digital Twin (#34).

Then, as capacity allows: Trust Budget (#28), Reversible Execution/Safe Simulation (#29),
Data Consent Enforcement (#30), Evidence-Weighted Answering (#31), Model Failure
Fingerprints (#32), Synthetic Red-Team Factory (#33), Adaptive Policy A/B Testing (#35),
Trust Certificates (#36), Incident Replay (#37).

### Phase 8 — Commercial Launch Readiness (parallel track, weeks 30–36)

Run alongside Phase 4–5, not after everything else:

- Pricing page + plan tiers (#48).
- Payment gateway integration + billing dashboard.
- Free trial/freemium tier.
- Onboarding walkthrough (#49).
- Help center/docs, support widget.
- Automated backups + tested restore (#52).
- Status page, uptime monitoring (#52).
- Full launch checklist sign-off (#53): load test, pentest, legal pages, payment flow
  tested end-to-end, backups/monitoring confirmed, support staffed.

## 4. Suggested Team Shape

| Role | Count | Focus |
| --- | --- | --- |
| Full-stack engineers | 3–4 | Editor, sandbox, dashboard |
| Backend/infra engineer | 1–2 | Router, ledger, scaling, security |
| AI/ML engineer | 1–2 | Routing logic, verification, memory engine, prompts |
| DevOps/SRE | 1 | Infra, monitoring, load testing, launch checklist |
| Product/design | 1 | Editor UX, dashboard UX, tie-break flows |
| QA/security | 1 (can be part-time/contract) | Pentest, load test coordination |

## 5. Fastest path to a demoable product

If the goal is to show something working as soon as possible: **Phase 0 → Phase 1 first**,
skip straight to a working chat-to-app-with-editor demo using a single hardcoded model,
no governance yet. That's the Bolt/Lovable-equivalent skeleton. Layer Phase 2 (the flaw
gate, stack/algorithm/model tie-breaks) on top of it — that's what turns "another AI app
builder" into Verya specifically. Everything from Phase 3 onward is what makes it
defensible against Bolt/Lovable/Emergent, since none of them do workflow flaw review or
multi-model trust routing today.
