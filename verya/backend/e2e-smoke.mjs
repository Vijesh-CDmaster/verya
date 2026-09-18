// Throwaway E2E driver — exercises the Verya pipeline exactly as the UI does.
const BASE = "http://localhost:4000/api";
const H = { "x-org-id": "default-org", "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: H, ...opts });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${String(text).slice(0, 300)}`);
  return body;
}

async function waitGate(id, want = "awaiting_user", tries = 80, log = () => {}) {
  for (let i = 0; i < tries; i++) {
    const { session } = await api(`/pipeline/${id}`);
    if (session.gateStatus === "failed") throw new Error("gate failed: " + JSON.stringify(session).slice(0, 400));
    if (session.gateStatus === want) return session;
    log(session.gate, session.gateStatus);
    await sleep(2500);
  }
  throw new Error(`timeout waiting for ${want}`);
}

const input = `Build an internal tool for our support team. Staff paste a customer's issue and the tool drafts a reply using our knowledge base, with an audit trail of what was sent. Around 50 support agents will use it daily. We need role-based access (agents vs admins), full history of every reply, and a dashboard showing response times. Our stack is Next.js and Postgres.`;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  // 1. Start
  log("starting pipeline…");
  let { session } = await api("/pipeline", { method: "POST", body: JSON.stringify({ input, statedStack: "", policy: "balanced" }) });
  const id = session.id;
  log("session", id, "gate:", session.gate, session.gateStatus);

  // 2. Suitability
  session = await waitGate(id, "awaiting_user", 80, (g, s) => log("  poll:", g, s));
  log("suitability:", session.suitability?.suitable, "confidence:", session.suitability?.confidence, "gate:", session.gate);
  session = (await api(`/pipeline/${id}/action`, { method: "POST", body: JSON.stringify({ action: "suitability_choose", choice: "keep" }) })).session;

  // 3. Flaws
  session = await waitGate(id, "awaiting_user", 80, (g, s) => log("  poll:", g, s));
  log("flaws:", session.flawReport?.flaws?.length ?? 0, "risk:", session.flawReport?.overallRisk);
  const resolutions = (session.flawReport?.flaws ?? []).map((f) => ({ flawId: f.id, decision: "accepted" }));
  session = (await api(`/pipeline/${id}/action`, { method: "POST", body: JSON.stringify({ action: "flaw_resolve", resolutions }) })).session;

  // 4. Stack
  session = await waitGate(id, "awaiting_user", 80, (g, s) => log("  poll:", g, s));
  log("stack gate:", session.gate, "candidates:", (session.stackGate?.candidates ?? []).map((c) => c.proposal.name).join(", "), "tie:", session.stackGate?.tieBreakRequired);
  const stackChoice = session.stackGate?.selected ?? session.stackGate?.candidates?.[0]?.proposal?.name;
  session = (await api(`/pipeline/${id}/action`, { method: "POST", body: JSON.stringify({ action: "stack_choose", choice: stackChoice }) })).session;

  // 5. Tasks
  log("tasks:", session.workflow?.tasks?.length);
  const tasks = session.workflow.tasks.map((t, i) => ({ ...t, title: t.title }));
  session = (await api(`/pipeline/${id}/action`, { method: "POST", body: JSON.stringify({ action: "tasks_edit", tasks }) })).session;

  // 6. Algorithms
  session = await waitGate(id, "awaiting_user", 80, (g, s) => log("  poll:", g, s));
  log("algorithms gate:", session.gate, "ties:", session.algorithms?.tasks?.filter((t) => t.tieBreakRequired).length);
  for (const t of session.algorithms.tasks.filter((t) => t.tieBreakRequired)) {
    session = (await api(`/pipeline/${id}/action`, { method: "POST", body: JSON.stringify({ action: "algorithm_choose", taskId: t.taskId, choice: t.selected }) })).session;
  }
  session = await waitGate(id, "awaiting_user", 80, (g, s) => log("  poll:", g, s));

  // 7. Models
  log("models gate:", session.gate, "ties:", session.routing?.routes?.filter((r) => r.tieBreakRequired).length, "policy:", session.routing?.policy);
  for (const r of session.routing.routes.filter((r) => r.tieBreakRequired)) {
    session = (await api(`/pipeline/${id}/action`, { method: "POST", body: JSON.stringify({ action: "model_choose", taskId: r.taskId, choice: r.selectedModel }) })).session;
  }
  session = await waitGate(id, "pending", 40, (g, s) => log("  poll:", g, s));
  log("ready for execution. gate:", session.gate, session.gateStatus);

  // 8. Execute
  session = (await api(`/pipeline/${id}/execute`, { method: "POST" })).session;
  session = await waitGate(id, "awaiting_user", 120, (g, s) => log("  exec poll:", g, s, session.executions?.filter((e) => e.status === "done").length ?? 0, "/", session.executions?.length ?? 0, "done"));
  const execs = session.executions ?? [];
  log("executions:", execs.length, "statuses:", [...new Set(execs.map((e) => e.status))].join(","));

  // 9. Feedback (accept first output)
  if (execs.length > 0) {
    const e = execs[0];
    const fb = await api(`/pipeline/${id}/action`, { method: "POST", body: JSON.stringify({ action: "feedback", executionId: e.id ?? e.taskId, outcome: "accepted", rating: 5, note: "e2e smoke test" }) });
    log("feedback recorded:", fb.session?.feedbackEvents?.length ?? "ok");
  }

  // 10. Dashboard + ledger verify
  const dash = await api("/dashboard");
  log("dashboard keys:", Object.keys(dash).join(","));
  const ver = await api("/ledger/verify");
  log("ledger verify:", JSON.stringify(ver));
  log("E2E COMPLETE ✓");
})().catch((e) => { console.error("E2E FAILED:", e.message); process.exit(1); });
