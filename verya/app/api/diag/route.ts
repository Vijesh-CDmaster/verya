// TEMPORARY diagnostics: one tiny call per provider, reports which providers can serve
// a structured stage today. Delete or lock down before production.
import { NextRequest } from "next/server";
import { rateLimit, clientKey } from "@/lib/middleware";

export const runtime = "nodejs";
export const maxDuration = 150;

export async function GET(req: NextRequest) {
  const rl = rateLimit(`diag:${clientKey(req)}`, 4, 60_000);
  if (!rl.ok) return Response.json({ error: "Rate limited" }, { status: 429 });

  const results: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
  const t0 = Date.now();

  // Gemini via the app's own structured-stage path.
  if (process.env.GEMINI_API_KEY) {
    try {
      const { geminiAdapters } = await import("@/lib/pipeline/provider");
      const wf = await geminiAdapters.understand(
        "Todo app. Add task, list tasks, mark done. Mobile friendly."
      );
      results.gemini = { ok: true, ms: Date.now() - t0, error: `${wf.tasks.length} tasks` };
    } catch (e) {
      results.gemini = { ok: false, error: (e as Error).message.slice(0, 220) };
    }
  } else {
    results.gemini = { ok: false, error: "no key" };
  }

  // OpenAI-compatible providers via direct minimal calls.
  const checks: Array<{ name: string; key?: string; url: string; model: string }> = [
    { name: "groq", key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-20b" },
    { name: "mistral", key: process.env.MISTRAL_API_KEY, url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-medium-latest" },
    { name: "openrouter", key: process.env.OPENROUTER_API_KEY, url: "https://openrouter.ai/api/v1/chat/completions", model: "z-ai/glm-5.2:free" },
  ];

  for (const c of checks) {
    if (!c.key) {
      results[c.name] = { ok: false, error: "no key" };
      continue;
    }
    const started = Date.now();
    try {
      const res = await fetch(c.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
        body: JSON.stringify({
          model: c.model,
          messages: [
            { role: "system", content: "Return ONLY a JSON object {\"ok\":true}." },
            { role: "user", content: "Confirm." },
          ],
          temperature: 0,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(40_000),
      });
      const body = await res.text();
      results[c.name] = res.ok
        ? { ok: true, ms: Date.now() - started }
        : { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 160)}` };
    } catch (e) {
      results[c.name] = { ok: false, error: (e as Error).message.slice(0, 160) };
    }
  }

  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
