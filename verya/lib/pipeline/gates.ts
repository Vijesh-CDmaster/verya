// Verya — gate engine: advances the session through the gated pipeline.
// Runs AI stages, applies human gate actions, enforces the universal decision rule (F8),
// and appends every decision to the Trust Ledger (F10).

import type {
  GateAction,
  PipelineSession,
  StackCandidate,
  StackProposal,
  StackValidation,
  Workflow,
} from "./types";
import { needsTieBreak, CHEAP_MODEL_ID, STRONG_MODEL_ID } from "./types";
import type { StageAdapters } from "./provider";
import { recordToLedger } from "../store/ledger";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

/** Kick off AI processing for the current gate. */
export async function processGate(
  session: PipelineSession,
  adapters: StageAdapters
): Promise<PipelineSession> {
  switch (session.gate) {
    case "suitability":
      return runSuitability(session, adapters);
    case "stack":
      return runStack(session, adapters);
    case "algorithms":
      return runAlgorithms(session, adapters);
    case "models":
      return runRouting(session, adapters);
    case "intake":
    case "flaws":
    case "tasks":
    case "execution":
    case "review":
      // User-action-driven gates; nothing to precompute.
      return session;
  }
}

// ---------- Gate 1: Suitability ----------
async function runSuitability(
  session: PipelineSession,
  adapters: StageAdapters
): Promise<PipelineSession> {
  session.gateStatus = "running";
  const workflow: Workflow = await adapters.understand(session.input);
  const suitability = await adapters.checkSuitability({ raw: session.input, workflow });

  session.suitability = suitability;

  if (suitability.suitable) {
    session.workflow = workflow;
    session.gateStatus = "awaiting_user";
    await recordToLedger({
      orgId: ORG_ID,
      sessionId: session.id,
      gate: "suitability",
      eventType: "suitability_passed",
      detail: {
        summary: `Workflow suitable (confidence ${(suitability.confidence * 100).toFixed(0)}%)`,
        confidence: suitability.confidence,
      },
    });
    await recordToLedger({
      orgId: ORG_ID,
      sessionId: session.id,
      gate: "flaws",
      eventType: "flaw_report",
      detail: { summary: "Flaw scan queued for approval" },
    });
  } else {
    // Not suitable: keep the extraction as the baseline the user keeps or replaces.
    session.suggestedWorkflow = workflow;
    session.gateStatus = "awaiting_user";
    await recordToLedger({
      orgId: ORG_ID,
      sessionId: session.id,
      gate: "suitability",
      eventType: "suitability_flagged",
      detail: {
        summary: suitability.reason,
        suggested: Boolean(suitability.suggestedWorkflow),
      },
    });
  }
  return session;
}

