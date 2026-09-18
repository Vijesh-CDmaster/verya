// Probe all 4 providers once each — which can serve a tiny structured stage right now?
import "dotenv/config";
import fs from "fs";

const envSrc = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const get = (k) => process.env[k] ?? (envSrc.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "").trim();

const GEMINI_KEY = get("GEMINI_API_KEY");
const GROQ_KEY = get("GROQ_API_KEY");
const MISTRAL_KEY = get("MISTRAL_API_KEY");
const OPENROUTER_KEY = get("OPENROUTER_API_KEY");

const probe = async (name, url, headers, body) => {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`${name}: HTTP ${res.status} — ${text.slice(0, 120).replace(/\n/g, " ")}`);
  } catch (e) {
    console.log(`${name}: FAILED — ${e.message}`);
  }
};

await probe("gemini", `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`, { "x-goog-api-key": GEMINI_KEY }, { contents: [{ parts: [{ text: "Say OK" }] }] });
await probe("groq", "https://api.groq.com/openai/v1/chat/completions", { Authorization: `Bearer ${GROQ_KEY}` }, { model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "Say OK" }], max_tokens: 10 });
await probe("mistral", "https://api.mistral.ai/v1/chat/completions", { Authorization: `Bearer ${MISTRAL_KEY}` }, { model: "mistral-medium-latest", messages: [{ role: "user", content: "Say OK" }], max_tokens: 10 });
await probe("openrouter", "https://openrouter.ai/api/v1/chat/completions", { Authorization: `Bearer ${OPENROUTER_KEY}` }, { model: "z-ai/glm-5.2:free", messages: [{ role: "user", content: "Say OK" }], max_tokens: 10 });
