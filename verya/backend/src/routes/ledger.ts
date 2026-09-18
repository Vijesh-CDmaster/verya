// Ledger REST routes — queryable audit trail + integrity verification + export (F10).
import type { FastifyInstance } from "fastify";
import { listLedger, verifyLedger } from "../services/ledger";
import { requireAdmin } from "../middleware/auth";
import type { VeryaRequest } from "../app";

export default async function ledgerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ledger/records", async (req: VeryaRequest) => {
    const q = req.query as Record<string, string | undefined>;
    const records = await listLedger({
      orgId: req.auth.orgId,
      sessionId: q.sessionId,
      model: q.model,
      eventType: q.eventType,
      gate: q.gate,
      from: q.from,
      to: q.to,
      limit: q.limit ? Number(q.limit) : 100,
    });
    return { records };
  });

  app.get("/ledger/verify", async (req: VeryaRequest) => {
    return verifyLedger(req.auth.orgId);
  });

  // One-click compliance/audit export (CSV) — admin only (F38 RBAC).
  app.get("/ledger/export", async (req: VeryaRequest, reply) => {
    requireAdmin(req);
    const records = await listLedger({ orgId: req.auth.orgId, limit: 500 });
    const header = "seq,timestamp,gate,event,actor,model,task,summary,passed,chain_hash";
    const rows = records.map((r) => {
      const summary = String((r.detail as { summary?: string })?.summary ?? "").replace(/"/g, '""');
      const passed = r.verification ? String(r.verification.passed) : "";
      return [r.seq, r.createdAt, r.gate, r.eventType, r.actor, r.model ?? "", r.taskId ?? "", `"${summary}"`, passed, r.chainHash].join(",");
    });
    const csv = [header, ...rows].join("\n");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="verya-ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  });
}
