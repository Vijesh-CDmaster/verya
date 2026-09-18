// Throwaway: reproduce the numeric-id understanding failure against validateCoerced.
import { WorkflowSchema } from "./src/schemas/pipeline";
import { validateCoerced } from "./src/lib/ai/provider";

const data = {
  title: "Support reply tool",
  tasks: [
    { id: 1, title: "Build intake UI", category: "frontend", dependsOn: [], risk: "low" },
    { id: 2, title: "Draft-reply service", category: "backend", dependsOn: [1], risk: "medium" },
  ],
  ambiguities: [],
};

// Direct test of the real exported function:
try {
  const out = validateCoerced(WorkflowSchema, data);
  console.log("validateCoerced SUCCESS:", JSON.stringify(out.tasks.map(t => [t.id, t.dependsOn])));
} catch (e) {
  console.log("validateCoerced FAILED:", e.message);
}

const first = WorkflowSchema.safeParse(data);
if (first.success) {
  console.log("validated WITHOUT coercion — z.preprocess already handles it");
} else {
  console.log("first-pass issues:");
  for (const i of first.error.issues) {
    console.log(" ", i.code, "|path:", i.path.join("."), "|expected:", i.expected, "|values:", JSON.stringify(i.values));
  }
  // Mirror validateCoerced's logic inline (import would drag the whole provider).
  const fixed = structuredClone(data);
  let coerced = 0;
  for (const issue of first.error.issues) {
    const path = issue.path;
    if (path.length === 0) continue;
    let parent = fixed;
    let ok = true;
    for (let k = 0; k < path.length - 1; k++) {
      const next = parent?.[path[k]];
      if (next == null || typeof next !== "object") { ok = false; break; }
      parent = next;
    }
    if (!ok) continue;
    const leaf = path[path.length - 1];
    const cur = parent[leaf];
    let value;
    if (issue.code === "invalid_type" && issue.expected === "string" && typeof cur === "number") value = String(cur);
    if (issue.code === "invalid_type" && issue.expected === "number" && typeof cur === "string" && Number.isFinite(Number(cur))) value = Number(cur);
    if (value !== undefined) { parent[leaf] = value; coerced++; }
  }
  console.log("coerced:", coerced);
  const second = WorkflowSchema.safeParse(fixed);
  console.log("second pass:", second.success ? "SUCCESS" : JSON.stringify(second.error.issues.map(i => i.code + ":" + i.path.join("."))));
}
