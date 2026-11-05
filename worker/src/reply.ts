import { createHmac } from "node:crypto";
import { createMistral } from "@ai-sdk/mistral";
import { stepCountIs, streamText, tool } from "ai";
import { compactContext, foldTrace, type ContextMessage } from "./context-window.js";
import type pg from "pg";
import { z } from "zod";
import {
  cancelServerAlerts,
  listServerAlerts,
  scheduleServerAlerts,
} from "./alerts.js";
import { executeCalcolaCodiceFiscale } from "./codice-fiscale.js";
import { chatEmojis, isChatEmoji } from "./emoji.js";
import { takeReplyMarker } from "./reply-marker.js";
import {
  botConnectWhatsApp,
  botCreateAgendaBlocks,
  botCreateAppointments,
  botCreateBots,
  botCreateChats,
  botCreatePatients,
  botDeleteAgendaBlocks,
  botDeleteAppointments,
  botDeleteBots,
  botDeleteChats,
  botDeletePatients,
  botListIntegrations,
  botProposeSql,
  botReadQuery,
  previewBotWrite,
  botRenameClinic,
  botRenameSelf,
  botSetEmoji,
  botSetReplyTarget,
  botUpdateAgendaBlocks,
  botUpdateAppointments,
  botUpdateBots,
  botUpdateChats,
  botUpdatePatients,
  listMessagesToFold,
  saveChatTrace,
  touchBotDraft,
  turnIsCurrent,
} from "./db.js";
import { botColorIds, botFaceIds, channelSymbolIds } from "./marks.js";
import { classifyBotSql, confirmationPhrase, readQueryDescription } from "./read-query.js";
import { StepLog, type AgentStep } from "./steps.js";

export type TurnMessage = {
  role: "user" | "assistant";
  content: string;
  seq?: number;
  id?: string;
  replyToId?: string | null;
  replyExcerpt?: string | null;
  reactions?: string[];
};

export type ClinicDoctor = {
  id: string;
  name: string;
  specialization: string | null;
  active: boolean;
};

export type ClinicObject = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
};

export type Turn = {
  id: string;
  botId: string;
  botName: string;
  botEmoji: string | null;
  chatId: string;
  clinicId: string;
  clinicName: string;
  permissions: string[];
  doctors: ClinicDoctor[];
  clinicalObjects: ClinicObject[];
  alertPrompt: string | null;
  reactionNotice: string | null;
  contextTrace: string | null;
  contextTraceSeq: number;
  messages: TurnMessage[];
};

const modelTimeoutMs = 45_000;

export class TurnInterrupted extends Error {
  constructor() {
    super("interrupted");
    this.name = "TurnInterrupted";
  }
}

const romeDateTime = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "longOffset",
});

const romeWeekday = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  weekday: "long",
});

function formatRomeClock(now: Date): string {
  return `${romeDateTime.format(now)} (ISO UTC: ${now.toISOString()})`;
}

function normalizeWeekday(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("it-IT")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function weekdayInRome(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return romeWeekday.format(date);
}

const weekdayName = z
  .string()
  .describe("Nome del giorno in italiano nel fuso Europe/Rome (es. mercoledì)");

function sameWeekday(iso: string, day: string, ctx: z.RefinementCtx, isoPath: string, dayPath: string) {
  const actual = weekdayInRome(iso);
  if (!actual) {
    ctx.addIssue({ code: "custom", message: `Data non valida: ${iso}`, path: [isoPath] });
    return;
  }
  if (normalizeWeekday(day) !== normalizeWeekday(actual)) {
    ctx.addIssue({
      code: "custom",
      message: `"${day.trim()}" non corrisponde a ${iso}: in Europe/Rome è ${actual}.`,
      path: [dayPath],
    });
  }
}

function withDayNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withDayNames);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    out[key] = withDayNames(child);
    if (typeof child !== "string") continue;
    const dayKey = key.endsWith("At")
      ? `${key.slice(0, -2)}Day`
      : key.endsWith("_at")
        ? `${key.slice(0, -3)}_day`
        : null;
    if (!dayKey || dayKey in source) continue;
    const day = weekdayInRome(child);
    if (day) out[dayKey] = day;
  }
  return out;
}

const metaIdPattern = /^[0-9]{5,32}$/;
const webhookUrlConst = "https://2tapdoc.vercel.app/api/whatsapp";
const webhookVerifyTokenConst =
  process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "70f932ajisjfishhfhfsifhsifshfihsisfhd7d700936c2";

function metaGraphUrl(path: string, token: string, secret: string): URL {
  const version = process.env.META_GRAPH_VERSION?.trim() || "v26.0";
  const safeVersion = /^v\d+\.\d+$/.test(version) ? version : "v26.0";
  const url = new URL(`https://graph.facebook.com/${safeVersion}/${path.replace(/^\//, "")}`);
  const proof = createHmac("sha256", secret).update(token).digest("hex");
  url.searchParams.set("appsecret_proof", proof);
  return url;
}

