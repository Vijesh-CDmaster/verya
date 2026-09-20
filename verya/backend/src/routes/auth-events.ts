import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { recordToLedger } from "../services/ledger";
import type { VeryaRequest } from "../app";

const AuthEventSchema = z.object({
  eventType: z.enum(["sign_in", "sign_out", "permission_changed"]),
  previousRole: z.string().max(100).optional(),
  nextRole: z.string().max(100).optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

/** F38: auth lifecycle and permission changes are auditable ledger events. */
export default async function authEventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/events", async (req: VeryaRequest, reply) => {
    const parsed = AuthEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: "Validation failed",
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }
    if (req.auth.mode === "anonymous") {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const { eventType, previousRole, nextRole, detail } = parsed.data;
    const roleChanged = eventType === "permission_changed" && previousRole !== nextRole;
    if (eventType === "permission_changed" && (!previousRole || !nextRole || !roleChanged)) {
      return reply.status(422).send({ error: "Permission changes require distinct previousRole and nextRole values" });
    }

    const entry = await recordToLedger({
      orgId: req.auth.orgId,
      actor: "system",
      gate: "auth",
      eventType,
      detail: {
        summary:
          eventType === "permission_changed"
            ? `Permission changed from ${previousRole} to ${nextRole}`
            : `Authentication event: ${eventType}`,
        userId: req.auth.userId,
        mode: req.auth.mode,
        role: req.auth.role,
        ...(previousRole ? { previousRole } : {}),
        ...(nextRole ? { nextRole } : {}),
        ...(detail ?? {}),
      },
    });
    return { ok: true, seq: entry.seq };
  });
}