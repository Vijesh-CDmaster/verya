// Generated-project workspace routes — read/update the real files execution wrote.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPipeline } from "../services/pipeline";
import { getSession, saveSession } from "../repositories/sessions";
import { listWorkspaceFiles, readWorkspaceFile, checkWorkspacePath } from "../services/workspace";
import { recordToLedger } from "../services/ledger";

const EditBodySchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().max(60000),
  expectedVersion: z.number().int().min(1),
});

export default async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  // List the generated project's files (Explorer source of truth).
  app.get("/pipeline/:id/files", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await getPipeline(req.auth.orgId, id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return {
      files: listWorkspaceFiles(session).map((f) => ({
        path: f.path,
        taskId: f.taskId,
        model: f.model,
        version: f.version,
        updatedAt: f.updatedAt,
        modified: f.content !== f.original,
        size: f.content.length,
      })),
    };
  });

  // Read one file (Editor source of truth).
  app.get("/pipeline/:id/files/content", async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { path?: string };
    const session = await getPipeline(req.auth.orgId, id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    const pathCheck = checkWorkspacePath(query.path ?? "");
    if (!pathCheck.ok) return reply.status(422).send({ error: pathCheck.reason });
    const res = readWorkspaceFile(session, pathCheck.normalized);
    if ("error" in res) return reply.status(res.status).send({ error: res.error });
    return {
      file: {
        path: res.file.path,
        content: res.file.content,
        original: res.file.original,
        language: languageOf(res.file.path),
        taskId: res.file.taskId,
        model: res.file.model,
        version: res.file.version,
        modified: res.file.content !== res.file.original,
      },
    };
  });

  // Human edit of a generated file — versioned, audited, path-checked.
  app.post("/pipeline/:id/files/edit", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = EditBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({ error: "Validation failed", issues: parsed.error.issues.map((i) => i.message) });
    }
    const session = await getPipeline(req.auth.orgId, id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    const pathCheck = checkWorkspacePath(parsed.data.path);
    if (!pathCheck.ok) return reply.status(422).send({ error: pathCheck.reason });
    const res = readWorkspaceFile(session, pathCheck.normalized);
    if ("error" in res) return reply.status(res.status).send({ error: res.error });
    if (res.file.version !== parsed.data.expectedVersion) {
      return reply.status(409).send({ error: "This file changed in another session. Reload before saving." });
    }
    res.file.original = res.file.content;
    res.file.content = parsed.data.content;
    res.file.version += 1;
    res.file.updatedAt = new Date().toISOString();
    session.updatedAt = res.file.updatedAt;
    const fresh = await getSession(req.auth.orgId, id);
    if (fresh) {
      const target = (fresh.workspaceFiles ?? []).find((f) => f.path === pathCheck.normalized);
      if (target) {
        target.original = target.content;
        target.content = parsed.data.content;
        target.version += 1;
        target.updatedAt = res.file.updatedAt;
      }
      await saveSession(req.auth.orgId, fresh);
      await recordToLedger({
        orgId: req.auth.orgId,
        sessionId: id,
        gate: "review",
        eventType: "workspace_file_edited",
        actor: "human",
        detail: { summary: `Human edited ${pathCheck.normalized} (v${target?.version ?? res.file.version})`, path: pathCheck.normalized },
      });
    }
    return { ok: true, version: res.file.version };
  });
}

function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx") return "javascript";
  if (ext === "py") return "python";
  if (ext === "json") return "json";
  if (ext === "sql" || ext === "prisma") return ext;
  if (ext === "md") return "markdown";
  if (ext === "yml" || ext === "yaml") return "yaml";
  return "text";
}
