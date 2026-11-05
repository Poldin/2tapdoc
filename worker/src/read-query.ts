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

export function prepareReadSql(input: string): PreparedReadSql | { error: string } {
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
  if (!/^(select|with)\b/i.test(body)) return { error: "È ammessa solo una SELECT." };
  if (/\binto\b/i.test(body)) return { error: "SELECT INTO non è ammessa." };
  if (parenBalance(body) !== 0) return { error: "Le parentesi della query non tornano." };
  if (/\bprivate\s*\./i.test(body) || /\bauth\s*\./i.test(body)) {
    return { error: "Si leggono solo le tabelle public." };
  }

  for (const name of forbiddenCall) {
    if (new RegExp(`\\b${name}\\b`, "i").test(body)) {
      return { error: `La funzione ${name} non è ammessa.` };
    }
  }

  const inner = sql.replace(/;\s*$/, "");
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
  "Legge i dati visibili al proprietario di questo bot. Una sola SELECT sullo schema public: puoi filtrare, unire e aggregare. Non scrive, non modifica, non cancella.",
  "Per creare o modificare usa il tool dell'operazione. Se la query sbaglia, leggi error e correggila.",
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
