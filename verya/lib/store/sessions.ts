// Verya — pipeline session storage (file-backed; Neon Postgres in production per STACK.md)

import { promises as fs } from "fs";
import path from "path";
import type { PipelineSession } from "../pipeline/types";

const DATA_DIR = path.join(process.cwd(), ".data", "sessions");

export async function createSession(input: {
  orgId: string;
  input: string;
  statedStack: string;
}): Promise<PipelineSession> {
  const now = new Date().toISOString();
  const session: PipelineSession = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    input: input.input,
    statedStack: input.statedStack,
    gate: "intake",
    gateStatus: "pending",
    suitability: null,
    suggestedWorkflow: null,
    workflow: null,
    flawReport: null,
    flawResolutions: [],
    stackGate: null,
    algorithms: null,
    routing: null,
    executions: [],
    humanFeedback: { ratings: {} },
  };
  await saveSession(session, input.orgId);
  return session;
}

export async function saveSession(session: PipelineSession, orgId: string): Promise<void> {
  await fs.mkdir(path.join(DATA_DIR, orgId), { recursive: true });
  session.updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(DATA_DIR, orgId, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    "utf8"
  );
}

export async function getSession(
  sessionId: string,
  orgId: string
): Promise<PipelineSession | null> {
  try {
    const raw = await fs.readFile(
      path.join(DATA_DIR, orgId, `${sessionId}.json`),
      "utf8"
    );
    return JSON.parse(raw) as PipelineSession;
  } catch {
    return null;
  }
}
