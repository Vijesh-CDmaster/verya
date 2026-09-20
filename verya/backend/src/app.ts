// Verya — Fastify app factory (Node 22, TypeScript).
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { authenticate, clerkConfigured, PUBLIC_API_PREFIXES, type AuthContext } from "./middleware/auth";
import pipelineRoutes from "./routes/pipeline";
import ledgerRoutes from "./routes/ledger";
import dashboardRoutes from "./routes/dashboard";
import leadRoutes from "./routes/leads";
import reputationRoutes from "./routes/reputation";
import explainRoutes from "./routes/explain";
import authEventRoutes from "./routes/auth-events";
import policyRoutes from "./routes/policies";
import certificateRoutes from "./routes/certificates";
import agentRoutes from "./routes/agents";
import delegationRoutes from "./routes/delegations";
import { isDbConfigured } from "./db/pool";
import { queueHealth } from "./jobs/queues";

// Every request carries the auth context (org scoping) after the onRequest hook.
declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export type VeryaRequest = FastifyRequest;

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    },
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:3100").split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX || 60),
    timeWindow: "1 minute",
  });

  // Auth context on every request (F38). Public prefixes (health, lead capture)
  // accept anonymous callers under Clerk; everything else requires a session.
  app.decorateRequest("auth");
  app.addHook("onRequest", async (req) => {
    const url = (req.url || "").split("?")[0];
    const isPublic = PUBLIC_API_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`));
    (req as VeryaRequest).auth = await authenticate(req, { public: isPublic });
  });

  app.get("/health", async () => {
    const queue = await queueHealth();
    const database = isDbConfigured() ? "postgres" : "devstore";
    const queueHealthy = !queue.configured || queue.executionWaiting !== -1;
    return {
      ok: queueHealthy,
      service: "verya-backend",
      auth: clerkConfigured() ? "clerk" : "development",
      database,
      queue: { ...queue, healthy: queueHealthy },
      time: new Date().toISOString(),
    };
  });

  await app.register(pipelineRoutes, { prefix: "/api" });
  await app.register(ledgerRoutes, { prefix: "/api" });
  await app.register(dashboardRoutes, { prefix: "/api" });
  await app.register(leadRoutes, { prefix: "/api" });
  await app.register(reputationRoutes, { prefix: "/api" });
  await app.register(explainRoutes, { prefix: "/api" });
  await app.register(authEventRoutes, { prefix: "/api" });
  await app.register(policyRoutes, { prefix: "/api" });
  await app.register(certificateRoutes, { prefix: "/api" });
  await app.register(agentRoutes, { prefix: "/api" });
  await app.register(delegationRoutes, { prefix: "/api" });

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; validation?: unknown };
    const statusCode = typeof e.statusCode === "number" ? e.statusCode : 500;
    req.log.error({ err: e }, "request failed");
    void reply.status(statusCode).send({
      error: e.message || "Internal server error",
      ...(e.validation ? { validation: e.validation } : {}),
    });
  });

  return app;
}
