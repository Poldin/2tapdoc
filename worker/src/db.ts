import pg from "pg";
import type { ClinicDoctor, ClinicObject, Turn, TurnMessage } from "./reply.js";

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

export async function completeTurn(
  client: pg.Client,
  workerId: string,
  jobId: string,
  body: string,
) {
  await client.query("select private.complete_bot_job($1, $2, $3)", [workerId, jobId, body]);
}

export async function failTurn(
  client: pg.Client,
  workerId: string,
  jobId: string,
  reason: string,
) {
  await client.query("select private.fail_bot_job($1, $2, $3)", [
    workerId,
    jobId,
    reason.slice(0, 200),
  ]);
}

export async function enqueueBotAlert(
  client: pg.Client,
  workerId: string,
  botId: string,
  chatId: string,
  prompt: string,
) {
  await client.query("select private.enqueue_bot_alert($1, $2, $3, $4)", [
    workerId,
    botId,
    chatId,
    prompt,
  ]);
}

export async function botListAppointments(
  client: pg.Client,
  workerId: string,
  jobId: string,
  params: {
    from: string;
    to: string;
    doctorIds?: string[];
    clinicalObjectIds?: string[];
    patientIds?: string[];
  },
): Promise<unknown> {
  const result = await client.query<{ items: unknown }>(
    "select private.bot_list_appointments($1, $2, $3::timestamptz, $4::timestamptz, $5::uuid[], $6::uuid[], $7::uuid[]) as items",
    [
      workerId,
      jobId,
      params.from,
      params.to,
      params.doctorIds?.length ? params.doctorIds : null,
      params.clinicalObjectIds?.length ? params.clinicalObjectIds : null,
      params.patientIds?.length ? params.patientIds : null,
    ],
  );
  return result.rows[0]?.items ?? [];
}

