import { createHash } from "node:crypto";
import type { AlgorithmPlan, PipelineSession, Task, TaskFingerprint, Workflow } from "../../schemas/pipeline";

const KEYWORDS: Array<[string, string]> = [
  ["auth", "authentication"],
  ["security", "security"],
  ["encrypt", "cryptography"],
  ["database", "data-modeling"],
  ["sql", "data-modeling"],
  ["api", "api-design"],
  ["integration", "integration"],
  ["deploy", "deployment"],
  ["cloud", "cloud-infrastructure"],
  ["test", "testing"],
  ["ai", "ai-ml"],
  ["model", "ai-ml"],
  ["parse", "data-processing"],
  ["file", "file-processing"],
  ["ui", "ui-development"],
  ["frontend", "ui-development"],
];

function level(value: number): "small" | "medium" | "large" {
  return value > 1000 ? "large" : value > 350 ? "medium" : "small";
}

function outputFormat(text: string): TaskFingerprint["outputFormat"] {
  const value = text.toLowerCase();
  if (/\b(json|schema|object|payload|api)\b/.test(value)) return "structured-data";
  if (/\b(code|component|function|implement|endpoint)\b/.test(value)) return "code";
  if (/\b(report|analysis|review|document|plan)\b/.test(value)) return "analysis";
  return "text";
}

function capabilities(task: Task, algorithm?: string): string[] {
  const text = `${task.title} ${task.description} ${task.category} ${algorithm ?? ""}`.toLowerCase();
  const values = KEYWORDS.filter(([keyword]) => text.includes(keyword)).map(([, capability]) => capability);
  if (task.category === "backend") values.push("backend-development");
  if (task.category === "devops") values.push("operations");
  if (task.complexity === "high" || task.risk === "high") values.push("verification");
  return Array.from(new Set(values)).sort();
}

export function fingerprintTask(workflow: Workflow, task: Task, algorithms?: AlgorithmPlan | null): TaskFingerprint {
  const algorithm = algorithms?.tasks.find((item) => item.taskId === task.id);
  const source = `${workflow.title}|${workflow.summary}|${task.id}|${task.title}|${task.description}|${task.category}|${task.complexity}|${task.risk}|${task.dependsOn.slice().sort().join(",")}|${algorithm?.selected ?? ""}|${algorithm?.options.map((option) => option.name).sort().join(",") ?? ""}`;
  const contextChars = workflow.summary.length + task.title.length + task.description.length + task.dependsOn.length * 80;
  const reasoning: TaskFingerprint["reasoningRequirement"] = task.complexity === "high" || task.risk === "high"
    ? "deep"
    : algorithm?.options && algorithm.options.length > 1
      ? "evaluative"
      : task.complexity === "medium" || task.risk === "medium"
        ? "standard"
        : "direct";
  const base = {
    version: 1 as const,
    complexity: task.complexity,
    domain: task.category,
    risk: task.risk,
    contextSize: level(contextChars),
    outputFormat: outputFormat(`${task.title} ${task.description}`),
    reasoningRequirement: reasoning,
    requiredCapabilities: capabilities(task, algorithm?.selected),
  };
  const signature = createHash("sha256").update(JSON.stringify(base)).update(source).digest("hex").slice(0, 16);
  return { ...base, signature };
}

export function refreshTaskFingerprints(session: PipelineSession): void {
  if (!session.workflow) return;
  session.taskFingerprints = Object.fromEntries(
    session.workflow.tasks.map((task) => [task.id, fingerprintTask(session.workflow!, task, session.algorithms)])
  );
  session.workflow.tasks = session.workflow.tasks.map((task) => ({
    ...task,
    fingerprint: session.taskFingerprints![task.id],
  }));
}
