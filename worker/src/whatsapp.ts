import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import type pg from "pg";
import pino from "pino";

const logger = pino({ level: "silent" });

export type WhatsAppTarget = {
  integrationId: string;
  clinicId: string;
  status: string;
  qrRequestedAt: string | null;
  hasAuth: boolean;
};

type ActiveSession = {
  integrationId: string;
  sock: WASocket;
  closing: boolean;
};

const activeSessions = new Map<string, ActiveSession>();
const startingSessions = new Set<string>();
let cachedVersion: [number, number, number] | null = null;

async function getBaileysVersion(): Promise<[number, number, number]> {
  if (cachedVersion) return cachedVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedVersion = version;
    return version;
  } catch {
    return [2, 3000, 1015901307];
  }
}

async function createPostgresAuthState(
  client: pg.Client,
  workerId: string,
  integrationId: string,
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const result = await client.query<{ items: Record<string, string> | null }>(
    "select private.worker_get_baileys_auth($1, $2) as items",
    [workerId, integrationId],
  );
  const store = new Map<string, unknown>();
  const rawMap = result.rows[0]?.items ?? {};
  for (const [key, rawValue] of Object.entries(rawMap)) {
    try {
      store.set(key, JSON.parse(rawValue, BufferJSON.reviver));
    } catch {
      /* ignore malformed entry */
    }
  }

  const creds: AuthenticationCreds =
    (store.get("creds") as AuthenticationCreds | undefined) ?? initAuthCreds();
  store.set("creds", creds);

  async function flushEntries(entries: Record<string, string>, removeKeys: string[]) {
    if (Object.keys(entries).length === 0 && removeKeys.length === 0) return;
    await client.query("select private.worker_set_baileys_auth($1, $2, $3::jsonb, $4::text[])", [
      workerId,
      integrationId,
      JSON.stringify(entries),
      removeKeys.length > 0 ? removeKeys : null,
    ]);
  }

  const keys = {
    get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
      const data: { [id: string]: SignalDataTypeMap[T] } = {};
      for (const id of ids) {
        const value = store.get(`${type}-${id}`) as SignalDataTypeMap[T] | undefined;
        if (value !== undefined && value !== null) {
          if (type === "app-state-sync-key" && typeof value === "object") {
            data[id] = proto.Message.AppStateSyncKeyData.fromObject(
              value as Record<string, unknown>,
            ) as unknown as SignalDataTypeMap[T];
          } else {
            data[id] = value;
          }
        }
      }
      return data;
    },
    set: async (data: SignalDataSet) => {
      const entries: Record<string, string> = {};
      const removeKeys: string[] = [];
      for (const category of Object.keys(data) as Array<keyof SignalDataSet>) {
        const categoryData = data[category];
        if (!categoryData) continue;
        for (const id of Object.keys(categoryData)) {
          const value = categoryData[id];
          const key = `${String(category)}-${id}`;
          if (value !== null && value !== undefined) {
            store.set(key, value);
            entries[key] = JSON.stringify(value, BufferJSON.replacer);
          } else {
            store.delete(key);
            removeKeys.push(key);
          }
        }
      }
      await flushEntries(entries, removeKeys);
    },
  };

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(keys, logger),
    },
    saveCreds: async () => {
      store.set("creds", creds);
      await flushEntries({ creds: JSON.stringify(creds, BufferJSON.replacer) }, []);
    },
  };
}

function formatJidPhone(jid: string | undefined | null): string {
  if (!jid) return "";
  const userPart = jid.split("@")[0]?.split(":")[0] ?? "";
  const digits = userPart.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function extractMessageText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return "";
  if (typeof m.conversation === "string" && m.conversation.trim()) {
    return m.conversation.trim();
  }
  if (typeof m.extendedTextMessage?.text === "string" && m.extendedTextMessage.text.trim()) {
    return m.extendedTextMessage.text.trim();
  }
  if (typeof m.imageMessage?.caption === "string" && m.imageMessage.caption.trim()) {
    return m.imageMessage.caption.trim();
  }
  if (typeof m.videoMessage?.caption === "string" && m.videoMessage.caption.trim()) {
    return m.videoMessage.caption.trim();
  }
  if (typeof m.documentMessage?.caption === "string" && m.documentMessage.caption.trim()) {
    return m.documentMessage.caption.trim();
  }
  if (m.imageMessage) return "Immagine";
  if (m.videoMessage) return "Video";
  if (m.audioMessage) return "Audio";
  if (m.documentMessage) return "Documento";
  if (m.stickerMessage) return "Sticker";
  if (m.locationMessage) return "Posizione";
  if (m.contactMessage || m.contactsArrayMessage) return "Contatto";
  return "";
}

function extractOccurredAt(timestamp: unknown): string {
  const num =
    typeof timestamp === "number"
      ? timestamp
      : typeof timestamp === "object" && timestamp !== null && "low" in timestamp
        ? Number((timestamp as { low: number }).low)
        : Number(timestamp);
  if (Number.isFinite(num) && num > 1_000_000_000 && num < 4_000_000_000) {
    return new Date(num * 1000).toISOString();
  }
  return new Date().toISOString();
}