// ---------- Gate 3: Stack ----------
async function runStack(
  session: PipelineSession,
  adapters: StageAdapters
): Promise<PipelineSession> {
  const hasStack = session.statedStack.trim().length > 0;

  if (hasStack) {
    const validation: StackValidation = await adapters.validateStack({
      raw: session.input,
      workflow: session.workflow!,
      statedStack: session.statedStack,
    });
    const layers = [
      "frontend",
      "backend",
      "database",
      "cache",
      "auth",
      "hosting",
      "jobs",
      "storage",
    ] as const;
    const proposal: StackProposal = {
      name: "Your stack",
      components: session.statedStack
        .split(/[,+|\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, layers.length)
        .map((choice, i) => ({
          layer: layers[i],
          choice,
          rationale: "",
        })),
      summary:
        validation.verdict === "fit"
          ? "Validated as provided."
          : "See validation notes and suggested changes.",
      confidence: validation.verdict === "fit" ? 0.9 : 0.55,
    };
    session.stackGate = {
      provided: true,
      validation,
      candidates: [
        { proposal, confidence: proposal.confidence, reason: "User-provided stack." },
      ],
      selected: proposal.name,
      tieBreakRequired: false,
    };
    await recordToLedger({
      orgId: ORG_ID,
      sessionId: session.id,
      gate: "stack",
      eventType: "stack_validated",
      detail: { summary: `Verdict: ${validation.verdict}`, verdict: validation.verdict },
    });
    session.gate = "tasks";
    session.gateStatus = "awaiting_user";
    return session;
  }

  const proposals = await adapters.proposeStacks({
    raw: session.input,
    workflow: session.workflow!,
  });
  const candidates: StackCandidate[] = proposals.map((p) => ({
    proposal: p,
    confidence: p.confidence ?? 0.6,
    reason: p.summary.slice(0, 200),
  }));

  const tie = needsTieBreak(candidates);
  const selected = tie
    ? null
    : [...candidates].sort((a, b) => b.confidence - a.confidence)[0].proposal.name;

  session.stackGate = {
    provided: false,
    validation: null,
    candidates,
    selected,
    tieBreakRequired: tie,
  };
  session.gateStatus = "awaiting_user";
  await recordToLedger({
    orgId: ORG_ID,
    sessionId: session.id,
    gate: "stack",
    eventType: tie ? "stack_tiebreak" : "stack_selected",
    detail: {
      summary: tie
        ? `${candidates.length} stack candidates too close to auto-pick — user must choose`
        : `Auto-selected "${selected}" (clear winner, reason shown)`,
      candidates: candidates.map((c) => `${c.proposal.name} (${(c.confidence * 100).toFixed(0)}%)`),
    },
  });
  return session;
}

// ---------- Gate 5: Algorithms ----------
async function runAlgorithms(
  session: PipelineSession,
  adapters: StageAdapters
): Promise<PipelineSession> {
  const plan = await adapters.recommendAlgorithms({
    workflow: session.workflow!,
    stack: stackTextOf(session),
  });
  session.algorithms = plan;
  session.gateStatus = "awaiting_user";
  const ties = plan.tasks.filter((t) => t.tieBreakRequired).length;
  await recordToLedger({
    orgId: ORG_ID,
    sessionId: session.id,
    gate: "algorithms",
    eventType: ties > 0 ? "algorithm_tiebreak" : "algorithm_selected",
    detail: {
      summary:
        ties > 0
          ? `${ties} task(s) need a human call on approach`
          : "Approach auto-selected for every task (reasons shown)",
      tieCount: ties,
    },
  });
  return session;
}

// ---------- Gate 6: Model routing ----------
async function runRouting(
  session: PipelineSession,
  adapters: StageAdapters
): Promise<PipelineSession> {
  const plan = await adapters.routeModels({
    workflow: session.workflow!,
    algorithmPlan: session.algorithms!,
    stack: stackTextOf(session),
  });

  // F7: apply the org routing policy on top of the router's raw ranking.
  // lowest_cost → flash unless pro is clearly safer; highest_accuracy → pro unless
  // flash wins decisively; balanced → leave the router's pick as-is.
  plan.policy = session.policy ?? "balanced";
  const cheap = CHEAP_MODEL_ID;
  const strong = STRONG_MODEL_ID;
  for (const route of plan.routes) {
    if (plan.policy === "lowest_cost" && route.selectedModel !== cheap) {
      const proConf = route.options.find((o) => o.model === strong)?.confidence ?? route.confidence;
      if (proConf - (route.options.find((o) => o.model === cheap)?.confidence ?? 0) < 0.25) {
        route.selectedModel = cheap;
        route.reason = `Policy lowest_cost: downgraded to ${cheap} (accuracy delta small). ${route.reason}`;
      }
    }
    if (plan.policy === "highest_accuracy" && route.selectedModel !== strong) {
      route.selectedModel = strong;
      route.reason = `Policy highest_accuracy: upgraded to ${strong}. ${route.reason}`;
    }
  }
  plan.estimatedCostUsd =
    plan.routes.reduce(
      (s, r) => s + (r.selectedModel === strong ? 4 : 1),
      0
    ) / Math.max(plan.routes.length, 1);

  session.routing = plan;
  session.gateStatus = "awaiting_user";
  const ties = plan.routes.filter((r) => r.tieBreakRequired).length;
  await recordToLedger({
    orgId: ORG_ID,
    sessionId: session.id,
    gate: "models",
    eventType: ties > 0 ? "model_tiebreak" : "model_selected",
    detail: {
      summary:
        ties > 0
          ? `${ties} model choice(s) need a human call (policy: ${plan.policy})`
          : `Model auto-selected for every task (policy: ${plan.policy}, reasons shown)`,
      tieCount: ties,
      policy: plan.policy,
      estimatedCostUsd: plan.estimatedCostUsd,
    },
  });
  return session;
}

export function stackTextOf(session: PipelineSession): string {
  const gate = session.stackGate;
  if (!gate) return session.statedStack || "unspecified";
  const chosen =
    gate.candidates.find((c) => c.proposal.name === gate.selected) ?? gate.candidates[0];
  return chosen.proposal.components.map((c) => `${c.layer}: ${c.choice}`).join("; ");
}

// ---------- Apply human gate actions ----------
export async function applyGateAction(
  session: PipelineSession,
  action: GateAction,
  adapters: StageAdapters
): Promise<PipelineSession> {
  switch (action.action) {
    case "suitability_choose": {
      if (session.gate !== "suitability") break;
      if (action.choice === "suggested") {
        const wf = await adapters.understand(
          `${session.input}\n\nUse this improved workflow instead:\n${session.suitability?.suggestedWorkflow ?? ""}`
        );
        session.workflow = wf;
      } else {
        session.workflow = session.suggestedWorkflow ?? session.workflow;
      }
      await recordToLedger({
        orgId: ORG_ID,
        sessionId: session.id,
        gate: "suitability",
        eventType: "human_decision",
        actor: "human",
        detail: {
          summary: `User ${action.choice === "suggested" ? "accepted the suggested workflow" : "kept the original workflow"}`,
        },
      });
      session.gate = "flaws";
      session.gateStatus = "running";
      const finalWorkflow = session.workflow;
      if (!finalWorkflow) break;
      const flawReport = await adapters.detectFlaws({
        raw: session.input,
        workflow: finalWorkflow,
      });
      session.flawReport = flawReport;
      session.gateStatus = "awaiting_user";
      await recordToLedger({
        orgId: ORG_ID,
        sessionId: session.id,
        gate: "flaws",
        eventType: "flaw_report",
        detail: {
          summary: `${flawReport.flaws.length} flaws found (${flawReport.overallRisk} risk)`,
        },
      });
      break;
    }

    case "flaw_resolve": {
      if (session.gate !== "flaws" || !session.flawReport) break;
      session.flawResolutions = action.resolutions;
      const unresolvedCritical = session.flawReport.flaws.filter(
        (f) =>
          f.severity === "critical" &&
          !action.resolutions.some(
            (r) => r.flawId === f.id && (r.decision === "accepted" || r.decision === "edited")
          )
      );
      await recordToLedger({
        orgId: ORG_ID,
        sessionId: session.id,
        gate: "flaws",
        eventType: "human_decision",
        actor: "human",
        detail: {
          summary: `Flaw gate: ${action.resolutions.filter((r) => r.decision !== "rejected").length} fixes applied, ${action.resolutions.filter((r) => r.decision === "rejected").length} rejected`,
          resolutions: action.resolutions,
        },
        humanEdit: { resolutions: action.resolutions },
      });
      if (unresolvedCritical.length > 0) {
        session.gateStatus = "awaiting_user"; // F3: nothing moves forward until gate cleared
      } else {
        session.gate = "stack";
        session.gateStatus = "running";
        session = await runStack(session, adapters);
      }
      break;
    }

    case "stack_choose": {
      if (session.gate !== "stack" || !session.stackGate) break;
      const chosen = session.stackGate.candidates.find((c) => c.proposal.name === action.choice);
      if (!chosen) break;
      session.stackGate.selected = chosen.proposal.name;
      session.stackGate.tieBreakRequired = false;
      session.gate = "tasks";
      session.gateStatus = "awaiting_user";
      await recordToLedger({
        orgId: ORG_ID,
        sessionId: session.id,
        gate: "stack",
        eventType: "human_decision",
        actor: "human",
        detail: { summary: `User locked stack "${chosen.proposal.name}"` },
      });
      break;
    }

    case "tasks_edit": {
      if (session.gate !== "tasks" || !session.workflow) break;
      // Keep dependencies consistent with the surviving task ids.
      const ids = new Set(action.tasks.map((t) => t.id));
      for (const t of action.tasks) {
        t.dependsOn = (t.dependsOn ?? []).filter((d: string) => ids.has(d));
      }
      session.workflow.tasks = action.tasks;
      session.gate = "algorithms";
      session.gateStatus = "running";
      session = await runAlgorithms(session, adapters);
      await recordToLedger({
        orgId: ORG_ID,
        sessionId: session.id,
        gate: "tasks",
        eventType: "human_decision",
        actor: "human",
        detail: { summary: `Task list confirmed with ${action.tasks.length} tasks` },
      });
      break;
    }

    case "algorithm_choose": {
      if (session.gate !== "algorithms" || !session.algorithms) break;
      const task = session.algorithms.tasks.find((t) => t.taskId === action.taskId);
      if (!task) break;
      task.humanChoice = action.choice;
      task.selected = action.choice;
      task.tieBreakRequired = false;
      const stillWaiting = session.algorithms.tasks.filter((t) => t.tieBreakRequired);
      if (stillWaiting.length === 0) {
        session.gate = "models";
        session.gateStatus = "running";
        session = await runRouting(session, adapters);
      }
      await recordToLedger({
        orgId: ORG_ID,
        sessionId: session.id,
        gate: "algorithms",
        eventType: "human_decision",
        actor: "human",
        taskId: action.taskId,
        detail: { summary: `User chose approach "${action.choice}" for ${task.taskTitle}` },
      });
      break;
    }

    case "model_choose": {
      if (session.gate !== "models" || !session.routing) break;
      const route = session.routing.routes.find((r) => r.taskId === action.taskId);
      if (!route) break;
      route.humanChoice = action.choice;
      route.selectedModel = action.choice;
      route.tieBreakRequired = false;
      const stillWaiting = session.routing.routes.filter((r) => r.tieBreakRequired);
      if (stillWaiting.length === 0) {
        session.gate = "execution";
        session.gateStatus = "pending";
      }
      await recordToLedger({
        orgId: ORG_ID,
        sessionId: session.id,
        gate: "models",
        eventType: "human_decision",
        actor: "human",
        taskId: action.taskId,
        model: action.choice,
        detail: { summary: `User routed ${route.taskTitle} to ${action.choice}` },
      });
      break;
    }
  }
  return session;
}

/** Resolve remaining tie-breaks automatically (user clicked "keep suggestions"). */
export function autoSelectRemaining(session: PipelineSession): void {
  if (session.algorithms) {
    for (const t of session.algorithms.tasks) {
      if (t.tieBreakRequired && !t.humanChoice) {
        const top = [...t.options].sort((a, b) => b.confidence - a.confidence)[0];
        t.selected = top.name;
        t.tieBreakRequired = false;
      }
    }
  }
  if (session.routing) {
    for (const r of session.routing.routes) {
      if (r.tieBreakRequired && !r.humanChoice) {
        const top = [...r.options].sort((a, b) => b.confidence - a.confidence)[0];
        r.selectedModel = top.model;
        r.tieBreakRequired = false;
      }
    }
  }
}
