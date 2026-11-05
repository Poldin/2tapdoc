export type AgentStep = {
  name: string;
  input: string;
  outcome: string;
  ms?: number;
  inputTokens?: number;
  outputTokens?: number;
};

const msMax = 600_000;
const tokenMax = 5_000_000;

function asText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  const text = value.replace(/\u0000/g, "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function asCount(value: unknown, max: number): number | undefined {
  const numeric = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return undefined;
  const rounded = Math.round(numeric);
  if (rounded < 0 || rounded > max) return undefined;
  return rounded;
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
    const row = item as {
      name?: unknown;
      input?: unknown;
      outcome?: unknown;
      ms?: unknown;
      inputTokens?: unknown;
      outputTokens?: unknown;
    };
    const name = asText(row.name, 80);
    if (!name) continue;
    const step: AgentStep = {
      name,
      input: asText(row.input, 800),
      outcome: asText(row.outcome, 4000),
    };
    const ms = asCount(row.ms, msMax);
    const inputTokens = asCount(row.inputTokens, tokenMax);
    const outputTokens = asCount(row.outputTokens, tokenMax);
    if (ms !== undefined) step.ms = ms;
    if (inputTokens !== undefined) step.inputTokens = inputTokens;
    if (outputTokens !== undefined) step.outputTokens = outputTokens;
    steps.push(step);
    if (steps.length >= 30) break;
  }
  return steps;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const rounded = Math.round(ms);
  if (rounded < 1000) return `${rounded} ms`;
  const seconds = rounded / 1000;
  if (seconds < 10) return `${seconds.toFixed(1).replace(".", ",")} s`;
  return `${Math.round(seconds)} s`;
}

const tokenUnits = [
  { div: 1_000_000_000, suffix: "B" },
  { div: 1_000_000, suffix: "M" },
  { div: 1_000, suffix: "k" },
] as const;

function tokenLabel(shown: number, suffix: string) {
  const text = Number.isInteger(shown) ? String(shown) : shown.toFixed(1).replace(".", ",");
  return `${text}${suffix}`;
}

export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  const n = Math.round(value);
  for (let index = 0; index < tokenUnits.length; index += 1) {
    const { div, suffix } = tokenUnits[index];
    if (n < div) continue;
    const scaled = n / div;
    const shown = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
    if (shown >= 1000 && index > 0) return tokenLabel(1, tokenUnits[index - 1].suffix);
    if (shown >= 1000) return tokenLabel(Math.round(shown), suffix);
    return tokenLabel(shown, suffix);
  }
  return String(n);
}

export function formatStepTokens(step: Pick<AgentStep, "inputTokens" | "outputTokens">): string {
  const parts: string[] = [];
  if (typeof step.inputTokens === "number") parts.push(`${formatTokenCount(step.inputTokens)} in`);
  if (typeof step.outputTokens === "number") parts.push(`${formatTokenCount(step.outputTokens)} out`);
  return parts.join(" · ");
}

export function stepTotals(steps: AgentStep[]): { ms: number; tokens: number } {
  let ms = 0;
  let tokens = 0;
  for (const step of steps) {
    if (typeof step.ms === "number") ms += step.ms;
    if (typeof step.inputTokens === "number") tokens += step.inputTokens;
    if (typeof step.outputTokens === "number") tokens += step.outputTokens;
  }
  return { ms, tokens };
}
