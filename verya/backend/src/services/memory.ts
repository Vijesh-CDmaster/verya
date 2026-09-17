// Memory service (F9) — embedding generation + org-scoped memory operations.
// Embeddings use Gemini's text-embedding model when the key is present; otherwise a
// deterministic local hashing embedder keeps vector search functional without a key
// (clearly isolated single point to swap for a real embedder in production).
import { GoogleGenAI } from "@google/genai";
import { insertMemory, searchMemory, skillMap, exportMemory, deleteMemory, type MemoryRow } from "../repositories/memory";

const EMBED_DIM = 1536;
const EMBED_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";

let embedClient: GoogleGenAI | null = null;

/** Deterministic local fallback embedder: hashed bag-of-words into EMBED_DIM dims. */
function localEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBED_DIM;
    vec[idx] += 1;
    const idx2 = Math.abs(Math.imul(h, 31)) % EMBED_DIM;
    vec[idx2] += 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function embed(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return localEmbed(text);
  try {
    embedClient ??= new GoogleGenAI({ apiKey: key });
    const res = await embedClient.models.embedContent({
      model: EMBED_MODEL,
      contents: text.slice(0, 8000),
      config: { outputDimensionality: EMBED_DIM },
    });
    const values = res.embeddings?.[0]?.values;
    if (values && values.length === EMBED_DIM) return values;
    if (values && values.length > 0) {
      // pad/truncate defensively to EMBED_DIM
      const out = new Array<number>(EMBED_DIM).fill(0);
      values.slice(0, EMBED_DIM).forEach((v, i) => (out[i] = v));
      return out;
    }
    return localEmbed(text);
  } catch {
    return localEmbed(text);
  }
}

export async function recordMemory(input: {
  orgId: string;
  sessionId?: string;
  taskCategory: string;
  model: string;
  outcome: "accepted" | "edited" | "rejected" | "escalated" | "verified" | "flagged";
  title: string;
  content: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const embedding = await embed(`${input.title}\n${input.content}`);
  await insertMemory({ ...input, embedding });
}

export async function findSimilar(opts: {
  orgId: string;
  taskCategory: string;
  query: string;
  limit?: number;
}): Promise<MemoryRow[]> {
  const embedding = await embed(opts.query);
  try {
    return await searchMemory(opts.orgId, embedding, {
      taskCategory: opts.taskCategory,
      limit: opts.limit ?? 5,
    });
  } catch {
    return []; // pgvector not reachable — memory search degrades to empty, never blocks routing
  }
}

export async function getSkillMap(orgId: string) {
  return skillMap(orgId);
}

export async function exportOrgMemory(orgId: string) {
  return exportMemory(orgId);
}

export async function deleteOrgMemory(orgId: string): Promise<number> {
  return deleteMemory(orgId);
}
