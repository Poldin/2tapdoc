export type AgentStep = {
  name: string;
  input: string;
  outcome: string;
};

function asText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\u0000/g, "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function parseAgentSteps(value: unknown): AgentStep[] {
  let raw = value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text.startsWith("[")) return [];
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const steps: AgentStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as { name?: unknown; input?: unknown; outcome?: unknown };
    const name = asText(row.name, 80);
    if (!name) continue;
    steps.push({
      name,
      input: asText(row.input, 800),
      outcome: asText(row.outcome, 4000),
    });
    if (steps.length >= 30) break;
  }
  return steps;
}
