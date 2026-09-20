import type { FastifyInstance } from "fastify";
import { getPipeline } from "../services/pipeline";
import { verifyCertificate } from "../lib/certificates";
import type { VeryaRequest } from "../app";

export default async function certificateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/certificates/:sessionId/:taskId", async (req: VeryaRequest, reply) => {
    const params = req.params as { sessionId: string; taskId: string };
    const session = await getPipeline(req.auth.orgId, params.sessionId);
    const execution = session?.executions.find((item) => item.taskId === params.taskId);
    if (!execution?.certificate) return reply.status(404).send({ error: "Trust certificate not found" });
    return { certificate: execution.certificate, valid: verifyCertificate(execution.certificate) };
  });
}