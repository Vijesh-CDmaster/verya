# Verya — Website Content (Reference)

> Source content for the marketing site, structured by section. **Notes in [brackets]**
> are for the designer, not copy. Companion files: `STACK.md` (stack decision),
> `BUILD_PLAN.md` (build phases). Base visual reference: `index.html`.

---

## Hero Section

- **Eyebrow tag:** For teams shipping with AI
- **Headline:** Before your AI writes a single line, Verya checks if the plan is even good.
- **Subheadline:** Most tools pick a model and hope. Verya reads your whole project, tells you what's wrong with it, picks the right stack and the right model for every piece of it — and shows its work.
- **Primary CTA:** Try it on your next project
- **Secondary CTA:** See how it decides →

[Visual: split screen — left side shows a messy project brief being typed, right side shows flaws lighting up one by one with fixes, then settling into a clean task list]

---

## Section 2 — The Problem (told plainly, not as a "pain point")

**Headline:** You already know this happens.

You write out what you're building. You pick a model because it's the one you always use. Halfway through, you realize you forgot to think about auth. Then the model that's great at writing your API is terrible at your UI, so you switch tools mid-project. Three model subscriptions later, you still can't say for certain which one wrote which part of your product, or why.

None of this is because you're bad at your job. It's because nothing you're using was built to check the plan — it's all built to just start typing.

---

## Section 3 — What Verya Actually Does (the "how it works" walkthrough)

**Headline:** One project. Five decisions. You're in the loop on every close call.

**Step 1 — Tell it what you're building**
Paste your idea, your spec, your half-finished doc, whatever you've got. No forms, no forced structure.

**Step 2 — It finds what you missed**
Verya reads the whole thing as one connected plan, not a checklist. If you didn't mention security, it says so. If two of your steps quietly contradict each other, it catches that too. You get a plain list of what's off, and a fix for each one — you decide what to accept.

**Step 3 — It picks your stack, or checks yours**
Already know your stack? Verya tells you if it's actually a good fit for what you're building. Starting from zero? It suggests one, and tells you why — not just "use Next.js" but why this stack, for this project, at this budget.

**Step 4 — It breaks the work down**
Your approved plan becomes a real task list — build the login flow, wire up the database, animate the landing page — each one small enough to hand off on its own.

**Step 5 — It matches the right model to each task**
Not one model for everything. The model that's strong at UI work builds your animations. The one that's strong at logic handles your backend. When two models are genuinely equally good for a task, Verya doesn't quietly guess — it puts both in front of you and asks.

**Closing line for this section:**
Every one of these decisions gets written down. Not buried in a chat log — in a record you can pull up months later and actually make sense of.

---

## Section 4 — The Editor (product demo section)

**Headline:** Then you build it, right here.

Once the plan's approved, your project opens in a real workspace — file tree on the left, live preview on the right, code running as it's written. Open any file and edit it yourself. Ask for a change and watch it happen. It's the part you'd expect from any AI builder — we just don't let it start until the plan underneath it is solid.

[Visual: screenshot/mockup of the editor — Monaco-style file tree, code streaming in, live preview pane]

---

## Section 5 — Why the tie-breaks matter

**Headline:** When it's a genuine toss-up, we tell you. We don't pretend to know.

A lot of tools will confidently hand you an answer even when there isn't a clearly right one. Two frameworks that do the same job equally well. Two models that are both a fine fit for a task. Most systems just pick one and move on, and you never find out there was a decision to be made at all.

Verya only decides for you when the evidence actually points one way. The rest of the time, it shows you both options, tells you what each one trades off, and lets you choose. It's a small thing. It's also the difference between a tool that guesses and one you can actually trust.

---

## Section 6 — Trust & Audit (for the compliance-minded visitor)

**Headline:** Every decision, on the record.

If someone asks you six months from now why a particular model handled a particular piece of your product, you shouldn't have to reconstruct it from memory or old chat threads. Verya keeps an unbroken record — what was flagged, what you approved, which model ran which task, what it cost, what got changed by hand. Pull a report in one click. Hand it to whoever's asking.

**Supporting row (three columns):**

- **Nothing gets edited, only added.** Your history can't be quietly rewritten, by you or anyone else.
- **Your data stays yours.** What Verya learns about your team's work never touches another organization's.
- **Built for the audit, not just the build.** When "how did we decide that" is a real question at your company, you already have the answer.

---

## Section 7 — Who this is for (light segmentation, no heavy personas)

**Headline:** Built for the people actually shipping the thing.

Three cards:

- **Builders and small teams** — Stop guessing which model to open. Get a plan that's already been checked before you spend a single token on it.
- **Platform and engineering leads** — Finally see which model earns its keep on which kind of task — and stop paying premium prices for work a cheaper model handles just fine.
- **Compliance and risk teams** — A record of every AI decision your org makes, ready before anyone asks for it.

---

## Section 8 — Pricing teaser (short, points to full pricing page)

**Headline:** Start free. Pay for what actually gets used.

Verya routes to the cheapest model that's earned trust for the job — so your bill reflects real work, not a flat fee for a model you didn't need. Try it on one project before you commit to anything.

**CTA:** See plans →

---

## Section 9 — FAQ (a few, written like actual answers, not marketing bullets)

- **Does this replace my usual coding assistant?**
  No — think of it as what runs before and around it. Verya decides what should get built and by which model; the editor is where you actually watch it happen and make changes yourself.
- **What if I already know exactly what stack I want?**
  Tell it. Verya will still tell you if it thinks there's a problem with that choice, but it's your call either way.
- **What happens when it's wrong?**
  Every output gets checked before it reaches you, and you can always reject, edit, or roll back. Nothing here removes your judgment from the loop — it just gives you better information before you use it.
- **Is my project data used to train anything shared across other companies?**
  No. What Verya learns about your work stays with your organization.

---

## Section 10 — Final CTA (footer-adjacent, closing the page)

**Headline:** Give it a real project. See what it catches.

**CTA button:** Start building

Small supporting line beneath: No credit card. First project's on us.

---

## Notes for the designer

- Keep the hero visual doing the explaining — this product is easier to show than describe. A short looping clip of the flaw-review panel lighting up, or the tie-break picker appearing, will do more than another paragraph.
- Avoid stock "AI brain" or "neural network" graphics anywhere on this site. Given what the product actually does (reviewing plans, showing trade-offs, keeping records), the visual language should lean toward things like: checklists, diff views, side-by-side comparisons, a paper trail — not abstract circuitry.
- Section 5 and Section 6 are the real differentiators against Bolt/Lovable/Emergent. Give them more visual weight than a generic features grid — don't let them get lost as two cards in a six-card feature list.
- Testimonials/case studies section is intentionally left out here — drop it in once there are real ones. A placeholder logo row before that ("used by early teams at —") reads better than fabricated quotes.
