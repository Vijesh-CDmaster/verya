// Parses model execution output into structured file operations (spec Part 5).
// Primary path: the execution prompt asks for a `{"files":[{path,operation,content}]}` JSON
// block; this parser accepts it. Fallback path: legacy fenced code blocks with file-path
// hints (```lang // path/to/file). Design/explanation prose is NEVER turned into files —
// only explicit path-declared blocks or the structured JSON are.
import type { FileOp } from "./workspace";

const MAX_OPS = 20;
const MAX_FILE_CHARS = 60000;

type RawOp = { path: string; operation: "create" | "update" | "delete"; content: string };

/** Try to extract the structured `{"files":[...]}` payload from the output. */
function parseStructuredJson(output: string): RawOp[] | null {
  const fenced = output.match(/```(?:json)?\s*(\{[\s\S]*?"files"[\s\S]*?\})\s*```/);
  const candidates: string[] = [];
  if (fenced?.[1]) candidates.push(fenced[1]);
  // Also try the whole output when it *starts* with a JSON object mentioning files.
  const trimmed = output.trim();
  if (trimmed.startsWith("{") && trimmed.includes('"files"')) candidates.push(trimmed);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { files?: unknown };
      if (!Array.isArray(parsed.files)) continue;
      const ops: RawOp[] = [];
      for (const item of parsed.files) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const path = typeof rec.path === "string" ? rec.path : "";
        if (!path) continue;
        const operation = rec.operation === "delete" ? "delete" : rec.operation === "update" ? "update" : "create";
        const content = typeof rec.content === "string" ? rec.content : "";
        ops.push({ path, operation, content });
      }
      if (ops.length > 0) return ops.slice(0, MAX_OPS);
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Fallback: fenced code blocks whose first comment line (or an info-string suffix)
 * names a file, e.g.  ```ts  // src/lib/auth.ts  ...```
 * Pure explanation text without any file-declared block yields [].
 */
function parseFencedBlocks(output: string): RawOp[] {
  const ops: RawOp[] = [];
  const re = /```([a-zA-Z0-9+#._-]*)\s*(?:[^\n]*?file:\s*([^\s`]+))?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) && ops.length < MAX_OPS) {
    const info = m[1] ?? "";
    const declared = m[2];
    const body = m[3] ?? "";
    // First non-empty line often carries the path as a comment.
    const firstLine = body.split("\n").find((l) => l.trim().length > 0) ?? "";
    const commentPath =
      /^\s*(?:\/\/|#|<!--|--)\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]{1,10})\s*$/.exec(firstLine)?.[1] ??
      /^\/\*\s*([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]{1,10})\s*\*\/\s*$/.exec(firstLine)?.[1];
    const path = declared ?? commentPath;
    if (!path) continue;
    // Strip the path-carrying first line from the content (it is a declaration, not code).
    const content = (commentPath ? body.split("\n").slice(body.split("\n").indexOf(firstLine) + 1).join("\n") : body).trim();
    if (!content) continue;
    ops.push({ path, operation: "create", content: content.slice(0, MAX_FILE_CHARS) });
    void info;
  }
  return ops;
}

/** Entry point: structured JSON first, then fenced file-declared blocks. */
export function extractFileOps(output: string): FileOp[] {
  const structured = parseStructuredJson(output);
  const raw = structured ?? parseFencedBlocks(output);
  // Deduplicate by path (last op wins for create/update, keeps delete).
  const byPath = new Map<string, RawOp>();
  for (const op of raw) byPath.set(op.path, op);
  return [...byPath.values()].map((op) => ({
    path: op.path,
    operation: op.operation,
    content: op.content.slice(0, MAX_FILE_CHARS),
  }));
}
