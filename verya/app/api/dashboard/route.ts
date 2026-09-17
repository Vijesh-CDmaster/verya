import { NextRequest } from "next/server";
import { queryLedger } from "@/lib/store/ledger";
import { getLeaderboard, mergeSkillAndReputation } from "@/lib/store/reputation";
import { getSkillMap } from "@/lib/store/memory";
import { listSessions } from "@/lib/store/sessions";
import { promises as fs } from "fs";
import path from "path";
import type { PipelineSession } from "@/lib/pipeline/types";

export const runtime = "nodejs";

const ORG_ID = process.env.VERYA_ORG_ID || "default-org";

/** Human review / escalation queue (F11, F22): flagged + failed executions across sessions. */
async function getReviewQueue(): Promise<
  { sessionId: string; taskId: string; taskTitle: string; model: string; status: string; issues: string[] }[]
> {
  const dir = path.join(process.cwd(), ".data", "sessions", ORG_ID);
  const queue: { sessionId: string; taskId: string; taskTitle: string; model: string; status: string; issues: string[] }[] = [];
  try {
    for (const f of (await fs.readdir(dir)).filter((x) => x.endsWith(".json"))) {
      try {
        const s = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as PipelineSession;
        for (const e of s.executions) {
          if (e.status === "flagged" || e.status === "failed" || e.status === "escalated") {
            queue.push({
              sessionId: s.id,
              taskId: e.taskId,
              taskTitle: s.workflow?.tasks.find((t) => t.id === e.taskId)?.title ?? e.taskId,
              model: e.model,
              status: e.status,
              issues: e.verification.issues.slice(0, 3),
            });
          }
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no sessions dir yet */
  }
  return queue;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const model = url.searchParams.get("model") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  const [entries, leaderboard, skill, sessions, reviewQueue] = await Promise.all([
    queryLedger({ orgId: ORG_ID, sessionId, model, limit }),
    getLeaderboard(ORG_ID),
    getSkillMap(ORG_ID),
    listSessions(ORG_ID),
    getReviewQueue(),
  ]);

  // Aggregate analytics (F21-lite): token/cost/latency rollups from execution events.
  const execEvents = entries.filter((e) => e.eventType === "task_execution");
  const totalTokens = execEvents.reduce((s, e) => {
    const t = e.detail as { tokens?: { input?: number; output?: number } };
    return s + (t.tokens?.input ?? 0) + (t.tokens?.output ?? 0);
  }, 0);
  const latencies = execEvents
    .map((e) => (e.detail as { latencyMs?: number }).latencyMs ?? 0)
    .filter((n) => n > 0);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length)
    : 0;
  const passed = execEvents.filter(
    (e) => (e.verification as { passed?: boolean } | undefined)?.passed === true
  ).length;
  const verificationRate = execEvents.length ? passed / execEvents.length : 0;

  return Response.json({
    entries,
    leaderboard: mergeSkillAndReputation(skill, leaderboard),
    sessions,
    reviewQueue,
    analytics: {
      totalTokens,
      avgLatencyMs: avgLatency,
      verificationRate,
      executionCount: execEvents.length,
    },
  });
}
