// Dashboard REST routes — everything the /dashboard view renders (F22), all real data.
import type { FastifyInstance } from "fastify";
import { listLedger, ledgerAnalytics, verifyLedger } from "../services/ledger";
import { leaderboard, skillHeatmap, cheapestTrustedModels } from "../services/reputation";
import { findSimilar, exportOrgMemory, deleteOrgMemory } from "../services/memory";
import { listPipelines } from "../services/pipeline";
import { isDbConfigured } from "../db/pool";
import { queueHealth } from "../jobs/queues";
import { requireAdmin } from "../middleware/auth";
import { listPolicySuggestions } from "../services/policies";
import { buildConstitution } from "../services/constitution";
import type { VeryaRequest } from "../app";

export default async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard", async (req: VeryaRequest) => {
    // DATABASE_URL unset → the file-backed dev store is serving persistence;
    // every stat below is still real recorded data, flagged for the UI banner.
    const devStore = !isDbConfigured();
    const orgId = req.auth.orgId;
    const [records, reputation, heatmap, analytics, sessions, chain, trustBar, policySuggestions, constitution] = await Promise.all([
      listLedger({ orgId, limit: 60 }),
      leaderboard(orgId),
      skillHeatmap(orgId),
      ledgerAnalytics(orgId),
      listPipelines(orgId, 20),
      verifyLedger(orgId),
      cheapestTrustedModels(orgId),
      listPolicySuggestions(orgId),
      buildConstitution(orgId),
    ]);
    const reviewQueue = records.filter(
      (r) =>
        (r.gate === "execution" && r.detail && (r.detail as { summary?: string }).summary?.includes("flagged")) ||
        r.eventType === "task_failed" ||
        (r.detail as { summary?: string })?.summary?.includes("escalated")
    );
    return {
      dbConfigured: !devStore,
      devStore,
      queue: await queueHealth(),
      analytics,
      trustBar,
      policySuggestions,
      constitution,
      reputation,
      heatmap,
      sessions,
      chain,
      reviewQueue: reviewQueue.slice(0, 20),
      records,
    };
  });

  // Semantic search over org memory (pgvector).
  app.get("/memory/search", async (req: VeryaRequest) => {
    const q = req.query as Record<string, string | undefined>;
    if (!q.q) return { results: [] };
    const results = await findSimilar({
      orgId: req.auth.orgId,
      taskCategory: q.category ?? "other",
      query: q.q,
      limit: 5,
    });
    return { results };
  });

  app.get("/memory/export", async (req: VeryaRequest, reply) => {
    requireAdmin(req);
    const rows = await exportOrgMemory(req.auth.orgId);
    reply.header("Content-Type", "application/json");
    reply.header("Content-Disposition", `attachment; filename="org-memory-export.json"`);
    return rows;
  });

  app.delete("/memory", async (req: VeryaRequest) => {
    requireAdmin(req);
    const deleted = await deleteOrgMemory(req.auth.orgId);
    return { deleted };
  });
}