function toArchivedRecords(messages: WAMessage[]) {
  const records: Array<{
    direction: "in" | "out";
    body: string;
    contact: string;
    occurred_at: string;
    meta_message_id: string;
  }> = [];

  for (const msg of messages) {
    const key = msg.key;
    const remoteJid = key?.remoteJid ?? "";
    if (!remoteJid || remoteJid === "status@broadcast" || remoteJid.endsWith("@g.us")) {
      continue;
    }
    const id = key?.id?.trim() ?? "";
    const body = extractMessageText(msg);
    if (!id || !body) continue;
    const direction: "in" | "out" = key?.fromMe ? "out" : "in";
    const contact = formatJidPhone(remoteJid) || remoteJid.slice(0, 40);
    records.push({
      direction,
      body: body.slice(0, 4000),
      contact: contact.slice(0, 40),
      occurred_at: extractOccurredAt(msg.messageTimestamp),
      meta_message_id: id.slice(0, 200),
    });
  }
  return records;
}

async function archiveBatch(
  client: pg.Client,
  workerId: string,
  integrationId: string,
  messages: WAMessage[],
) {
  const records = toArchivedRecords(messages);
  if (records.length === 0) return;
  for (let i = 0; i < records.length; i += 300) {
    const chunk = records.slice(i, i + 300);
    try {
      await client.query("select private.worker_archive_whatsapp_messages($1, $2, $3::jsonb)", [
        workerId,
        integrationId,
        JSON.stringify(chunk),
      ]);
    } catch (error) {
      console.error(
        "whatsapp archive batch failed",
        integrationId,
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
}

async function startSession(
  client: pg.Client,
  workerId: string,
  integrationId: string,
) {
  if (activeSessions.has(integrationId) || startingSessions.has(integrationId)) return;
  startingSessions.add(integrationId);

  try {
    const { state, saveCreds } = await createPostgresAuthState(client, workerId, integrationId);
    const version = await getBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ["2tapdoc", "Chrome", "1.0.0"],
      syncFullHistory: true,
      markOnlineOnConnect: false,
    });

    const session: ActiveSession = {
      integrationId,
      sock,
      closing: false,
    };
    activeSessions.set(integrationId, session);

    sock.ev.on("creds.update", () => {
      void saveCreds().catch((error) => {
        console.error(
          "whatsapp creds save error",
          integrationId,
          error instanceof Error ? error.message : "unknown",
        );
      });
    });

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        void client
          .query("select private.worker_set_whatsapp_qr($1, $2, $3)", [
            workerId,
            integrationId,
            qr,
          ])
          .catch((error) => {
            console.error(
              "whatsapp qr save error",
              integrationId,
              error instanceof Error ? error.message : "unknown",
            );
          });
      }

      if (connection === "open") {
        const displayPhone = formatJidPhone(sock.user?.id) || "WhatsApp collegato";
        console.log("whatsapp connected", integrationId, displayPhone);
        void client
          .query("select private.worker_set_whatsapp_connected($1, $2, $3)", [
            workerId,
            integrationId,
            displayPhone,
          ])
          .catch((error) => {
            console.error(
              "whatsapp connected save error",
              integrationId,
              error instanceof Error ? error.message : "unknown",
            );
          });
      }

      if (connection === "close") {
        activeSessions.delete(integrationId);
        if (session.closing) return;

        const statusCode = (
          lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
        )?.output?.statusCode;

        const loggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        console.log("whatsapp connection closed", integrationId, statusCode, loggedOut);

        if (loggedOut) {
          void client
            .query("select private.worker_clear_baileys_auth($1, $2)", [workerId, integrationId])
            .catch(() => undefined);
        }
      }
    });

    sock.ev.on("messages.upsert", ({ messages }) => {
      if (!messages?.length) return;
      void archiveBatch(client, workerId, integrationId, messages);
    });

    sock.ev.on("messaging-history.set", ({ messages }) => {
      if (!messages?.length) return;
      void archiveBatch(client, workerId, integrationId, messages);
    });
  } catch (error) {
    console.error(
      "whatsapp session start failed",
      integrationId,
      error instanceof Error ? error.message : "unknown",
    );
  } finally {
    startingSessions.delete(integrationId);
  }
}

export async function reconcileWhatsAppSessions(client: pg.Client, workerId: string) {
  let targets: WhatsAppTarget[] = [];
  try {
    const result = await client.query<{ items: unknown }>(
      "select private.worker_list_whatsapp_targets($1) as items",
      [workerId],
    );
    const raw = result.rows[0]?.items;
    if (Array.isArray(raw)) {
      targets = raw as WhatsAppTarget[];
    }
  } catch (error) {
    console.error(
      "whatsapp targets query failed",
      error instanceof Error ? error.message : "unknown",
    );
    return;
  }

  const desiredIds = new Set(targets.map((item) => item.integrationId));

  for (const [integrationId, session] of activeSessions.entries()) {
    if (!desiredIds.has(integrationId)) {
      session.closing = true;
      activeSessions.delete(integrationId);
      try {
        session.sock.end(undefined);
      } catch {
        /* ignore close errors */
      }
    }
  }

  for (const target of targets) {
    if (!activeSessions.has(target.integrationId) && !startingSessions.has(target.integrationId)) {
      await startSession(client, workerId, target.integrationId);
    }
  }
}

export function stopAllWhatsAppSessions() {
  for (const [, session] of activeSessions.entries()) {
    session.closing = true;
    try {
      session.sock.end(undefined);
    } catch {
      /* ignore */
    }
  }
  activeSessions.clear();
}
