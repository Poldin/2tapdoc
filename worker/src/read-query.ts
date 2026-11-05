const maxSqlChars = 4000;
export const readRowCap = 200;
const readPayloadCap = 24_000;

const forbiddenCall = [
  "set_config",
  "setval",
  "nextval",
  "dblink",
  "dblink_exec",
  "pg_read_file",
  "pg_read_binary_file",
  "pg_ls_dir",
  "pg_stat_file",
  "lo_import",
  "lo_export",
  "lo_get",
  "lo_from_bytea",
  "pg_sleep",
  "pg_terminate_backend",
  "pg_cancel_backend",
  "pg_reload_conf",
  "pg_rotate_logfile",
];

export type PreparedReadSql = { text: string; values: [boolean] };
export type ClassifiedSql =
  | { mode: "read"; text: string; values: [boolean] }
  | { mode: "write"; sql: string }
  | { error: string };

const writeCommand = /^(insert|update|delete|with)\b/i;
const writeVerb = /\b(insert|update|delete)\b/i;

function screenSql(input: string): { sql: string; masked: string } | { error: string } {
  const sql = input.trim();
  if (!sql) return { error: "Manca la query." };
  if (sql.length > maxSqlChars) return { error: "La query è troppo lunga." };

  let masked: string;
  try {
    masked = maskLiterals(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query non valida.";
    return { error: message };
  }

  if (masked.includes(";")) return { error: "È ammessa una sola istruzione." };
  if (/\$\d+/.test(masked)) return { error: "Non usare segnaposto $1. Scrivi i valori nella query." };

  const body = masked.trim();
  if (parenBalance(body) !== 0) return { error: "Le parentesi della query non tornano." };
  if (/\bprivate\s*\./i.test(body) || /\bauth\s*\./i.test(body)) {
    return { error: "Si usano solo le tabelle public." };
  }

  for (const name of forbiddenCall) {
    if (new RegExp(`\\b${name}\\b`, "i").test(body)) {
      return { error: `La funzione ${name} non è ammessa.` };
    }
  }

  return { sql, masked };
}

const writeNouns: Record<string, [string, string]> = {
  patients: ["paziente", "pazienti"],
  appointments: ["appuntamento", "appuntamenti"],
  agenda_blocks: ["blocco di agenda", "blocchi di agenda"],
  doctors: ["specialista", "specialisti"],
  clinical_objects: ["stanza o oggetto", "stanze o oggetti"],
  chats: ["conversazione", "conversazioni"],
  bots: ["agente", "agenti"],
};

export function writeTarget(sql: string): string | null {
  const bare = sql.replace(/'(?:[^']|'')*'/g, " ");
  const match = bare.match(/\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_][a-z0-9_]*)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function rowPhrase(row: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const person = `${text(row.given_name)} ${text(row.family_name)}`.replace(/\s+/g, " ").trim();
  if (person) return person.slice(0, 80);
  for (const key of ["title", "name", "fiscal_code", "email", "phone"]) {
    const value = text(row[key]);
    if (value) return value.slice(0, 80);
  }
  return "";
}

export function confirmationPhrase(label: string, count: number, sql: string, samples: string[]): string {
  const pair = writeNouns[writeTarget(sql) ?? ""];
  const noun = pair ? (count === 1 ? pair[0] : pair[1]) : count === 1 ? "elemento" : "elementi";
  const shown = samples.map((item) => item.trim()).filter(Boolean).slice(0, 6);
  const rest = Math.max(count - shown.length, 0);
  const who = shown.length ? `, tra cui ${shown.join(", ")}` : "";
  const more = rest > 0 ? ` e altri ${rest}` : "";
  return `${label}: ${count} ${noun}${who}${more}`.slice(0, 1000);
}

export function classifyBotSql(input: string): ClassifiedSql {
  const screened = screenSql(input);
  if ("error" in screened) return screened;
  const body = screened.masked.trim();
  if (writeVerb.test(body)) {
    if (!writeCommand.test(body)) {
      return { error: "Una modifica inizia con INSERT, UPDATE, DELETE o WITH." };
    }
    if (/\bbot_confirmations\b/i.test(body)) {
      return { error: "Le conferme non si modificano da SQL." };
    }
    return { mode: "write", sql: screened.sql.replace(/;\s*$/, "") };
  }
  const prepared = prepareReadSql(screened.sql);
  if ("error" in prepared) return prepared;
  return { mode: "read", text: prepared.text, values: prepared.values };
}

export function prepareReadSql(input: string): PreparedReadSql | { error: string } {
  const screened = screenSql(input);
  if ("error" in screened) return screened;

  const body = screened.masked.trim();
  if (!/^(select|with)\b/i.test(body)) return { error: "È ammessa solo una SELECT." };
  if (writeVerb.test(body)) return { error: "Questa istruzione modifica i dati: va confermata, non letta." };
  if (/\binto\b/i.test(body)) return { error: "SELECT INTO non è ammessa." };

  const inner = screened.sql.replace(/;\s*$/, "");
  return {
    text: `select coalesce(jsonb_agg((to_jsonb(q) - '_ord') order by q._ord), '[]'::jsonb) as rows
from (
  select src.*, row_number() over () as _ord
  from (
${inner}
  ) as src
  limit ${readRowCap + 1}
) as q
where $1::boolean`,
    values: [true],
  };
}

