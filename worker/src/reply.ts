import { createMistral } from "@ai-sdk/mistral";
import { generateText, stepCountIs, tool } from "ai";
import type pg from "pg";
import { z } from "zod";
import {
  cancelServerAlerts,
  listServerAlerts,
  scheduleServerAlerts,
} from "./alerts.js";
import {
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
  botListAgendaBlocks,
  botListAppointments,
  botListBots,
  botListChats,
  botRenameClinic,
  botRenameSelf,
  botSearchPatients,
  botUpdateAgendaBlocks,
  botUpdateAppointments,
  botUpdateBots,
  botUpdateChats,
  botUpdatePatients,
} from "./db.js";
import { botColorIds, botFaceIds, channelSymbolIds } from "./marks.js";

export type TurnMessage = {
  role: "user" | "assistant";
  content: string;
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
  messages: TurnMessage[];
};

const modelTimeoutMs = 45_000;

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
    "Puoi usare Markdown semplice (grassetto, elenchi puntati, a capo). Niente HTML, niente tabelle larghe.",
    "Non mostrare mai gli UUID interni all'utente a meno che non te li chieda esplicitamente: usa sempre i nomi di medici, stanze e pazienti.",
    "",
    "### Risorse della clinica (Specialisti / Dottori):",
    doctorsList,
    "",
    "### Risorse della clinica (Stanze e Oggetti clinici):",
    objectsList,
    "",
    "### Regole operative per i Tool:",
    "- **Agenda**:",
    "  - Ogni appuntamento può coinvolgere **uno o più dottori** (`doctorIds`), **una o più stanze/oggetti clinici** (`clinicalObjectIds`) e **uno o più pazienti** (`patientIds`). Almeno un dottore o un oggetto clinico è obbligatorio.",
    "  - Con `createAppointments` puoi creare **uno o più appuntamenti in blocco** in una sola chiamata.",
    "  - Con `updateAppointments` puoi modificare **uno o più appuntamenti in blocco** (orari, titolo, nota, dottori, oggetti clinici, pazienti). Prima di modificare o cancellare, se non conosci gli ID degli appuntamenti, cercali con `listAppointments`.",
    "  - Con `deleteAppointments` proponi l'eliminazione di uno o più appuntamenti, anche tutti quelli richiesti, in una sola chiamata. Il sistema non elimina: apre un solo dialog. La chiamata risponde `awaiting_user`. Non chiedere conferma in chat, non dire che l'eliminazione è avvenuta e non rifiutare l'azione perché sono tanti.",
    "  - Quando un appuntamento riguarda un paziente, usa l'id trovato con `searchPatients`.",
    "  - Un **blocco di agenda** non è un appuntamento: occupa il tempo di uno o più dottori (`doctorIds`) o di una o più stanze/oggetti (`clinicalObjectIds`), con un titolo obbligatorio e una descrizione facoltativa. Non ha pazienti e non impedisce un appuntamento nello stesso orario.",
    "  - Con `createAgendaBlocks` e `updateAgendaBlocks` crei o modifichi uno o più blocchi. Per leggerli usa `listAgendaBlocks`. Non usare gli strumenti degli appuntamenti per un blocco, né il contrario.",
    "  - Con `deleteAgendaBlocks` proponi l'eliminazione di uno o più blocchi in una sola chiamata. Vale la stessa regola di `deleteAppointments`: un solo dialog, risposta `awaiting_user`, niente conferma in chat.",
    "  - Se ti chiedono che cosa c'è in agenda in un intervallo, leggi sia gli appuntamenti sia i blocchi.",
    "  - Tutte le date/orari passati ai tool devono essere in formato ISO 8601 completo di offset (es. `2026-10-28T09:30:00+01:00`) e, accanto a ciascuna data, il nome del giorno in italiano nel fuso Europe/Rome (es. `mercoledì`). Il nome deve coincidere con la data: se non coincide, il tool rifiuta la chiamata.",
    "- **Pazienti**:",
    "  - Con `searchPatients` leggi l'anagrafica: nome, cognome, data di nascita, codice fiscale, telefono, email, note e data di creazione del profilo (`createdAt`, sola lettura).",
    "  - Con `createPatients` puoi creare uno o più pazienti, se hai il permesso di scrittura.",
    "  - Con `updatePatients` puoi modificare uno o più pazienti già esistenti. Prima cercali per avere l'id. I campi che non indichi restano invariati; passa null per svuotare data di nascita, codice fiscale, telefono, email o nota.",
    "  - Con `deletePatients` proponi l'eliminazione di uno o più pazienti, fino a 30, in una sola chiamata. Se chiedono di eliminarne tanti o tutti, cerca gli id e passali insieme: il dialog è uno solo per l'intera chiamata, non uno per paziente. Non dire che non puoi farlo in un'unica azione. La chiamata risponde `awaiting_user`. Non chiedere conferma in chat e non dire che l'eliminazione è avvenuta. Se l'utente conferma, il sistema elimina tutti quelli della chiamata e ti avvisa; se annulla, non è stato eliminato nulla.",
    "- **Dialog di conferma**:",
    "  - Le azioni che aspettano un sì non le esegui tu. Chiami il tool e il sistema mostra sempre lo stesso dialog: «[tuo nome] sta tentando di eseguire [azione]. Procedere?».",
    "  - Una chiamata, un dialog, tutti gli elementi di quella chiamata. Non spezzare la richiesta in conferme separate e non rifiutarla.",
    "- **Conversazioni e bot**:",
    "  - Puoi agire anche sulle altre conversazioni di questa clinica. Prima, se non conosci gli id, usa `listChats` e `listBots`.",
    "  - `createChats` apre una o più conversazioni in una sola chiamata. `createBots` crea uno o più bot: ognuno nasce già dentro una conversazione sua.",
    "  - `updateChats`, `deleteChats`, `updateBots` e `deleteBots` non eseguono. Una sola chiamata, anche con tanti id, apre un solo dialog e risponde `awaiting_user`. Non chiedere conferma in chat e non dire che è già fatto.",
    "  - Puoi modificare le conversazioni di cui fai parte. Puoi eliminare solo quelle che hai creato tu (`createdByMe`). Non puoi eliminare te stesso. Per cambiare il tuo nome usa `renameSelf`.",
    "  - Colori, facce e simboli vanno passati con il loro id.",
    "- **Clinica e identità**:",
    "  - Con `renameClinic` puoi cambiare il nome della clinica, se hai il permesso. Il nome sta entro 80 caratteri.",
    "  - Con `renameSelf` puoi cambiare il tuo nome, entro 40 caratteri. Il titolo di questa chat viene allineato al nuovo nome.",
    "- **Alert del Server / Container**:",
    "  - Usa `setServerAlerts` per programmare uno o più alert/sveglie direttamente nel container del server (specificando `delaySeconds` per attese relative come 'tra 5 minuti' oppure `firesAtIso` per un orario preciso).",
    "  - Quando l'alert scatta sul server, ti risveglierà automaticamente con l'istruzione salvata in `prompt` e potrai scrivere in questa chat (anche controllando l'agenda in quel momento).",
    "  - Usa `listServerAlerts` e `cancelServerAlerts` per vedere o annullare gli alert attivi nel server.",
    "- Non inventare mai di aver eseguito un'azione se non hai chiamato il relativo tool con successo. Se manca un dato essenziale (es. quale medico o quale orario), chiedilo.",
  ].join("\n");
}

