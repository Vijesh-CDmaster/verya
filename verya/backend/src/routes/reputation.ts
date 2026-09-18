// Reputation leaderboard + inline trust badges (F12 / F22 trust badges).
import type { VeryaRequest } from "../app";
import { leaderboard } from "../services/reputation";

export default async function reputationRoutes(app: import("fastify").FastifyInstance) {
  app.get("/reputation", async (req: VeryaRequest) => {
    const entries = await leaderboard(req.auth.orgId);
    return { entries };
  });
}
