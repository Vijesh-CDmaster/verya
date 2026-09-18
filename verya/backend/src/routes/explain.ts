// Explain My Decision endpoint (F22c) — plain-language Q&A over the Trust Ledger.
import type { VeryaRequest } from "../app";
import { explainDecision } from "../services/explain";
import { z } from "zod";

const ExplainRequestSchema = z.object({
  question: z.string().min(3).max(500),
  sessionId: z.string().max(80).optional(),
  taskId: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
});

export default async function explainRoutes(app: import("fastify").FastifyInstance) {
  app.post("/explain", async (req: VeryaRequest, reply) => {
    const parsed = ExplainRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid question payload",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    try {
      const result = await explainDecision({ ...parsed.data, orgId: req.auth.orgId });
      return result;
    } catch (err) {
      req.log.error(err, "explain failed");
      return reply.status(502).send({
        error: "Could not generate an explanation right now. The AI provider may be unavailable — try again shortly.",
      });
    }
  });
}