async function metaGraphGet(path: string, token: string, secret: string): Promise<unknown> {
  const response = await fetch(metaGraphUrl(path, token, secret), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function metaGraphPost(path: string, token: string, secret: string, payload: unknown): Promise<boolean> {
  const response = await fetch(metaGraphUrl(path, token, secret), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  return response.ok;
}

function cleanDisplayPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const phone = value.trim();
  return /^[0-9+() -]{1,40}$/.test(phone) ? phone : "";
}

async function verifyMetaWhatsAppCredentials(input: {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
}): Promise<{ ok: true; displayPhone: string } | { ok: false; error: string }> {
  const wabaId = input.wabaId.replace(/\D/g, "");
  const phoneNumberId = input.phoneNumberId.replace(/\D/g, "");
  const token = input.accessToken.trim().replace(/^Bearer\s+/i, "");
  const secret = input.appSecret.trim();

  if (!metaIdPattern.test(wabaId) || !metaIdPattern.test(phoneNumberId)) {
    return {
      ok: false,
      error: "ID del numero e ID dell'account WhatsApp devono essere sequenze numeriche (non il numero +39).",
    };
  }
  if (token.length < 20 || secret.length < 8) {
    return {
      ok: false,
      error: "Token di accesso o Chiave segreta dell'app troppo corti o mancanti.",
    };
  }

  const phone = (await metaGraphGet(`${phoneNumberId}?fields=display_phone_number`, token, secret)) as {
    display_phone_number?: unknown;
  } | null;
  const ownPhone = cleanDisplayPhone(phone?.display_phone_number);
  if (!ownPhone) {
    return {
      ok: false,
      error:
        "Meta ha rifiutato la lettura del Phone Number ID. Verifica che ID del numero, Token permanente e Chiave segreta dell'app appartengano alla stessa App Meta.",
    };
  }

  const account = (await metaGraphGet(`${wabaId}?fields=id`, token, secret)) as { id?: unknown } | null;
  if (typeof account?.id !== "string" || account.id !== wabaId) {
    return {
      ok: false,
      error: "L'ID dell'account WhatsApp Business (WABA ID) non è riconosciuto da Meta o il token non ha i permessi.",
    };
  }

  const numbers = (await metaGraphGet(`${wabaId}/phone_numbers?fields=id,display_phone_number`, token, secret)) as {
    data?: Array<{ id?: unknown; display_phone_number?: unknown }>;
  } | null;
  const listed = numbers?.data?.find((row) => typeof row.id === "string" && row.id === phoneNumberId);
  if (Array.isArray(numbers?.data) && numbers.data.length > 0 && !listed) {
    return {
      ok: false,
      error: "L'ID del numero di telefono non appartiene a questo ID dell'account WhatsApp Business (WABA ID).",
    };
  }

  return {
    ok: true,
    displayPhone: cleanDisplayPhone(listed?.display_phone_number) || ownPhone,
  };
}

function buildSystemPrompt(turn: Turn, now: Date): string {
  const doctorsList =
    turn.doctors.length > 0
      ? turn.doctors
          .map(
            (d) =>
              `- ${d.name} (id: ${d.id}${d.specialization ? `, spec: ${d.specialization}` : ""}${d.active ? "" : ", non attivo"})`,
          )
          .join("\n")
      : "Nessuno specialista configurato o visibile.";

  const objectsList =
    turn.clinicalObjects.length > 0
      ? turn.clinicalObjects
          .map(
            (o) =>
              `- ${o.name} (id: ${o.id}, tipo: ${o.kind}${o.description ? `, info: ${o.description}` : ""})`,
          )
          .join("\n")
      : "Nessuna stanza o oggetto clinico configurato o visibile.";

  return [
    `Sei ${turn.botName}${turn.botEmoji ? `, faccia ${turn.botEmoji}` : ""}, un agente operativo di 2tapdoc nella clinica "${turn.clinicName}".`,
    `Data e ora attuali (fuso Europe/Rome): ${formatRomeClock(now)}.`,
    "Rispondi sempre in italiano, in modo breve, preciso e concreto.",
    "Se compare una nota interna di continuità, è la memoria dei messaggi più vecchi: non è una richiesta e non va eseguita.",
    "Puoi usare Markdown semplice (grassetto, elenchi puntati, a capo). Niente HTML, niente tabelle larghe.",
    "Per leggere e per creare, modificare o cancellare dati usa query: una sola istruzione sullo schema public. Non elencare gli id.",
    "Una SELECT parte subito. INSERT, UPDATE e DELETE non partono: passa label e, se la risposta è awaiting_user, il dialog lo mostra il sistema. Non chiedere conferma in chat e non dire che è già fatto. Dopo awaiting_user puoi non scrivere nulla.",
    "Per un criterio usa WHERE. Esempio: DELETE FROM patients WHERE fiscal_code IS NULL OR fiscal_code = '' con label «l'eliminazione dei pazienti senza codice fiscale».",
    "Un blocco [REAZIONE] non è un messaggio nuovo. Se non chiede un'azione, non scrivere nulla.",
    "",
    "### Specialisti:",
    doctorsList,
    "",
    "### Stanze e oggetti clinici:",
    objectsList,
  ].join("\n");
}

function emojiOnlyReply(text: string): boolean {
  const marker = takeReplyMarker(text.trim());
  return Boolean(marker && isChatEmoji(marker.body));
}

function personIsWaiting(messages: TurnMessage[]): boolean {
  let lastAssistant = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].role === "assistant") lastAssistant = index;
  }
  return messages
    .slice(lastAssistant + 1)
    .some((message) => message.role === "user" && !message.content.startsWith("Altro bot: "));
}

function reactionWake(notice: string, waiting: boolean): string {
  const instruction = waiting
    ? "C'è un messaggio di una persona a cui non hai ancora risposto: rispondi a quello. La reazione è un segnale in più: tienine conto se cambia ciò che devi fare."
    : "Non è arrivato un messaggio nuovo. Non scrivere in chat se la reazione non chiede un'azione: niente conferma e niente «ok». Intervieni solo se è un segnale, una conferma o una richiesta. In quel caso esegui, oppure scrivi.";
  return `[REAZIONE]\n${notice}\n${instruction}`;
}

