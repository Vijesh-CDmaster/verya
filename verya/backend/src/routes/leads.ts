// Leads REST routes — marketing lead capture.
// POST /api/leads is public but rate-limited and Zod-validated; the DB stores the record.
import type { FastifyInstance } from "fastify";
import { LeadCreateSchema } from "../schemas/lead";
import { insertLead, listLeads } from "../repositories/leads";
import { rateLimitKey, sanitizeInput } from "../lib/middleware";
import type { VeryaRequest } from "../app";

export default async function leadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/leads", async (req: VeryaRequest, reply) => {
    const rl = rateLimitKey(`leads:${req.ip}`, 5, 60_000);
    if (!rl.ok) {
      return reply.status(429).send({ error: "Too many requests. Please try again shortly." });
    }

    const parsed = LeadCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: parsed.error.issues[0]?.message ?? "Validation failed",
        issues: parsed.error.issues.map((i) => i.message),
      });
    }

    try {
      const lead = await insertLead({
        orgId: "marketing",
        name: sanitizeInput(parsed.data.name, 120),
        email: sanitizeInput(parsed.data.email.toLowerCase(), 200),
        phone: parsed.data.phone ? sanitizeInput(parsed.data.phone, 40) : undefined,
        source: parsed.data.source,
      });
      return reply.status(201).send({
        ok: true,
        message: `✓ Thank you, ${lead.name}! We'll be in touch soon.`,
      });
    } catch (err) {
      req.log.error({ err }, "lead insert failed");
      return reply.status(503).send({
        error:
          "We received your request but could not store it because the database is not connected. Please try again later.",
      });
    }
  });

  app.get("/leads", async (req: VeryaRequest) => {
    const q = req.query as Record<string, string | undefined>;
    return { leads: await listLeads(req.auth.orgId, q.limit ? Number(q.limit) : 100) };
  });
}
