export type AgentStep = {
  name: string;
  input: string;
  outcome: string;
  ms?: number;
  inputTokens?: number;
  outputTokens?: number;
};

const stepCap = 30;
const inputCap = 800;
const outcomeCap = 1200;
const secretKey = /token|secret|password|authorization|api[-_]?key/i;

function clip(value: string, max: number) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "…";
  if (typeof value === "string") return clip(value, 2000);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 12).map((item) => redactValue(item, depth + 1));
    if (value.length > 12) items.push(`… +${value.length - 12}`);
    return items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[key] = secretKey.test(key) ? "•••" : redactValue(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

function show(value: unknown, max: number) {
  if (typeof value === "string") return clip(value, max);
  return clip(JSON.stringify(redactValue(value)) ?? "", max);
}

export function formatStepInput(name: string, input: unknown) {
  if (name === "query" && input && typeof input === "object" && "sql" in input) {
    const row = input as { sql?: unknown; label?: unknown };
    const sql = typeof row.sql === "string" ? row.sql.trim() : show(row.sql, inputCap);
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const sqlText = clip(sql, inputCap);
    return label ? `${sqlText}\n\n${clip(label, 180)}` : sqlText;
  }
  if (!input || typeof input !== "object" || Object.keys(input).length === 0) return "";
  return show(input, inputCap);
}

export function formatStepOutcome(output: unknown) {
  if (output && typeof output === "object" && "error" in output) {
    return show((output as { error: unknown }).error, outcomeCap);
  }
  if (output && typeof output === "object" && "awaiting_user" in output) {
    const action = (output as { action?: unknown }).action;
    return action ? clip(`In attesa di conferma\n${show(action, outcomeCap)}`, outcomeCap) : "In attesa di conferma";
  }
  if (output && typeof output === "object" && Array.isArray((output as { rows?: unknown }).rows)) {
    const result = output as { rows: unknown[]; truncated?: boolean };
    const count = result.rows.length;
    const heading = `${count} ${count === 1 ? "riga" : "righe"}${result.truncated ? ", troncate" : ""}`;
    return clip(`${heading}\n${show(result.rows, outcomeCap)}`, outcomeCap);
  }
  if (output == null) return "ok";
  return show(output, outcomeCap);
}

export function formatStepError(error: unknown) {
  const message = error instanceof Error ? error.message : show(error, outcomeCap);
  return clip(message, outcomeCap);
}

const msCap = 600_000;
const tokenCap = 5_000_000;

function metric(value: number | undefined, max: number) {
  if (value == null || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(max, Math.round(value));
}

type StoredStep = AgentStep & { id: string; pending?: boolean };

function publishable(step: StoredStep, includePending: boolean): AgentStep | null {
  if (step.pending && !includePending) return null;
  const row: AgentStep = { name: step.name, input: step.input, outcome: step.outcome };
  const ms = metric(step.ms, msCap);
  const inputTokens = metric(step.inputTokens, tokenCap);
  const outputTokens = metric(step.outputTokens, tokenCap);
  if (ms !== undefined) row.ms = ms;
  if (inputTokens !== undefined) row.inputTokens = inputTokens;
  if (outputTokens !== undefined) row.outputTokens = outputTokens;
  const hasMetric = ms !== undefined || inputTokens !== undefined || outputTokens !== undefined;
  if (step.pending) return row;
  if ((step.name === "modello" || step.name === "contesto") && !hasMetric) return null;
  return row;
}

export class StepLog {
  private steps: StoredStep[] = [];

  constructor(initial: AgentStep[] = []) {
    for (const step of initial) {
      if (this.steps.length >= stepCap) break;
      const name = clip(step.name, 80);
      if (!name) continue;
      this.steps.push({
        id: `seed-${this.steps.length}`,
        name,
        input: step.input,
        outcome: step.outcome,
        ms: step.ms,
        inputTokens: step.inputTokens,
        outputTokens: step.outputTokens,
      });
    }
  }

  noteCall(id: string, name: string, input: unknown) {
    this.upsert(id, name, { input: formatStepInput(name, input) });
  }

  noteResult(id: string, name: string, output: unknown) {
    this.upsert(id, name, { outcome: formatStepOutcome(output) });
  }

  noteError(id: string, name: string, error: unknown) {
    this.upsert(id, name, { outcome: formatStepError(error) });
  }

  noteModelStart(id: string) {
    this.upsert(id, "modello", { pending: true, input: "", outcome: "" });
  }

  noteModelFinish(
    id: string,
    metrics: { ms?: number; inputTokens?: number; outputTokens?: number },
  ) {
    this.upsert(id, "modello", { pending: false, ...metrics });
  }

  noteDuration(id: string, ms: number) {
    const found = this.steps.find((step) => step.id === id);
    if (found) found.ms = ms;
  }

  list(): AgentStep[] {
    return this.steps.flatMap((step) => {
      const row = publishable(step, false);
      return row ? [row] : [];
    });
  }

  draft() {
    const list = this.steps.flatMap((step) => {
      const row = publishable(step, true);
      return row ? [row] : [];
    });
    return list.length ? JSON.stringify(list) : "";
  }

  private upsert(id: string, name: string, patch: Partial<StoredStep>) {
    const found = this.steps.find((step) => step.id === id);
    if (found) {
      if (patch.input !== undefined) found.input = patch.input;
      if (patch.outcome !== undefined) found.outcome = patch.outcome;
      if (patch.ms !== undefined) found.ms = patch.ms;
      if (patch.inputTokens !== undefined) found.inputTokens = patch.inputTokens;
      if (patch.outputTokens !== undefined) found.outputTokens = patch.outputTokens;
      if (patch.pending !== undefined) found.pending = patch.pending;
      return;
    }
    if (this.steps.length >= stepCap) return;
    this.steps.push({
      id,
      name: clip(name, 80),
      input: patch.input ?? "",
      outcome: patch.outcome ?? "",
      ms: patch.ms,
      inputTokens: patch.inputTokens,
      outputTokens: patch.outputTokens,
      pending: patch.pending,
    });
  }
}
