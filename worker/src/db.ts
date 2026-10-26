import pg from "pg";
import type { Turn, TurnMessage } from "./reply.js";

const { Client } = pg;

export function openDatabase(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  const client = new Client({
    connectionString: url.toString(),
    application_name: "2tapdoc-worker",
    ssl: { rejectUnauthorized: false },
  });
  client.on("error", (error: Error) => {
    console.error("database socket error", error.message);
  });
  return client;
}

export async function claimTurn(client: pg.Client, workerId: string): Promise<Turn | null> {
  const result = await client.query<{ turn: unknown }>(
    "select private.claim_bot_job($1) as turn",
    [workerId],
  );
  return parseTurn(result.rows[0]?.turn);
}

export async function completeTurn(client: pg.Client, workerId: string, jobId: string, body: string) {
  await client.query("select private.complete_bot_job($1, $2, $3)", [workerId, jobId, body]);
}

export async function failTurn(client: pg.Client, workerId: string, jobId: string, reason: string) {
  await client.query("select private.fail_bot_job($1, $2, $3)", [
    workerId,
    jobId,
    reason.slice(0, 200),
  ]);
}

function parseTurn(value: unknown): Turn | null {
  if (value == null) return null;
  if (typeof value !== "object") throw new Error("Unexpected job payload");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.botId !== "string" || typeof row.botName !== "string") {
    throw new Error("Unexpected job payload");
  }
  if (typeof row.chatId !== "string") throw new Error("Unexpected job payload");
  if (row.memoBody != null && typeof row.memoBody !== "string") throw new Error("Unexpected job payload");
  if (!Array.isArray(row.messages)) throw new Error("Unexpected job payload");

  const messages: TurnMessage[] = row.messages.map((message) => {
    if (typeof message !== "object" || message == null) throw new Error("Unexpected job payload");
    const item = message as Record<string, unknown>;
    if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") {
      throw new Error("Unexpected job payload");
    }
    return { role: item.role, content: item.content };
  });

  return {
    id: row.id,
    botId: row.botId,
    botName: row.botName,
    chatId: row.chatId,
    memoBody: typeof row.memoBody === "string" ? row.memoBody : null,
    messages,
  };
}
