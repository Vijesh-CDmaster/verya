// BullMQ queues (F43) — heavy AI work runs in workers, never blocking HTTP.
// All queue functions no-throw when REDIS_URL is unset (degrade to inline processing).
import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

export const EXECUTION_QUEUE = "verya-execution";
export const VERIFICATION_QUEUE = "verya-verification";

let connection: ConnectionOptions | null = null;
let executionQueue: Queue | null = null;
let verificationQueue: Queue | null = null;

function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

function getConnection(): ConnectionOptions {
  if (!connection) {
    connection = { url: process.env.REDIS_URL! };
  }
  return connection;
}

export function getExecutionQueue(): Queue | null {
  if (!redisConfigured()) return null;
  executionQueue ??= new Queue(EXECUTION_QUEUE, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 250,
    },
  });
  return executionQueue;
}

export function getVerificationQueue(): Queue | null {
  if (!redisConfigured()) return null;
  verificationQueue ??= new Queue(VERIFICATION_QUEUE, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 250,
    },
  });
  return verificationQueue;
}

export async function enqueueExecution(job: { sessionId: string; orgId: string }): Promise<string | null> {
  const q = getExecutionQueue();
  if (!q) return null;
  const j = await q.add("execute", job, { jobId: `exec-${job.sessionId}-${Date.now()}` });
  return String(j.id);
}

export async function enqueueVerification(job: {
  sessionId: string;
  orgId: string;
  taskId: string;
}): Promise<string | null> {
  const q = getVerificationQueue();
  if (!q) return null;
  const j = await q.add("verify", job);
  return String(j.id);
}

export async function queueHealth(): Promise<{ configured: boolean; executionWaiting?: number }> {
  if (!redisConfigured()) return { configured: false };
  try {
    const q = getExecutionQueue();
    const waiting = q ? await q.getWaitingCount() : 0;
    return { configured: true, executionWaiting: waiting };
  } catch {
    return { configured: true, executionWaiting: -1 };
  }
}
