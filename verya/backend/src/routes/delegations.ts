// Delegated Authority REST routes (F23 Phase 4) — delegation management & authorization evaluation endpoints.
//
// RBAC: delegation grants and lifecycle transitions are admin-only operations
// (middleware/auth.ts requireAdmin — the existing F38 RBAC mechanism; in clearly
// labeled development mode everything is allowed). Read/list/evaluate stay available
// to authenticated org members, matching the application's authorization model.
// Identity always comes from req.auth (orgId/userId) — never from the client body.
import type { FastifyInstance } from "fastify";
import type { VeryaRequest } from "../app";
import { requireAdmin } from "../middleware/auth";
import { CreateDelegationSchema, UpdateDelegationSchema, AuthorizeRequestSchema, type DelegationStatus } from "../schemas/delegation";
import {
  createDelegationService,
  getDelegationService,
  listDelegationsService,
  updateDelegationService,
  suspendDelegationService,
  revokeDelegationService,
  reactivateDelegationService,
  evaluateAuthorization,
} from "../services/delegations";

export default async function delegationRoutes(app: FastifyInstance): Promise<void> {
  // Create a new Delegation (admin-only)
  app.post("/delegations", async (req: VeryaRequest, reply) => {
    requireAdmin(req);
    const parsed = CreateDelegationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid delegation creation payload",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const delegator = req.auth.userId || "system";
    const delegation = await createDelegationService(req.auth.orgId, delegator, parsed.data, {
      actorRole: req.auth.role,
    });
    return reply.status(201).send({ delegation });
  });

  // List Delegations
  app.get("/delegations", async (req: VeryaRequest) => {
    const q = req.query as Record<string, string | undefined>;
    const delegations = await listDelegationsService(req.auth.orgId, {
      agentId: q.agentId,
      status: q.status ? (q.status as DelegationStatus) : undefined,
    });
    return { delegations };
  });

  // Get Delegation by ID
  app.get("/delegations/:delegationId", async (req: VeryaRequest, reply) => {
    const params = req.params as { delegationId: string };
    const delegation = await getDelegationService(req.auth.orgId, params.delegationId);
    if (!delegation) {
      return reply.status(404).send({ error: "Delegation not found" });
    }
    return { delegation };
  });

  // Update Delegation (admin-only; cannot change status — use lifecycle endpoints)
  app.patch("/delegations/:delegationId", async (req: VeryaRequest, reply) => {
    requireAdmin(req);
    const params = req.params as { delegationId: string };
    const parsed = UpdateDelegationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid delegation update payload",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const delegation = await updateDelegationService(req.auth.orgId, params.delegationId, parsed.data, {
      actorRole: req.auth.role,
    });
    return { delegation };
  });

  // Delegation lifecycle transitions (admin-only)
  app.post("/delegations/:delegationId/suspend", async (req: VeryaRequest) => {
    requireAdmin(req);
    const params = req.params as { delegationId: string };
    const delegation = await suspendDelegationService(req.auth.orgId, params.delegationId);
    return { delegation };
  });

  app.post("/delegations/:delegationId/revoke", async (req: VeryaRequest) => {
    requireAdmin(req);
    const params = req.params as { delegationId: string };
    const delegation = await revokeDelegationService(req.auth.orgId, params.delegationId);
    return { delegation };
  });

  app.post("/delegations/:delegationId/reactivate", async (req: VeryaRequest) => {
    requireAdmin(req);
    const params = req.params as { delegationId: string };
    const delegation = await reactivateDelegationService(req.auth.orgId, params.delegationId);
    return { delegation };
  });

  // Central Authorization Evaluator (Preview / Preflight)
  app.post("/authorization/evaluate", async (req: VeryaRequest, reply) => {
    const parsed = AuthorizeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid authorization evaluation request",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const evaluation = await evaluateAuthorization({
      ...parsed.data,
      orgId: req.auth.orgId,
    });
    return { evaluation };
  });
}
