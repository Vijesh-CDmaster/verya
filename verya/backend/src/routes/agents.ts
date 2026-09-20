import type { FastifyInstance } from "fastify";
import type { VeryaRequest } from "../app";
import { CreateAgentSchema, UpdateAgentSchema, type AgentStatus, type AgentType } from "../schemas/agent";
import {
  createAgentService,
  getAgentService,
  listAgentsService,
  updateAgentService,
  suspendAgentService,
  revokeAgentService,
  archiveAgentService,
  reactivateAgentService,
} from "../services/agents";

export default async function agentRoutes(app: FastifyInstance): Promise<void> {
  // Create a new Agent
  app.post("/agents", async (req: VeryaRequest, reply) => {
    const parsed = CreateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid agent creation payload",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const owner = req.auth.userId || "system";
    const agent = await createAgentService(req.auth.orgId, owner, parsed.data);
    return reply.status(201).send({ agent });
  });

  // List Agents with optional status and type filter
  app.get("/agents", async (req: VeryaRequest) => {
    const q = req.query as Record<string, string | undefined>;
    const agents = await listAgentsService(req.auth.orgId, {
      status: q.status ? (q.status as AgentStatus) : undefined,
      type: q.type ? (q.type as AgentType) : undefined,
    });
    return { agents };
  });

  // Get Agent by ID
  app.get("/agents/:agentId", async (req: VeryaRequest, reply) => {
    const params = req.params as { agentId: string };
    const agent = await getAgentService(req.auth.orgId, params.agentId);
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }
    return { agent };
  });

  // Update Agent metadata
  app.patch("/agents/:agentId", async (req: VeryaRequest, reply) => {
    const params = req.params as { agentId: string };
    const parsed = UpdateAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid agent update payload",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const agent = await updateAgentService(req.auth.orgId, params.agentId, parsed.data);
    return { agent };
  });

  // Lifecycle transitions
  app.post("/agents/:agentId/suspend", async (req: VeryaRequest) => {
    const params = req.params as { agentId: string };
    const agent = await suspendAgentService(req.auth.orgId, params.agentId);
    return { agent };
  });

  app.post("/agents/:agentId/revoke", async (req: VeryaRequest) => {
    const params = req.params as { agentId: string };
    const agent = await revokeAgentService(req.auth.orgId, params.agentId);
    return { agent };
  });

  app.post("/agents/:agentId/archive", async (req: VeryaRequest) => {
    const params = req.params as { agentId: string };
    const agent = await archiveAgentService(req.auth.orgId, params.agentId);
    return { agent };
  });

  app.post("/agents/:agentId/reactivate", async (req: VeryaRequest) => {
    const params = req.params as { agentId: string };
    const agent = await reactivateAgentService(req.auth.orgId, params.agentId);
    return { agent };
  });
}