export async function replyToTurn(
  apiKey: string,
  client: pg.Client,
  workerId: string,
  turn: Turn,
): Promise<string> {
  const messages: TurnMessage[] = [...turn.messages];
  if (turn.alertPrompt) {
    messages.push({
      role: "user",
      content: `[ALERT SERVER SCATTATO NEL CONTAINER]\nEsegui questa istruzione o avvisa in chat:\n${turn.alertPrompt}`,
    });
  }
  if (!messages.some((message) => message.role === "user")) {
    throw new Error("The chat has no message to answer");
  }

  const now = new Date();
  const perms = new Set(turn.permissions);
  const canReadAgenda = perms.has("agenda.read") || perms.has("agenda.write");
  const canWriteAgenda = perms.has("agenda.write");
  const canReadPatients = perms.has("patients.read") || perms.has("patients.write");
  const canWritePatients = perms.has("patients.write");
  const canRenameClinic = perms.has("clinic.update");

  const tools = {
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

    listAppointments: tool({
      description:
        "Legge gli appuntamenti dell'agenda in un intervallo di tempo, con filtro opzionale per dottori, stanze/oggetti clinici o pazienti.",
      inputSchema: z
        .object({
        fromIso: z.string().describe("Inizio intervallo in formato ISO 8601 (es. 2026-10-28T00:00:00+01:00)"),
        fromDay: weekdayName.describe("Giorno di fromIso (es. mercoledì)"),
        toIso: z.string().describe("Fine intervallo in formato ISO 8601 (es. 2026-10-29T00:00:00+01:00)"),
        toDay: weekdayName.describe("Giorno di toIso (es. giovedì)"),
        doctorIds: z.array(z.string().uuid()).optional().describe("Filtra per ID di uno o più dottori"),
        clinicalObjectIds: z
          .array(z.string().uuid())
          .optional()
          .describe("Filtra per ID di una o più stanze/oggetti clinici"),
        patientIds: z.array(z.string().uuid()).optional().describe("Filtra per ID di uno o più pazienti"),
      })
        .superRefine((value, ctx) => {
          sameWeekday(value.fromIso, value.fromDay, ctx, "fromIso", "fromDay");
          sameWeekday(value.toIso, value.toDay, ctx, "toIso", "toDay");
        }),
      execute: async ({ fromIso, toIso, doctorIds, clinicalObjectIds, patientIds }) => {
        const items = await botListAppointments(client, workerId, turn.id, {
          from: fromIso,
          to: toIso,
          doctorIds,
          clinicalObjectIds,
          patientIds,
        });
        return { appointments: withDayNames(items) };
      },
    }),

    createAppointments: tool({
      description:
        "Crea uno o più appuntamenti nell'agenda della clinica. Ogni appuntamento può avere più dottori (doctorIds), più stanze/oggetti clinici (clinicalObjectIds) e più pazienti (patientIds).",
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

    listAgendaBlocks: tool({
      description:
        "Legge i blocchi di agenda in un intervallo di tempo. Un blocco occupa il tempo di dottori o stanze e non è un appuntamento.",
      inputSchema: z
        .object({
          fromIso: z.string().describe("Inizio intervallo in formato ISO 8601 (es. 2026-10-28T00:00:00+01:00)"),
          fromDay: weekdayName.describe("Giorno di fromIso (es. mercoledì)"),
          toIso: z.string().describe("Fine intervallo in formato ISO 8601 (es. 2026-10-29T00:00:00+01:00)"),
          toDay: weekdayName.describe("Giorno di toIso (es. giovedì)"),
          doctorIds: z.array(z.string().uuid()).optional().describe("Filtra per ID di uno o più dottori"),
          clinicalObjectIds: z
            .array(z.string().uuid())
            .optional()
            .describe("Filtra per ID di una o più stanze/oggetti clinici"),
        })
        .superRefine((value, ctx) => {
          sameWeekday(value.fromIso, value.fromDay, ctx, "fromIso", "fromDay");
          sameWeekday(value.toIso, value.toDay, ctx, "toIso", "toDay");
        }),
      execute: async ({ fromIso, toIso, doctorIds, clinicalObjectIds }) => {
        const items = await botListAgendaBlocks(client, workerId, turn.id, {
          from: fromIso,
          to: toIso,
          doctorIds,
          clinicalObjectIds,
        });
        return { blocks: withDayNames(items) };
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
        "Modifica uno o più blocchi di agenda (orario, titolo, descrizione, dottori, stanze/oggetti). Prima di modificare, se non conosci gli ID, cercali con listAgendaBlocks.",
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

    searchPatients: tool({
      description:
        "Legge i pazienti della clinica, inclusa la data di creazione del profilo (`createdAt`). Cerca per nome, cognome, codice fiscale, telefono o email; senza testo restituisce i primi pazienti.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Testo da cercare (nome, cognome, telefono, CF). Lascia vuoto per vedere i primi pazienti."),
      }),
      execute: async ({ query }) => {
        const patients = await botSearchPatients(client, workerId, turn.id, query);
        return { patients };
      },
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

    listChats: tool({
      description: "Elenca le conversazioni di questa clinica a cui partecipi, anche quelle diverse da questa.",
      inputSchema: z.object({}),
      execute: async () => ({ chats: await botListChats(client, workerId, turn.id) }),
    }),

    listBots: tool({
      description: "Elenca i bot tuoi in questa clinica, te compreso.",
      inputSchema: z.object({}),
      execute: async () => ({ bots: await botListBots(client, workerId, turn.id) }),
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
  };

  type ToolName = keyof typeof tools;
  const activeTools: ToolName[] = [
    "setServerAlerts",
    "listServerAlerts",
    "cancelServerAlerts",
    "renameSelf",
    "listChats",
    "listBots",
    "createChats",
    "createBots",
    "updateChats",
    "deleteChats",
    "updateBots",
    "deleteBots",
  ];
  if (canRenameClinic) activeTools.push("renameClinic");
  if (canReadAgenda) activeTools.push("listAppointments", "listAgendaBlocks");
  if (canWriteAgenda) {
    activeTools.push(
      "createAppointments",
      "updateAppointments",
      "deleteAppointments",
      "createAgendaBlocks",
      "updateAgendaBlocks",
      "deleteAgendaBlocks",
    );
  }
  if (canReadPatients) activeTools.push("searchPatients");
  if (canWritePatients) activeTools.push("createPatients", "updatePatients", "deletePatients");

  const mistral = createMistral({ apiKey });
  const modelName = process.env.MISTRAL_MODEL?.trim() || "mistral-medium-latest";

  const result = await generateText({
    model: mistral(modelName),
    system: buildSystemPrompt(turn, now),
    messages,
    tools,
    activeTools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1000,
    abortSignal: AbortSignal.timeout(modelTimeoutMs),
  });

  const content = result.text.trim();
  if (!content) {
    throw new Error("Mistral returned an empty reply");
  }
  return content.slice(0, 4000);
}
