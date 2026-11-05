export type AgentStep = {
  name: string;
  input: string;
  outcome: string;
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

export class StepLog {
  private steps: (AgentStep & { id: string })[] = [];

  noteCall(id: string, name: string, input: unknown) {
    this.upsert(id, name, { input: formatStepInput(name, input) });
  }

  noteResult(id: string, name: string, output: unknown) {
    this.upsert(id, name, { outcome: formatStepOutcome(output) });
  }

  noteError(id: string, name: string, error: unknown) {
    this.upsert(id, name, { outcome: formatStepError(error) });
  }

  list(): AgentStep[] {
    return this.steps.map(({ name, input, outcome }) => ({ name, input, outcome }));
  }

  draft() {
    const list = this.list();
    return list.length ? JSON.stringify(list) : "";
  }

  private upsert(id: string, name: string, patch: Partial<AgentStep>) {
    const found = this.steps.find((step) => step.id === id);
    if (found) {
      if (patch.input !== undefined) found.input = patch.input;
      if (patch.outcome !== undefined) found.outcome = patch.outcome;
      return;
    }
    if (this.steps.length >= stepCap) return;
    this.steps.push({
      id,
      name: clip(name, 80),
      input: patch.input ?? "",
      outcome: patch.outcome ?? "",
    });
  }
}