export async function botCreateAppointments(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: Array<{
    startsAt: string;
    endsAt: string;
    title?: string | null;
    note?: string | null;
    doctorIds?: string[];
    clinicalObjectIds?: string[];
    patientIds?: string[];
  }>,
): Promise<unknown> {
  const result = await client.query<{ created: unknown }>(
    "select private.bot_create_appointments($1, $2, $3::jsonb) as created",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.created ?? [];
}

export async function botUpdateAppointments(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: Array<{
    appointmentId: string;
    startsAt?: string;
    endsAt?: string;
    title?: string | null;
    note?: string | null;
    doctorIds?: string[];
    clinicalObjectIds?: string[];
    patientIds?: string[];
  }>,
): Promise<unknown> {
  const result = await client.query<{ updated: unknown }>(
    "select private.bot_update_appointments($1, $2, $3::jsonb) as updated",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.updated ?? [];
}

export async function botListAgendaBlocks(
  client: pg.Client,
  workerId: string,
  jobId: string,
  params: {
    from: string;
    to: string;
    doctorIds?: string[];
    clinicalObjectIds?: string[];
  },
): Promise<unknown> {
  const result = await client.query<{ items: unknown }>(
    "select private.bot_list_agenda_blocks($1, $2, $3::timestamptz, $4::timestamptz, $5::uuid[], $6::uuid[]) as items",
    [
      workerId,
      jobId,
      params.from,
      params.to,
      params.doctorIds?.length ? params.doctorIds : null,
      params.clinicalObjectIds?.length ? params.clinicalObjectIds : null,
    ],
  );
  return result.rows[0]?.items ?? [];
}

export async function botCreateAgendaBlocks(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: Array<{
    startsAt: string;
    endsAt: string;
    title: string;
    description?: string | null;
    doctorIds?: string[];
    clinicalObjectIds?: string[];
  }>,
): Promise<unknown> {
  const result = await client.query<{ created: unknown }>(
    "select private.bot_create_agenda_blocks($1, $2, $3::jsonb) as created",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.created ?? [];
}

export async function botUpdateAgendaBlocks(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: Array<{
    blockId: string;
    startsAt?: string;
    endsAt?: string;
    title?: string;
    description?: string | null;
    doctorIds?: string[];
    clinicalObjectIds?: string[];
  }>,
): Promise<unknown> {
  const result = await client.query<{ updated: unknown }>(
    "select private.bot_update_agenda_blocks($1, $2, $3::jsonb) as updated",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.updated ?? [];
}

export async function botDeleteAgendaBlocks(
  client: pg.Client,
  workerId: string,
  jobId: string,
  blockIds: string[],
): Promise<unknown> {
  const result = await client.query<{ deleted: unknown }>(
    "select private.bot_delete_agenda_blocks($1, $2, $3::uuid[]) as deleted",
    [workerId, jobId, blockIds],
  );
  return result.rows[0]?.deleted ?? [];
}

export async function botDeleteAppointments(
  client: pg.Client,
  workerId: string,
  jobId: string,
  appointmentIds: string[],
): Promise<unknown> {
  const result = await client.query<{ deleted: unknown }>(
    "select private.bot_delete_appointments($1, $2, $3::uuid[]) as deleted",
    [workerId, jobId, appointmentIds],
  );
  return result.rows[0]?.deleted ?? [];
}

export async function botSearchPatients(
  client: pg.Client,
  workerId: string,
  jobId: string,
  query?: string,
): Promise<unknown> {
  const result = await client.query<{ patients: unknown }>(
    "select private.bot_search_patients($1, $2, $3) as patients",
    [workerId, jobId, query ?? null],
  );
  return result.rows[0]?.patients ?? [];
}

export async function botRenameClinic(
  client: pg.Client,
  workerId: string,
  jobId: string,
  name: string,
): Promise<unknown> {
  const result = await client.query<{ clinic: unknown }>(
    "select private.bot_rename_clinic($1, $2, $3) as clinic",
    [workerId, jobId, name],
  );
  return result.rows[0]?.clinic ?? null;
}

export async function botListChats(client: pg.Client, workerId: string, jobId: string): Promise<unknown> {
  const result = await client.query<{ items: unknown }>(
    "select private.bot_list_chats($1, $2) as items",
    [workerId, jobId],
  );
  return result.rows[0]?.items ?? [];
}

export async function botListBots(client: pg.Client, workerId: string, jobId: string): Promise<unknown> {
  const result = await client.query<{ items: unknown }>(
    "select private.bot_list_bots($1, $2) as items",
    [workerId, jobId],
  );
  return result.rows[0]?.items ?? [];
}

export async function botCreateChats(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: unknown,
): Promise<unknown> {
  const result = await client.query<{ created: unknown }>(
    "select private.bot_create_chats($1, $2, $3::jsonb) as created",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.created ?? [];
}

export async function botCreateBots(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: unknown,
): Promise<unknown> {
  const result = await client.query<{ created: unknown }>(
    "select private.bot_create_bots($1, $2, $3::jsonb) as created",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.created ?? [];
}

export async function botUpdateChats(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: unknown,
): Promise<unknown> {
  const result = await client.query<{ updated: unknown }>(
    "select private.bot_update_chats($1, $2, $3::jsonb) as updated",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.updated ?? null;
}

export async function botDeleteChats(
  client: pg.Client,
  workerId: string,
  jobId: string,
  chatIds: string[],
): Promise<unknown> {
  const result = await client.query<{ deleted: unknown }>(
    "select private.bot_delete_chats($1, $2, $3::uuid[]) as deleted",
    [workerId, jobId, chatIds],
  );
  return result.rows[0]?.deleted ?? null;
}

export async function botUpdateBots(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: unknown,
): Promise<unknown> {
  const result = await client.query<{ updated: unknown }>(
    "select private.bot_update_bots($1, $2, $3::jsonb) as updated",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.updated ?? null;
}

export async function botDeleteBots(
  client: pg.Client,
  workerId: string,
  jobId: string,
  botIds: string[],
): Promise<unknown> {
  const result = await client.query<{ deleted: unknown }>(
    "select private.bot_delete_bots($1, $2, $3::uuid[]) as deleted",
    [workerId, jobId, botIds],
  );
  return result.rows[0]?.deleted ?? null;
}

export async function botRenameSelf(
  client: pg.Client,
  workerId: string,
  jobId: string,
  name: string,
): Promise<unknown> {
  const result = await client.query<{ bot: unknown }>(
    "select private.bot_rename_self($1, $2, $3) as bot",
    [workerId, jobId, name],
  );
  return result.rows[0]?.bot ?? null;
}

export async function botUpdatePatients(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: Array<{
    patientId: string;
    givenName?: string;
    familyName?: string;
    dateOfBirth?: string | null;
    fiscalCode?: string | null;
    phone?: string | null;
    email?: string | null;
    note?: string | null;
  }>,
): Promise<unknown> {
  const result = await client.query<{ updated: unknown }>(
    "select private.bot_update_patients($1, $2, $3::jsonb) as updated",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.updated ?? [];
}

export async function botDeletePatients(
  client: pg.Client,
  workerId: string,
  jobId: string,
  patientIds: string[],
): Promise<unknown> {
  const result = await client.query<{ deleted: unknown }>(
    "select private.bot_delete_patients($1, $2, $3::uuid[]) as deleted",
    [workerId, jobId, patientIds],
  );
  return result.rows[0]?.deleted ?? null;
}

export async function botCreatePatients(
  client: pg.Client,
  workerId: string,
  jobId: string,
  items: Array<{
    givenName: string;
    familyName: string;
    dateOfBirth?: string | null;
    fiscalCode?: string | null;
    phone?: string | null;
    email?: string | null;
    note?: string | null;
  }>,
): Promise<unknown> {
  const result = await client.query<{ created: unknown }>(
    "select private.bot_create_patients($1, $2, $3::jsonb) as created",
    [workerId, jobId, JSON.stringify(items)],
  );
  return result.rows[0]?.created ?? [];
}

function parseTurn(value: unknown): Turn | null {
  if (value == null) return null;
  if (typeof value !== "object") throw new Error("Unexpected job payload");
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.botId !== "string" ||
    typeof row.botName !== "string" ||
    typeof row.chatId !== "string" ||
    typeof row.clinicId !== "string" ||
    typeof row.clinicName !== "string"
  ) {
    throw new Error("Unexpected job payload");
  }
  if (row.alertPrompt != null && typeof row.alertPrompt !== "string") {
    throw new Error("Unexpected job payload");
  }
  if (!Array.isArray(row.messages)) throw new Error("Unexpected job payload");

  const permissions = Array.isArray(row.permissions)
    ? row.permissions.filter((item): item is string => typeof item === "string")
    : [];

  const doctors: ClinicDoctor[] = Array.isArray(row.doctors)
    ? row.doctors.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const doc = item as Record<string, unknown>;
        if (typeof doc.id !== "string" || typeof doc.name !== "string") return [];
        return [
          {
            id: doc.id,
            name: doc.name,
            specialization: typeof doc.specialization === "string" ? doc.specialization : null,
            active: Boolean(doc.active),
          },
        ];
      })
    : [];

  const clinicalObjects: ClinicObject[] = Array.isArray(row.clinicalObjects)
    ? row.clinicalObjects.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const obj = item as Record<string, unknown>;
        if (typeof obj.id !== "string" || typeof obj.name !== "string") return [];
        return [
          {
            id: obj.id,
            name: obj.name,
            kind: typeof obj.kind === "string" ? obj.kind : "object",
            description: typeof obj.description === "string" ? obj.description : null,
          },
        ];
      })
    : [];

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
    botEmoji: typeof row.botEmoji === "string" && row.botEmoji.trim() ? row.botEmoji : null,
    chatId: row.chatId,
    clinicId: row.clinicId,
    clinicName: row.clinicName,
    permissions,
    doctors,
    clinicalObjects,
    alertPrompt: typeof row.alertPrompt === "string" ? row.alertPrompt : null,
    messages,
  };
}
