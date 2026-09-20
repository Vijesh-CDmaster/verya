import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/auth";
import { decidePolicy, detectPolicySuggestions, listPolicySuggestions } from "../services/policies";
import { buildConstitution } from "../services/constitution";
import type { VeryaRequest } from "../app";

export default async function policyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/policies/constitution", async (req: VeryaRequest) => buildConstitution(req.auth.orgId));
  app.get("/policies/suggestions", async (req: VeryaRequest) => ({ suggestions: await listPolicySuggestions(req.auth.orgId) }));
  app.post("/policies/suggestions/detect", async (req: VeryaRequest) => {
    requireAdmin(req);
    return { suggestions: await detectPolicySuggestions(req.auth.orgId) };
  });
  app.post("/policies/suggestions/:id/:decision", async (req: VeryaRequest, reply) => {
    requireAdmin(req);
    const params = req.params as { id: string; decision: string };
    if (params.decision !== "approved" && params.decision !== "rejected") return reply.status(422).send({ error: "Decision must be approved or rejected" });
    const suggestion = await decidePolicy(req.auth.orgId, Number(params.id), params.decision);
    if (!suggestion) return reply.status(404).send({ error: "Policy suggestion not found" });
    return { suggestion };
  });
}