import { wrapLanguageModel, type LanguageModel } from "ai";
import type pg from "pg";
import { recordModelUse, type ModelSource } from "./db.js";

type UsageTotals = {
  inputTokens?: { total?: number | null };
  outputTokens?: { total?: number | null };
};

function count(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(5_000_000, Math.round(value));
}

function toolNames(values: string[]) {
  const names: string[] = [];
  for (const value of values) {
    const name = value.trim().slice(0, 80);
    if (!name || names.includes(name)) continue;
    names.push(name);
    if (names.length >= 12) break;
  }
  return names;
}

function partToolName(part: unknown) {
  if (!part || typeof part !== "object" || !("type" in part) || !("toolName" in part)) return "";
  const row = part as { type?: unknown; toolName?: unknown };
  if (row.type !== "tool-call" || typeof row.toolName !== "string") return "";
  return row.toolName;
}

function partUsage(part: unknown): UsageTotals | undefined {
  if (!part || typeof part !== "object" || !("type" in part) || !("usage" in part)) return undefined;
  const row = part as { type?: unknown; usage?: unknown };
  if (row.type !== "finish" || !row.usage || typeof row.usage !== "object") return undefined;
  return row.usage as UsageTotals;
}

async function readMeter(
  stream: ReadableStream<unknown>,
  onFinish: (usage: UsageTotals, tools: string[]) => Promise<void>,
) {
  const reader = stream.getReader();
  const tools: string[] = [];
  let usage: UsageTotals | undefined;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const name = partToolName(next.value);
      if (name) tools.push(name);
      usage = partUsage(next.value) ?? usage;
    }
  } finally {
    reader.releaseLock();
  }
  if (usage) await onFinish(usage, tools);
}

/**
 * Every model call for a job goes through this meter: the reply, each tool round, the context fold, and the public page.
 */
export function createModelMeter(client: pg.Client, workerId: string, source: ModelSource, jobId: string) {
  let call = 0;

  const charge = (callKey: string, model: string, usage: UsageTotals | undefined, tools: string[]) => {
    const inputTokens = count(usage?.inputTokens?.total);
    const outputTokens = count(usage?.outputTokens?.total);
    if (inputTokens + outputTokens === 0) return Promise.resolve();
    return recordModelUse(
      client,
      workerId,
      source,
      jobId,
      callKey,
      model,
      inputTokens,
      outputTokens,
      toolNames(tools),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "token meter failed";
      console.error("token meter", jobId, callKey, message);
    });
  };

  return {
    wrap(model: Exclude<LanguageModel, string>) {
      return wrapLanguageModel({
        model,
        middleware: {
          specificationVersion: "v4",
          wrapGenerate: async ({ doGenerate, model: wrapped }) => {
            const callKey = String(++call);
            const result = await doGenerate();
            const tools = result.content.flatMap((part) => (part.type === "tool-call" ? [part.toolName] : []));
            await charge(callKey, wrapped.modelId, result.usage, tools);
            return result;
          },
          wrapStream: async ({ doStream, model: wrapped }) => {
            const callKey = String(++call);
            const result = await doStream();
            const [stream, meter] = result.stream.tee();
            void readMeter(meter, (usage, tools) => charge(callKey, wrapped.modelId, usage, tools)).catch(
              (error: unknown) => {
                const message = error instanceof Error ? error.message : "token meter failed";
                console.error("token meter", jobId, callKey, message);
              },
            );
            return { ...result, stream };
          },
        },
      });
    },
  };
}