export function boundReadRows(rows: unknown[]): { rows: unknown[]; truncated: boolean } {
  let kept = rows.length > readRowCap ? rows.slice(0, readRowCap) : rows;
  let truncated = rows.length > readRowCap;
  while (kept.length > 0 && JSON.stringify(kept).length > readPayloadCap) {
    kept = kept.slice(0, -1);
    truncated = true;
  }
  return { rows: kept, truncated };
}

function parenBalance(sql: string): number {
  let balance = 0;
  for (const char of sql) {
    if (char === "(") balance += 1;
    if (char === ")") {
      balance -= 1;
      if (balance < 0) return balance;
    }
  }
  return balance;
}

function maskLiterals(sql: string): string {
  let out = "";
  for (let index = 0; index < sql.length; index += 1) {
    const rest = sql.slice(index);
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", index);
      const stop = end === -1 ? sql.length : end;
      out += " ".repeat(stop - index);
      index = stop - 1;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Commento non chiuso.");
      out += " ".repeat(end + 2 - index);
      index = end + 1;
      continue;
    }
    if (sql[index] === "'") {
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === "'" && sql[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        if (sql[cursor] === "'") break;
        cursor += 1;
      }
      if (cursor >= sql.length) throw new Error("Stringa non chiusa.");
      out += " ".repeat(cursor + 1 - index);
      index = cursor;
      continue;
    }
    const dollar = rest.match(/^\$([A-Za-z0-9_]*)\$/);
    if (dollar) {
      const closer = `$${dollar[1]}$`;
      const start = index + dollar[0].length;
      const end = sql.indexOf(closer, start);
      if (end === -1) throw new Error("Stringa non chiusa.");
      const stop = end + closer.length;
      out += " ".repeat(stop - index);
      index = stop - 1;
      continue;
    }
    out += sql[index];
  }
  return out;
}

export const readQueryDescription = [
  "Una sola istruzione sullo schema public, con i valori scritti nella query.",
  "SELECT e WITH di sola lettura partono subito. Vedi solo le righe del proprietario del bot. Massimo 200 righe.",
  "INSERT, UPDATE e DELETE non partono. Non elencare gli id: filtra con WHERE. Passa anche label, la frase del dialog. Esempio: DELETE FROM patients WHERE fiscal_code IS NULL OR fiscal_code = '' con label «l'eliminazione dei pazienti senza codice fiscale». La risposta è awaiting_user: il sistema apre il dialog. Non chiedere conferma in chat e non dire che è già fatto.",
  "Se la query sbaglia, leggi error e correggila.",
  "Massimo 200 righe. Gli orari sono timestamptz: confrontali con un offset, per esempio 2026-11-05T00:00:00+01:00.",
  "Tabelle:",
  "patients(id, clinic_id, given_name, family_name, date_of_birth, fiscal_code, phone, email, note, created_at)",
  "appointments(id, clinic_id, title, note, starts_at, ends_at, created_at)",
  "appointment_doctors(appointment_id, doctor_id) appointment_objects(appointment_id, clinical_object_id) appointment_patients(appointment_id, patient_id)",
  "agenda_blocks(id, clinic_id, title, description, starts_at, ends_at) agenda_block_doctors(block_id, doctor_id) agenda_block_objects(block_id, clinical_object_id)",
  "doctors(id, clinic_id, given_name, family_name, specialization, active, user_id)",
  "clinical_objects(id, clinic_id, name, kind, description, attributes)",
  "chats(id, created_by, title, color, emoji, created_at) chat_participants(chat_id, user_id, bot_id) chat_clinics(chat_id, clinic_id)",
  "chat_events(id, chat_id, seq, kind, payload, user_id, bot_id, created_at, reply_to_id, preferred_at). Un messaggio ha kind = 'message' e il testo in payload->>'body'.",
  "message_emojis(event_id, chat_id, user_id, bot_id, emoji) message_reactions(event_id, user_id, vote)",
  "bots(id, owner_user_id, name, color, emoji) bot_clinics(bot_id, clinic_id)",
  "bot_confirmations(id, clinic_id, chat_id, bot_id, kind, action, status, payload, created_at, decided_at). status = 'pending' è una proposta ancora da confermare.",
  "clinics(id, name) memberships(clinic_id, user_id, clinic_role_id) clinic_roles(id, clinic_id, name, slug, is_admin) clinic_role_permissions(clinic_role_id, permission_key) permissions(key, description) profiles(id, email, name)",
  "integrations(id, clinic_id, provider, account, status) whatsapp_channels(integration_id, credit_cents, display_phone, waba_id, phone_number_id) whatsapp_messages(id, integration_id, direction, body, contact, occurred_at)",
].join("\n");
