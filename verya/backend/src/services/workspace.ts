// Verya — Generated-project workspace file store.
// Per-session, in-memory project workspace that execution writes REAL source files
// into. Paths are strictly validated and confined to the virtual project root
// (defense against traversal, absolute paths, and platform drive letters). The store
// is the single source of truth for the Explorer/Editor; the frontend renders it via
// GET /api/pipeline/:id/files — it never invents files.
//
// Backward compatibility: `ExecutionResult.code` artifacts (legacy "design
// artifacts") are unchanged. Source files live beside them in
// `session.workspaceFiles` (schema: WorkspaceFilesSchema).

import { z } from "zod";
import type { PipelineSession } from "../schemas/pipeline";
import { getSession, saveSession } from "../repositories/sessions";

// ---------- Schema ----------

export const FileOpSchema = z.object({
  path: z.string().min(1).max(200),
  operation: z.enum(["create", "update", "delete"]),
  content: z.string().max(60000).default(""),
});
export type FileOp = z.infer<typeof FileOpSchema>;

export const WorkspaceFileSchema = z.object({
  path: z.string().max(200),
  content: z.string().max(60000),
  /** null for never-modified created files (compare original vs content). */
  original: z.string().max(60000),
  taskId: z.string(),
  model: z.string(),
  updatedAt: z.string(),
  version: z.number().int().min(1),
});
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>;

// ---------- Path security (the core guardrail) ----------

export type PathCheck = { ok: true; normalized: string } | { ok: false; reason: string };

const RESERVED_BASE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

/**
 * Validates and normalizes a model-provided path against the project workspace.
 * Rejects: absolute paths (posix + windows + UNC + drive letters), traversal,
 * backslashes (normalized but never allowed to escape), reserved device names,
 * and empty/oversized segments. Returns a posix-style relative path on success.
 */
export function checkWorkspacePath(rawPath: string): PathCheck {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return { ok: false, reason: "empty path" };
  }
  let p = rawPath.trim().replace(/\\/g, "/");
  if (p.length > 200) return { ok: false, reason: "path exceeds 200 characters" };
  if (/^[a-zA-Z]:/.test(p)) return { ok: false, reason: `absolute path not allowed: ${rawPath}` };
  if (p.startsWith("//") || p.startsWith("\\\\")) return { ok: false, reason: "UNC paths not allowed" };
  if (p.startsWith("/")) return { ok: false, reason: `absolute path not allowed: ${rawPath}` };
  // Strip a leading "project/" prefix (models mirror the workspace layout); the
  // workspace root IS the project root.
  p = p.replace(/^\.?\/?project\//, "");
  const segments: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return { ok: false, reason: `path traversal rejected: ${rawPath}` };
    if (seg.length > 100) return { ok: false, reason: "path segment too long" };
    if (RESERVED_BASE.test(seg)) return { ok: false, reason: `reserved device name: ${seg}` };
    if (/[\u0000-\u001f]/.test(seg)) return { ok: false, reason: "control characters in path" };
    segments.push(seg);
  }
  if (segments.length === 0) return { ok: false, reason: "empty path" };
  return { ok: true, normalized: segments.join("/") };
}

// ---------- Store operations (all session-scoped, all validated) ----------

type ApplyResult =
  | { ok: true; op: { path: string; operation: FileOp["operation"] }; created: boolean }
  | { ok: false; reason: string };

export function applyFileOpToSession(
  session: PipelineSession,
  op: FileOp,
  ctx: { taskId: string; model: string }
): ApplyResult {
  session.workspaceFiles ??= [];
  const check = checkWorkspacePath(op.path);
  if (!check.ok) return { ok: false, reason: check.reason };
  const path = check.normalized;
  session.workspaceFiles ??= [];
  const files = session.workspaceFiles;
  const existing = files.find((f) => f.path === path);

  if (op.operation === "delete") {
    if (!existing) return { ok: false, reason: `delete target not found: ${path}` };
    session.workspaceFiles = files.filter((f) => f.path !== path);
    return { ok: true, op: { path, operation: "delete" }, created: false };
  }
  if (op.operation === "update" && !existing) {
    return { ok: false, reason: `update target not found: ${path} (use create)` };
  }
  if (op.operation === "create" && existing) {
    // Model re-declared an existing file: treat as an update (idempotent, no duplicate).
    if (existing.content === op.content) return { ok: true, op: { path, operation: "create" }, created: false };
    existing.original = existing.content;
    existing.content = op.content.slice(0, 60000);
    existing.taskId = ctx.taskId;
    existing.model = ctx.model;
    existing.version += 1;
    existing.updatedAt = new Date().toISOString();
    return { ok: true, op: { path, operation: "update" }, created: false };
  }
  if (existing) {
    existing.original = existing.content;
    existing.content = op.content.slice(0, 60000);
    existing.taskId = ctx.taskId;
    existing.model = ctx.model;
    existing.version += 1;
    existing.updatedAt = new Date().toISOString();
    return { ok: true, op: { path, operation: "update" }, created: false };
  }
  files.push({
    path,
    content: op.content.slice(0, 60000),
    original: "",
    taskId: ctx.taskId,
    model: ctx.model,
    updatedAt: new Date().toISOString(),
    version: 1,
  });
  return { ok: true, op: { path, operation: "create" }, created: true };
}

// ---------- Persistence ----------

export async function loadWorkspace(orgId: string, sessionId: string): Promise<PipelineSession | null> {
  return getSession(orgId, sessionId);
}

export async function saveWorkspace(orgId: string, session: PipelineSession): Promise<void> {
  await saveSession(orgId, session);
}

/** Sorted listing for the Explorer (dirs implied by paths). */
export function listWorkspaceFiles(session: PipelineSession): WorkspaceFile[] {
  return [...(session.workspaceFiles ?? [])].sort((a, b) => a.path.localeCompare(b.path));
}

/** The editor surface: current content + original for dirty-state display. */
export function readWorkspaceFile(
  session: PipelineSession,
  rawPath: string
): { file: WorkspaceFile } | { error: string; status: number } {
  const check = checkWorkspacePath(rawPath);
  if (!check.ok) return { error: check.reason, status: 422 };
  const file = (session.workspaceFiles ?? []).find((f) => f.path === check.normalized);
  if (!file) return { error: "File not found", status: 404 };
  return { file };
}