function presentToModel(message: TurnMessage): TurnMessage {
  const parts: string[] = [];
  if (message.id) parts.push(`[id:${message.id}]`);
  if (message.replyToId) {
    const excerpt = (message.replyExcerpt ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
    parts.push(
      excerpt ? `[in risposta a ${message.replyToId}: «${excerpt}»]` : `[in risposta a ${message.replyToId}]`,
    );
  }
  parts.push(message.content);
  if (message.reactions && message.reactions.length > 0) {
    parts.push(`[reazioni: ${message.reactions.join(", ")}]`);
  }
  return { ...message, content: parts.join("\n") };
}

function sequencedMessages(messages: TurnMessage[]): ContextMessage[] | null {
  const sequenced: ContextMessage[] = [];
  for (const message of messages) {
    if (typeof message.seq !== "number") return null;
    sequenced.push({ seq: message.seq, role: message.role, content: message.content });
  }
  return sequenced;
}

async function modelContext(
  apiKey: string,
  client: pg.Client,
  workerId: string,
  turn: Turn,
): Promise<TurnMessage[]> {
  const presented = turn.messages.map(presentToModel);
  const plain = presented.map((message) => ({ role: message.role, content: message.content }));
  const sequenced = sequencedMessages(presented);
  if (!sequenced) return plain;

  try {
    const windowed = await compactContext({
      messages: sequenced,
      trace: turn.contextTrace,
      untilSeq: turn.contextTraceSeq,
      loadOlder: (afterSeq, beforeSeq, limit) =>
        listMessagesToFold(client, workerId, turn.id, afterSeq, beforeSeq, limit),
      writeTrace: (trace, untilSeq) => saveChatTrace(client, workerId, turn.id, trace, untilSeq),
      fold: (trace, batch) => foldTrace(apiKey, trace, batch),
    });
    if (windowed.mode !== "full") {
      console.log(
        "context",
        turn.chatId,
        windowed.mode,
        "folds",
        windowed.foldedBatches,
        "tail",
        windowed.tailCount,
        "trace",
        windowed.trace?.length ?? 0,
      );
    }
    return windowed.messages;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "context window failed";
    console.error("context window skipped", turn.chatId, reason);
    return plain;
  }
}

export async function replyToTurn(
  apiKey: string,
  client: pg.Client,
  workerId: string,
  turn: Turn,
): Promise<{ body: string; steps: AgentStep[] }> {
  const messages = await modelContext(apiKey, client, workerId, turn);
  if (turn.alertPrompt) {
    const explaining = turn.alertPrompt.startsWith("FALLIMENTO DEL TURNO PRECEDENTE");
    messages.push({
      role: "user",
      content: explaining
        ? turn.alertPrompt
        : `[ALERT SERVER SCATTATO NEL CONTAINER]\nEsegui questa istruzione o avvisa in chat:\n${turn.alertPrompt}`,
    });
  }
  if (turn.reactionNotice) {
    messages.push({
      role: "user",
      content: reactionWake(turn.reactionNotice, personIsWaiting(turn.messages)),
    });
  }
  if (!messages.some((message) => message.role === "user")) {
    throw new Error("The chat has no message to answer");
  }

  const now = new Date();
  const perms = new Set(turn.permissions);
  const canRenameClinic = perms.has("clinic.update");
  const canManageIntegrations = perms.has("integrations.manage");

  let reacted = false;
  let quoted = false;
  let proposed = false;
  let toolCatalog: { name: string; description: string }[] = [];

  const tools = {
    listTools: tool({
      description:
        "Elenca i tool che questo bot può chiamare adesso, con la descrizione di ciascuno. Usalo quando ti chiedono che cosa sai fare o quando devi controllare un'azione disponibile. Restituisce solo i tool attivi per i permessi di questo bot.",
      inputSchema: z.object({}),
      execute: async () => ({ tools: toolCatalog }),
    }),

    query: tool({
      description: readQueryDescription,
      inputSchema: z.object({
        sql: z
          .string()
          .min(1)
          .max(4000)
          .describe("Una istruzione sullo schema public. Valori scritti nella query, senza segnaposto."),
        label: z
          .string()
          .min(1)
          .max(180)
          .optional()
          .describe(
            "Obbligatoria per INSERT, UPDATE e DELETE. Il motivo, non l'elenco. Per esempio: l'eliminazione dei pazienti senza codice fiscale.",
          ),
      }),
      execute: async ({ sql, label }) => {
        const classified = classifyBotSql(sql);
        if ("error" in classified) return classified;
        if (classified.mode === "read") return botReadQuery(workerId, turn.id, sql);
        const phrase = label?.trim();
        if (!phrase) return { error: "Per una modifica serve label: una frase breve per il dialog." };
        const preview = await previewBotWrite(workerId, turn.id, classified.sql);
        if ("error" in preview) return preview;
        if (preview.count < 1) return { count: 0 };
        const action = confirmationPhrase(phrase, preview.count, classified.sql, preview.samples);
        const proposedAction = await botProposeSql(client, workerId, turn.id, classified.sql, action);
        if ("awaiting_user" in proposedAction) proposed = true;
        return proposedAction;
      },
    }),

    setReplyTarget: tool({
      description:
        "Cita un messaggio preciso di questa chat nella risposta che stai per scrivere. Passa l'id fra parentesi quadre. Chiamalo solo quando la risposta riguarda quel messaggio.",
      inputSchema: z.object({
        messageId: z.string().uuid().describe("Id del messaggio da citare"),
      }),
      execute: async ({ messageId }) => {
        await botSetReplyTarget(client, workerId, turn.id, messageId);
        quoted = true;
        return { quoted: messageId };
      },
    }),

    reactWithEmoji: tool({
      description:
        "Mette o toglie la tua emoji su un messaggio. Una sola per messaggio: una nuova sostituisce la precedente. Passa null per toglierla. Non scrive un messaggio in chat.",
      inputSchema: z.object({
        messageId: z.string().uuid().describe("Id del messaggio"),
        emoji: z.enum(chatEmojis).nullable().describe("Emoji da mostrare, oppure null per toglierla"),
      }),
      execute: async ({ messageId, emoji }) => {
        await botSetEmoji(client, workerId, turn.id, messageId, emoji);
        reacted = true;
        return { emoji };
      },
    }),

    setServerAlerts: tool({
      description:
        "Imposta uno o più alert/timer direttamente nel container del server. Allo scadere, il server risveglia il bot in questa chat con il prompt indicato.",
      inputSchema: z.object({
        alerts: z
          .array(
            z.object({
              delaySeconds: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Secondi di attesa da adesso (usa questo per richieste tipo 'tra 10 minuti')"),
              firesAtIso: z
                .string()
                .optional()
                .describe("Data e ora ISO 8601 con offset (es. 2026-10-27T15:00:00+01:00)"),
              prompt: z
                .string()
                .min(1)
                .max(2000)
                .describe("Cosa deve dire o controllare il bot quando scatta l'alert sul server"),
            }),
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ alerts }) => {
        const baseNow = Date.now();
        const parsed = alerts.map((item) => {
          let target: Date;
          if (typeof item.delaySeconds === "number" && item.delaySeconds > 0) {
            target = new Date(baseNow + item.delaySeconds * 1000);
          } else if (item.firesAtIso) {
            target = new Date(item.firesAtIso);
            if (Number.isNaN(target.getTime())) {
              throw new Error(`Data non valida: ${item.firesAtIso}`);
            }
          } else {
            throw new Error("Specifica delaySeconds oppure firesAtIso per ogni alert");
          }
          return { firesAt: target, prompt: item.prompt };
        });

        const created = scheduleServerAlerts(turn.botId, turn.chatId, turn.clinicId, parsed);
        return { scheduled: created };
      },
    }),

    listServerAlerts: tool({
      description: "Elenca tutti gli alert attualmente programmati nel container del server per questa chat.",
      inputSchema: z.object({}),
      execute: async () => {
        return { alerts: listServerAlerts(turn.botId, turn.chatId) };
      },
    }),

    cancelServerAlerts: tool({
      description: "Annulla uno o più alert attivi nel container del server tramite i loro ID.",
      inputSchema: z.object({
        alertIds: z.array(z.string().uuid()).min(1).describe("Lista degli ID degli alert da cancellare"),
      }),
      execute: async ({ alertIds }) => {
        const cancelled = cancelServerAlerts(turn.botId, turn.chatId, alertIds);
        return { cancelledCount: cancelled.length, cancelled };
      },
    }),

    createAppointments: tool({
      description:
        "Crea uno o più appuntamenti nell'agenda della clinica. Ogni appuntamento ha uno o più dottori (doctorIds), una o più stanze/oggetti (clinicalObjectIds) e, se serve, uno o più pazienti (patientIds, id letti con query). Serve almeno un dottore o una stanza/oggetto.",
      inputSchema: z.object({
        appointments: z
          .array(
            z
            .object({
              startsAt: z.string().describe("Inizio appuntamento ISO 8601 (es. 2026-10-28T10:00:00+01:00)"),
              startsDay: weekdayName.describe("Giorno di startsAt (es. mercoledì)"),
              endsAt: z.string().describe("Fine appuntamento ISO 8601 (es. 2026-10-28T11:00:00+01:00)"),
              endsDay: weekdayName.describe("Giorno di endsAt (es. mercoledì)"),
              title: z.string().max(120).optional().describe("Titolo o motivo della visita"),
              note: z.string().max(1000).optional().describe("Note operative opzionali"),
              doctorIds: z
                .array(z.string().uuid())
                .default([])
                .describe("ID dei dottori assegnati all'appuntamento (anche più di uno)"),
              clinicalObjectIds: z
                .array(z.string().uuid())
                .default([])
                .describe("ID delle stanze o oggetti clinici assegnati (anche più di uno)"),
              patientIds: z
                .array(z.string().uuid())
                .default([])
                .describe("ID dei pazienti assegnati all'appuntamento"),
            })
            .superRefine((value, ctx) => {
              sameWeekday(value.startsAt, value.startsDay, ctx, "startsAt", "startsDay");
              sameWeekday(value.endsAt, value.endsDay, ctx, "endsAt", "endsDay");
            }),
          )
          .min(1)
          .max(50),
      }),
      execute: async ({ appointments }) => {
        const created = await botCreateAppointments(
          client,
          workerId,
          turn.id,
          appointments.map(({ startsDay: _startsDay, endsDay: _endsDay, ...item }) => item),
        );
        return { created: withDayNames(created) };
      },
    }),

    updateAppointments: tool({
      description:
        "Modifica uno o più appuntamenti esistenti in blocco (orario di inizio/fine, titolo, note, lista di dottori, lista di stanze/oggetti clinici, lista di pazienti).",
      inputSchema: z.object({
        updates: z
          .array(
            z
            .object({
              appointmentId: z.string().uuid().describe("ID dell'appuntamento da modificare"),
              startsAt: z.string().optional().describe("Nuovo inizio ISO 8601"),
              startsDay: weekdayName.optional().describe("Giorno di startsAt, obbligatorio se cambi l'inizio"),
              endsAt: z.string().optional().describe("Nuova fine ISO 8601"),
              endsDay: weekdayName.optional().describe("Giorno di endsAt, obbligatorio se cambi la fine"),
              title: z.string().max(120).nullable().optional().describe("Nuovo titolo (o null per rimuoverlo)"),
              note: z.string().max(1000).nullable().optional().describe("Nuova nota (o null per rimuoverla)"),
              doctorIds: z
                .array(z.string().uuid())
                .optional()
                .describe("Nuova lista completa di ID dottori per questo appuntamento"),
              clinicalObjectIds: z
                .array(z.string().uuid())
                .optional()
                .describe("Nuova lista completa di ID stanze/oggetti clinici per questo appuntamento"),
              patientIds: z
                .array(z.string().uuid())
                .optional()
                .describe("Nuova lista completa di ID pazienti per questo appuntamento"),
            })
            .superRefine((value, ctx) => {
              if (value.startsAt) {
                if (!value.startsDay) {
                  ctx.addIssue({
                    code: "custom",
                    message: "Indica startsDay insieme a startsAt.",
                    path: ["startsDay"],
                  });
                } else {
                  sameWeekday(value.startsAt, value.startsDay, ctx, "startsAt", "startsDay");
                }
              }
              if (value.endsAt) {
                if (!value.endsDay) {
                  ctx.addIssue({
                    code: "custom",
                    message: "Indica endsDay insieme a endsAt.",
                    path: ["endsDay"],
                  });
                } else {
                  sameWeekday(value.endsAt, value.endsDay, ctx, "endsAt", "endsDay");
                }
              }
            }),
          )
          .min(1)
          .max(50),
      }),
      execute: async ({ updates }) => {
        const updated = await botUpdateAppointments(
          client,
          workerId,
          turn.id,
          updates.map(({ startsDay: _startsDay, endsDay: _endsDay, ...item }) => item),
        );
        return { updated: withDayNames(updated) };
      },
    }),

    createAgendaBlocks: tool({
      description:
        "Crea uno o più blocchi di agenda. Ogni blocco ha un titolo, una descrizione facoltativa e almeno un dottore o una stanza/oggetto. Non assegna pazienti e non vieta un appuntamento nello stesso orario.",
      inputSchema: z.object({
        blocks: z
          .array(
            z
              .object({
                startsAt: z.string().describe("Inizio blocco ISO 8601 (es. 2026-10-28T13:00:00+01:00)"),
                startsDay: weekdayName.describe("Giorno di startsAt (es. mercoledì)"),
                endsAt: z.string().describe("Fine blocco ISO 8601 (es. 2026-10-28T14:00:00+01:00)"),
                endsDay: weekdayName.describe("Giorno di endsAt (es. mercoledì)"),
                title: z.string().min(1).max(120).describe("Titolo del blocco, obbligatorio"),
                description: z.string().max(1000).optional().describe("Descrizione facoltativa"),
                doctorIds: z
                  .array(z.string().uuid())
                  .default([])
                  .describe("ID dei dottori il cui tempo viene occupato"),
                clinicalObjectIds: z
                  .array(z.string().uuid())
                  .default([])
                  .describe("ID delle stanze o oggetti clinici il cui tempo viene occupato"),
              })
              .superRefine((value, ctx) => {
                sameWeekday(value.startsAt, value.startsDay, ctx, "startsAt", "startsDay");
                sameWeekday(value.endsAt, value.endsDay, ctx, "endsAt", "endsDay");
              }),
          )
          .min(1)
          .max(50),
      }),
      execute: async ({ blocks }) => {
        const created = await botCreateAgendaBlocks(
          client,
          workerId,
          turn.id,
          blocks.map(({ startsDay: _startsDay, endsDay: _endsDay, ...item }) => item),
        );
        return { created: withDayNames(created) };
      },
    }),

    updateAgendaBlocks: tool({
      description:
        "Modifica uno o più blocchi di agenda (orario, titolo, descrizione, dottori, stanze/oggetti). Prima di modificare, se non conosci gli ID, leggili con query.",
      inputSchema: z.object({
        updates: z
          .array(
            z
              .object({
                blockId: z.string().uuid().describe("ID del blocco da modificare"),
                startsAt: z.string().optional().describe("Nuovo inizio ISO 8601"),
                startsDay: weekdayName.optional().describe("Giorno di startsAt, obbligatorio se cambi l'inizio"),
                endsAt: z.string().optional().describe("Nuova fine ISO 8601"),
                endsDay: weekdayName.optional().describe("Giorno di endsAt, obbligatorio se cambi la fine"),
                title: z.string().min(1).max(120).optional().describe("Nuovo titolo"),
                description: z
                  .string()
                  .max(1000)
                  .nullable()
                  .optional()
                  .describe("Nuova descrizione, oppure null per toglierla"),
                doctorIds: z
                  .array(z.string().uuid())
                  .optional()
                  .describe("Nuova lista completa di ID dottori per questo blocco"),
                clinicalObjectIds: z
                  .array(z.string().uuid())
                  .optional()
                  .describe("Nuova lista completa di ID stanze/oggetti per questo blocco"),
              })
              .superRefine((value, ctx) => {
                if (value.startsAt) {
                  if (!value.startsDay) {
                    ctx.addIssue({
                      code: "custom",
                      message: "Indica startsDay insieme a startsAt.",
                      path: ["startsDay"],
                    });
                  } else {
                    sameWeekday(value.startsAt, value.startsDay, ctx, "startsAt", "startsDay");
                  }
                }
                if (value.endsAt) {
                  if (!value.endsDay) {
                    ctx.addIssue({
                      code: "custom",
                      message: "Indica endsDay insieme a endsAt.",
                      path: ["endsDay"],
                    });
                  } else {
                    sameWeekday(value.endsAt, value.endsDay, ctx, "endsAt", "endsDay");
                  }
                }
              }),
          )
          .min(1)
          .max(50),
      }),
      execute: async ({ updates }) => {
        const updated = await botUpdateAgendaBlocks(
          client,
          workerId,
          turn.id,
          updates.map(({ startsDay: _startsDay, endsDay: _endsDay, ...item }) => item),
        );
        return { updated: withDayNames(updated) };
      },
    }),

    deleteAgendaBlocks: tool({
      description:
        "Propone l'eliminazione di uno o più blocchi di agenda in una sola chiamata. Non cancella: il sistema apre un solo dialog e risponde awaiting_user. Non chiedere conferma in chat.",
      inputSchema: z.object({
        blockIds: z.array(z.string().uuid()).min(1).max(50).describe("Lista degli ID dei blocchi da eliminare"),
      }),
      execute: async ({ blockIds }) => {
        return await botDeleteAgendaBlocks(client, workerId, turn.id, blockIds);
      },
    }),

    deleteAppointments: tool({
      description:
        "Propone l'eliminazione di uno o più appuntamenti in una sola chiamata. Non cancella: il sistema apre un solo dialog e risponde awaiting_user. Non chiedere conferma in chat.",
      inputSchema: z.object({
        appointmentIds: z
          .array(z.string().uuid())
          .min(1)
          .max(50)
          .describe("Lista degli ID degli appuntamenti da eliminare"),
      }),
      execute: async ({ appointmentIds }) => {
        return await botDeleteAppointments(client, workerId, turn.id, appointmentIds);
      },
    }),

    calcolaCodiceFiscale: tool({
      description:
        "Calcola il codice fiscale italiano con l'algoritmo ufficiale. Obbligatorio quando serve un codice fiscale: non inventarlo e non ricalcolarlo. Nella risposta copia solo il campo codice. Se manca cognome, nome, sesso, data o luogo di nascita, chiedili prima di chiamare il tool.",
      inputSchema: z.object({
        cognome: z.string().min(1).max(80).describe("Cognome"),
        nome: z.string().min(1).max(80).describe("Nome"),
        sesso: z.enum(["M", "F"]).describe("Sesso anagrafico, M o F"),
        dataNascita: z
          .string()
          .min(8)
          .max(10)
          .describe("Data di nascita in formato YYYY-MM-DD oppure DD/MM/YYYY"),
        luogoNascita: z
          .string()
          .min(1)
          .max(80)
          .describe(
            "Comune o stato di nascita, anche con la sigla della provincia (es. Roma, Feltre (BL), Francia), oppure codice catastale (es. H501)",
          ),
      }),
      execute: async ({ cognome, nome, sesso, dataNascita, luogoNascita }) =>
        executeCalcolaCodiceFiscale({
          cognome,
          nome,
          sesso,
          data_nascita: dataNascita,
          luogo_nascita: luogoNascita,
        }),
    }),

    renameClinic: tool({
      description: "Rinomina la clinica di questa chat. Il nome sta entro 80 caratteri.",
      inputSchema: z.object({
        name: z.string().min(1).max(80).describe("Nuovo nome della clinica"),
      }),
      execute: async ({ name }) => {
        const clinic = await botRenameClinic(client, workerId, turn.id, name);
        return { clinic };
      },
    }),

    renameSelf: tool({
      description:
        "Cambia il tuo nome di agente e allinea il titolo di questa chat. Il nome sta entro 40 caratteri.",
      inputSchema: z.object({
        name: z.string().min(1).max(40).describe("Nuovo nome dell'agente"),
      }),
      execute: async ({ name }) => {
        const bot = await botRenameSelf(client, workerId, turn.id, name);
        return { bot };
      },
    }),

    createPatients: tool({
      description: "Crea uno o più nuovi pazienti nell'anagrafica della clinica.",
      inputSchema: z.object({
        patients: z
          .array(
            z.object({
              givenName: z.string().min(1).max(80).describe("Nome di battesimo"),
              familyName: z.string().min(1).max(80).describe("Cognome"),
              dateOfBirth: z
                .string()
                .regex(/^\d{4}-\d{2}-\d{2}$/)
                .optional()
                .describe("Data di nascita YYYY-MM-DD"),
              fiscalCode: z.string().max(16).optional(),
              phone: z.string().max(40).optional(),
              email: z.string().max(120).optional(),
              note: z.string().max(2000).optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ patients }) => {
        const created = await botCreatePatients(client, workerId, turn.id, patients);
        return { created };
      },
    }),

    updatePatients: tool({
      description:
        "Modifica uno o più pazienti esistenti: nome, cognome, data di nascita, codice fiscale, telefono, email e note. La risposta include anche `createdAt`, che non si può modificare.",
      inputSchema: z.object({
        updates: z
          .array(
            z
              .object({
                patientId: z.string().uuid().describe("ID del paziente da modificare"),
                givenName: z.string().min(1).max(80).optional().describe("Nuovo nome"),
                familyName: z.string().min(1).max(80).optional().describe("Nuovo cognome"),
                dateOfBirth: z
                  .string()
                  .regex(/^\d{4}-\d{2}-\d{2}$/)
                  .nullable()
                  .optional()
                  .describe("Nuova data di nascita YYYY-MM-DD, oppure null per rimuoverla"),
                fiscalCode: z.string().max(16).nullable().optional().describe("Nuovo codice fiscale, oppure null"),
                phone: z.string().max(40).nullable().optional().describe("Nuovo telefono, oppure null"),
                email: z.string().max(120).nullable().optional().describe("Nuova email, oppure null"),
                note: z.string().max(2000).nullable().optional().describe("Nuova nota, oppure null"),
              })
              .superRefine((value, ctx) => {
                const fields = [
                  value.givenName,
                  value.familyName,
                  value.dateOfBirth,
                  value.fiscalCode,
                  value.phone,
                  value.email,
                  value.note,
                ];
                if (fields.every((field) => field === undefined)) {
                  ctx.addIssue({
                    code: "custom",
                    message: "Indica almeno un campo da modificare.",
                    path: ["patientId"],
                  });
                }
              }),
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ updates }) => {
        const updated = await botUpdatePatients(client, workerId, turn.id, updates);
        return { updated };
      },
    }),

    deletePatients: tool({
      description:
        "Propone l'eliminazione di uno o più pazienti, fino a 30, in una sola chiamata. Non cancella: il sistema apre un solo dialog e risponde awaiting_user. Passa tutti gli id insieme. Non chiedere conferma in chat.",
      inputSchema: z.object({
        patientIds: z
          .array(z.string().uuid())
          .min(1)
          .max(30)
          .describe("Tutti gli ID dei pazienti da eliminare, in una sola chiamata"),
      }),
      execute: async ({ patientIds }) => {
        return await botDeletePatients(client, workerId, turn.id, patientIds);
      },
    }),

    createChats: tool({
      description: "Apre una o più conversazioni in una sola chiamata. Partono subito, senza dialog.",
      inputSchema: z.object({
        chats: z
          .array(
            z.object({
              title: z.string().max(80).optional().describe("Titolo, oppure vuoto"),
              color: z.enum(botColorIds),
              emoji: z.enum(channelSymbolIds).describe("Simbolo della conversazione"),
            }),
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ chats }) => ({ created: await botCreateChats(client, workerId, turn.id, chats) }),
    }),

    createBots: tool({
      description:
        "Crea uno o più bot in una sola chiamata. Ognuno riceve una conversazione sua. Partono subito, senza dialog.",
      inputSchema: z.object({
        bots: z
          .array(
            z.object({
              name: z.string().min(1).max(40),
              color: z.enum(botColorIds),
              emoji: z.enum(botFaceIds).describe("Faccia del bot"),
            }),
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ bots }) => ({ created: await botCreateBots(client, workerId, turn.id, bots) }),
    }),

    updateChats: tool({
      description:
        "Propone la modifica di una o più conversazioni in una sola chiamata. Non modifica: apre un solo dialog e risponde awaiting_user.",
      inputSchema: z.object({
        updates: z
          .array(
            z
              .object({
                chatId: z.string().uuid(),
                title: z.string().max(80).nullable().optional().describe("Nuovo titolo, oppure null per toglierlo"),
                color: z.enum(botColorIds).optional(),
                emoji: z.enum(channelSymbolIds).optional(),
              })
              .superRefine((value, ctx) => {
                if (value.title === undefined && value.color === undefined && value.emoji === undefined) {
                  ctx.addIssue({ code: "custom", message: "Indica almeno un campo da modificare.", path: ["chatId"] });
                }
              }),
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ updates }) => botUpdateChats(client, workerId, turn.id, updates),
    }),

    deleteChats: tool({
      description:
        "Propone l'eliminazione di una o più conversazioni create da te, in una sola chiamata. Non elimina: apre un solo dialog e risponde awaiting_user.",
      inputSchema: z.object({
        chatIds: z.array(z.string().uuid()).min(1).max(20),
      }),
      execute: async ({ chatIds }) => botDeleteChats(client, workerId, turn.id, chatIds),
    }),

    updateBots: tool({
      description:
        "Propone la modifica di uno o più bot tuoi, in una sola chiamata. Non modifica: apre un solo dialog e risponde awaiting_user.",
      inputSchema: z.object({
        updates: z
          .array(
            z
              .object({
                botId: z.string().uuid(),
                name: z.string().min(1).max(40).optional(),
                color: z.enum(botColorIds).optional(),
                emoji: z.enum(botFaceIds).optional(),
              })
              .superRefine((value, ctx) => {
                if (value.name === undefined && value.color === undefined && value.emoji === undefined) {
                  ctx.addIssue({ code: "custom", message: "Indica almeno un campo da modificare.", path: ["botId"] });
                }
              }),
          )
          .min(1)
          .max(20),
      }),
      execute: async ({ updates }) => botUpdateBots(client, workerId, turn.id, updates),
    }),

    deleteBots: tool({
      description:
        "Propone l'eliminazione di uno o più bot tuoi, te escluso, in una sola chiamata. Non elimina: apre un solo dialog e risponde awaiting_user.",
      inputSchema: z.object({
        botIds: z.array(z.string().uuid()).min(1).max(20),
      }),
      execute: async ({ botIds }) => botDeleteBots(client, workerId, turn.id, botIds),
    }),

    listIntegrations: tool({
      description:
        "Elenca le integrazioni della clinica (es. WhatsApp, stato pending/connected, numero collegato e credito). Il collegamento WhatsApp è il QR in Impostazioni → Integrazioni → WhatsApp → Apri, come WhatsApp Web, con il telefono dello studio che resta attivo. Su Android: tre puntini → Dispositivi collegati → Collega un dispositivo. Su iPhone: Impostazioni → Dispositivi collegati → Collega un dispositivo. Poi si inquadra il QR.",
      inputSchema: z.object({}),
      execute: async () => ({
        integrations: await botListIntegrations(client, workerId, turn.id),
        webhookUrl: webhookUrlConst,
        webhookVerifyToken: webhookVerifyTokenConst,
      }),
    }),

    connectWhatsApp: tool({
      description:
        "Verifica su Meta Graph API e salva il collegamento WhatsApp della clinica usando i 4 dati forniti dall'utente (phoneNumberId, wabaId, accessToken, appSecret).",
      inputSchema: z.object({
        phoneNumberId: z
          .string()
          .min(5)
          .max(32)
          .describe("ID numerico del numero di telefono su Meta (solo cifre, non il +39)"),
        wabaId: z
          .string()
          .min(5)
          .max(32)
          .describe("ID numerico dell'account WhatsApp Business (WABA ID, solo cifre)"),
        accessToken: z
          .string()
          .min(20)
          .max(8192)
          .describe("Token di accesso permanente dell'utente di sistema Meta (EAA...)"),
        appSecret: z
          .string()
          .min(8)
          .max(256)
          .describe("Chiave segreta dell'app Meta (Impostazioni -> Di base)"),
      }),
      execute: async ({ phoneNumberId, wabaId, accessToken, appSecret }) => {
        const cleanPhoneId = phoneNumberId.replace(/\D/g, "");
        const cleanWabaId = wabaId.replace(/\D/g, "");
        const cleanToken = accessToken.trim().replace(/^Bearer\s+/i, "");
        const cleanSecret = appSecret.trim();

        const verification = await verifyMetaWhatsAppCredentials({
          wabaId: cleanWabaId,
          phoneNumberId: cleanPhoneId,
          accessToken: cleanToken,
          appSecret: cleanSecret,
        });
        if (!verification.ok) {
          return { connected: false, error: verification.error };
        }

        const saved = await botConnectWhatsApp(client, workerId, turn.id, {
          wabaId: cleanWabaId,
          phoneNumberId: cleanPhoneId,
          displayPhone: verification.displayPhone,
          accessToken: cleanToken,
          appSecret: cleanSecret,
        });

        const subscribed = await metaGraphPost(
          `${cleanWabaId}/subscribed_apps`,
          cleanToken,
          cleanSecret,
          {},
        );

        return {
          connected: true,
          displayPhone: verification.displayPhone,
          webhookSubscribed: subscribed,
          integration: saved,
        };
      },
    }),
  };

  type ToolName = keyof typeof tools;
  const activeTools: ToolName[] = [
    "listTools",
    "query",
    "setReplyTarget",
    "reactWithEmoji",
    "calcolaCodiceFiscale",
    "setServerAlerts",
    "listServerAlerts",
    "cancelServerAlerts",
    "renameSelf",
    "createChats",
    "createBots",
    "updateChats",
    "deleteChats",
    "updateBots",
    "deleteBots",
  ];
  if (canRenameClinic) activeTools.push("renameClinic");
  if (canManageIntegrations) activeTools.push("listIntegrations", "connectWhatsApp");

  toolCatalog = activeTools.map((name) => {
    const description = tools[name].description;
    return { name, description: typeof description === "string" ? description : "" };
  });

  const mistral = createMistral({ apiKey });
  const modelName = process.env.MISTRAL_MODEL?.trim() || "mistral-large-4";

  let stepText = "";
  let stepHasTool = false;
  const steps = new StepLog();
  let lastSentAt = 0;
  let lastKey = "";
  const finish = (body: string) => ({ body, steps: steps.list() });
  const abort = new AbortController();
  const timeout = setTimeout(() => {
    if (!abort.signal.aborted) abort.abort("timeout");
  }, modelTimeoutMs);
  const onNotify = (message: pg.Notification) => {
    if (message.channel === "bot_jobs" && message.payload === turn.id && !abort.signal.aborted) {
      abort.abort("interrupted");
    }
  };
  client.on("notification", onNotify);
  let checking = false;
  const poll = setInterval(() => {
    if (checking || abort.signal.aborted) return;
    checking = true;
    void turnIsCurrent(client, workerId, turn.id)
      .then((current) => {
        if (!current && !abort.signal.aborted) abort.abort("interrupted");
      })
      .catch(() => undefined)
      .finally(() => {
        checking = false;
      });
  }, 400);
  const interrupted = () => abort.signal.reason === "interrupted";

  const publish = async (nextPhase: "thinking" | "writing", nextBody: string, force = false) => {
    if (interrupted()) return;
    const key = `${nextPhase}\n${nextBody}`;
    if (!force && key === lastKey) return;
    if (!force && nextPhase === "writing" && Date.now() - lastSentAt < 80) return;
    lastKey = key;
    lastSentAt = Date.now();
    try {
      await touchBotDraft(client, workerId, turn.id, nextPhase, nextBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : "draft update failed";
      console.error("draft update failed", turn.id, message);
    }
  };

  try {
    await publish("thinking", "", true);

    const result = streamText({
      model: mistral(modelName),
      system: buildSystemPrompt(turn, now),
      messages,
      tools,
      activeTools,
      stopWhen: stepCountIs(6),
      maxOutputTokens: 1000,
      abortSignal: abort.signal,
    });

    try {
      for await (const part of result.stream) {
        if (interrupted()) throw new TurnInterrupted();
        if (part.type === "start-step") {
          stepText = "";
          stepHasTool = false;
          await publish("thinking", steps.draft(), true);
        } else if (part.type === "text-delta") {
          stepText = (stepText + part.text).slice(0, 4000);
          if (!stepHasTool && !emojiOnlyReply(stepText)) await publish("writing", stepText);
        } else if (part.type === "tool-input-start") {
          stepHasTool = true;
        } else if (part.type === "tool-call") {
          stepHasTool = true;
          steps.noteCall(part.toolCallId, part.toolName, part.input);
          await publish("thinking", steps.draft(), true);
        } else if (part.type === "tool-result") {
          steps.noteResult(part.toolCallId, part.toolName, part.output);
          await publish("thinking", steps.draft(), true);
        } else if (part.type === "tool-error") {
          steps.noteError(part.toolCallId, part.toolName, part.error);
          await publish("thinking", steps.draft(), true);
        } else if (part.type === "finish-step") {
          if (part.finishReason === "tool-calls") await publish("thinking", steps.draft(), true);
          else if (stepText.trim() && !emojiOnlyReply(stepText)) await publish("writing", stepText.trim(), true);
        } else if (part.type === "error") {
          const reason = part.error instanceof Error ? part.error.message : "The model stream failed";
          throw new Error(reason);
        } else if (part.type === "abort") {
          if (interrupted()) throw new TurnInterrupted();
          const reason = typeof part.reason === "string" && part.reason ? part.reason : "The model stream aborted";
          throw new Error(reason);
        }
      }
    } catch (error) {
      if (interrupted() || error instanceof TurnInterrupted) throw new TurnInterrupted();
      throw error;
    }

    clearInterval(poll);
    if (interrupted() || !(await turnIsCurrent(client, workerId, turn.id))) throw new TurnInterrupted();

    let content = stepText.trim();
    const marker = content ? takeReplyMarker(content) : null;
    if (marker && isChatEmoji(marker.body)) {
      try {
        await botSetEmoji(client, workerId, turn.id, marker.id, marker.body);
        return finish("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("Emoji target is not a message")) throw error;
      }
    }
    if (marker) {
      if (!quoted) {
        try {
          await botSetReplyTarget(client, workerId, turn.id, marker.id);
          quoted = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!message.includes("Reply target is not a message")) throw error;
        }
      }
      content = marker.body;
    }
    if (!content) {
      if (reacted || quoted || proposed || (turn.reactionNotice && !personIsWaiting(turn.messages))) return finish("");
      throw new Error("Mistral returned an empty reply");
    }
    await publish("writing", content, true);
    return finish(content.slice(0, 4000));
  } finally {
    clearTimeout(timeout);
    clearInterval(poll);
    client.off("notification", onNotify);
  }
}
