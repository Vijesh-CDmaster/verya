// Probe available models per provider using keys from verya/.env.local
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../verya/.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

async function j(url, headers) {
  const r = await fetch(url, { headers });
  const t = await r.text();
  try { return { code: r.status, body: JSON.parse(t) }; } catch { return { code: r.status, body: t.slice(0, 200) }; }
}

const out = {};

// Groq
if (env.GROQ_API_KEY) {
  const g = await j("https://api.groq.com/openai/v1/models", { Authorization: `Bearer ${env.GROQ_API_KEY}` });
  out.groq = g.code === 200 ? (g.body.data || []).map((m) => m.id).filter((id) => !/whisper|tts|guard|embed/i.test(id)) : g.body;
}

// Mistral
if (env.MISTRAL_API_KEY) {
  const m = await j("https://api.mistral.ai/v1/models", { Authorization: `Bearer ${env.MISTRAL_API_KEY}` });
  out.mistral = m.code === 200 ? (m.body.data || []).map((x) => x.id).filter((id) => !/embed|moderation/i.test(id)) : m.body;
}

// OpenRouter: list is public but filter to text models; free ones first
const o = await j("https://openrouter.ai/api/v1/models", {});
if (o.code === 200) {
  const all = (o.body.data || []).filter((m) => {
    const c = m.architecture?.output_modalities || ["text"];
    return c.includes("text");
  });
  const free = all.filter((m) => m.id.endsWith(":free")).map((m) => m.id);
  const paid = all.filter((m) => !m.id.endsWith(":free")).map((m) => m.id);
  out.openrouter_free = free.slice(0, 40);
  out.openrouter_paid_sample = paid.filter((id) => /deepseek|qwen|llama|mistral|gemini|claude|gpt|grok/i.test(id)).slice(0, 40);
  out.openrouter_total = all.length;
}

console.log(JSON.stringify(out, null, 1));
