// Pipeline REST routes — the gated pipeline over the Fastify API.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { StartRequestSchema, GateActionSchema } from "../schemas/pipeline";
import { startPipeline, getPipeline, listPipelines, actOnPipeline } from "../services/pipeline";
import { recordToLedger } from "../services/ledger";
import { runExecution } from "../services/execution";
import { sanitizeInput, rateLimitKey } from "../lib/middleware";
import type { VeryaRequest } from "../app";

export const runtime = "nodejs";

const uuidOf = (req: VeryaRequest): string | null => {
  const m = req.url.match(/pipeline\/([^/]+)/);
  return m ? m[1] : null;
};

export default async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  // Start a new pipeline session (runs the suitability gate).
  app.post("/pipeline", async (req, reply) => {
    const parsed = StartRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => i.message),
      });
    }
    const session = await startPipeline({
      input: sanitizeInput(parsed.data.input),
      statedStack: sanitizeInput(parsed.data.statedStack ?? ""),
      policy: parsed.data.policy,
    });
    return { session };
  });

  // Fetch one session.
  app.get("/pipeline/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getPipeline(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return { session };
  });

  // List sessions (workflow history, F22).
  app.get("/pipeline", async () => {
    return { sessions: await listPipelines(50) };
  });

  // Apply a gate action (accept workflow, resolve flaws, pick stack/algorithm/model...).
  app.post("/pipeline/:id/action", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = GateActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => i.message),
      });
    }
    const session = await actOnPipeline(id, parsed.data);
    return { session };
  });

  // Run execution inline (used when Redis/BullMQ is not configured; the worker
  // consumes the same queue path when it is).
  app.post("/pipeline/:id/execute", async (req) => {
    const { id } = req.params as { id: string };
    return runExecution(id);
  });

  // File upload intake (F1.3): text-like files appended into the project input.
  app.post("/pipeline/upload", async (req, reply) => {
    const rl = rateLimitKey(`upload:${req.ip}`, 10, 60_000);
    if (!rl.ok) return reply.status(429).send({ error: "Rate limit exceeded." });

    const data = await (req as unknown as { file: () => Promise<UploadedFile | undefined> }).file?.();
    if (!data) return reply.status(400).send({ error: "multipart/form-data with a file field required" });

    const allowed = /\.(txt|md|csv|json|ya?ml|log)$/i;
    if (!allowed.test(data.filename)) {
      return reply.status(415).send({ error: "Only text formats (txt, md, csv, json, yaml, log) are supported." });
    }
    const buf = await data.toBuffer();
    if (buf.length > 2 * 1024 * 1024) {
      return reply.status(413).send({ error: "File exceeds the 2MB limit." });
    }
    const text = sanitizeInput(buf.toString("utf8"));
    const session = await startPipeline({
      input: text,
      statedStack: (data.fields?.statedStack as string) ?? "",
      policy: "balanced",
    });
    await recordToLedger({
      orgId: req.auth.orgId,
      sessionId: session.id,
      gate: "intake",
      eventType: "file_uploaded",
      detail: { summary: `Intake via file upload: ${data.filename} (${buf.length} bytes)` },
    });
    return { session };
  });
}

type UploadedFile = {
  filename: string;
  toBuffer: () => Promise<Buffer>;
  fields?: Record<string, unknown>;
};
