export type ArchivedWhatsAppMessage = {
  direction: "in" | "out";
  body: string;
  contact: string;
  occurred_at: string;
  meta_message_id: string;
};

const labels: Record<string, string> = {
  image: "Immagine",
  video: "Video",
  audio: "Audio",
  document: "Documento",
  sticker: "Sticker",
  location: "Posizione",
  contacts: "Contatto",
  media_placeholder: "Media",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function samePhone(left: string, right: string) {
  const a = digits(left);
  const b = digits(right);
  return a.length > 0 && a === b;
}

function contactPhone(value: string) {
  const phone = text(value);
  return phone.length <= 40 ? phone : phone.slice(0, 40);
}

function messageBody(message: Record<string, unknown>) {
  const type = text(message.type);
  const payload = record(message[type]);
  const body = text(payload?.body);
  if (body) return body.slice(0, 4000);
  const caption = text(payload?.caption);
  if (caption) return caption.slice(0, 4000);
  const label = labels[type];
  return label ?? (type ? "Messaggio" : "");
}

function occurredAt(value: unknown) {
  const seconds = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(seconds) || seconds < 1_000_000_000 || seconds > 4_000_000_000) {
    return new Date().toISOString();
  }
  return new Date(seconds * 1000).toISOString();
}

function metaId(value: unknown) {
  const id = text(value);
  return id.length >= 1 && id.length <= 200 ? id : "";
}

function pushMessage(
  messages: ArchivedWhatsAppMessage[],
  seen: Set<string>,
  message: Record<string, unknown>,
  direction: "in" | "out",
  contact: string,
) {
  const id = metaId(message.id);
  const body = messageBody(message);
  if (!id || !body || seen.has(id)) return;
  seen.add(id);
  messages.push({
    direction,
    body,
    contact: contactPhone(contact),
    occurred_at: occurredAt(message.timestamp),
    meta_message_id: id,
  });
}

function directionFor(from: string, businessPhone: string): "in" | "out" {
  return businessPhone && samePhone(from, businessPhone) ? "out" : "in";
}

export function messagesFromWebhook(payload: unknown) {
  const grouped = new Map<string, ArchivedWhatsAppMessage[]>();
  const root = record(payload);
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(record(entry)?.changes) ? record(entry)?.changes : [];
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const row = record(change);
      const value = record(row?.value);
      const field = text(row?.field);
      const metadata = record(value?.metadata);
      const phoneNumberId = text(metadata?.phone_number_id);
      if (!/^[0-9]{5,32}$/.test(phoneNumberId)) continue;
      const businessPhone = text(metadata?.display_phone_number);
      const bucket = grouped.get(phoneNumberId) ?? [];
      const seen = new Set(bucket.map((message) => message.meta_message_id));

      if (field === "messages" && Array.isArray(value?.messages)) {
        for (const item of value.messages) {
          const message = record(item);
          if (!message) continue;
          pushMessage(bucket, seen, message, "in", text(message.from));
        }
      }

      if (field === "smb_message_echoes" && Array.isArray(value?.message_echoes)) {
        for (const item of value.message_echoes) {
          const message = record(item);
          if (!message) continue;
          pushMessage(bucket, seen, message, "out", text(message.to));
        }
      }

      if (field === "history" && Array.isArray(value?.history)) {
        for (const chunk of value.history) {
          const history = record(chunk);
          const threads = Array.isArray(history?.threads) ? history.threads : [];
          for (const thread of threads) {
            const rowThread = record(thread);
            const threadId = text(rowThread?.id);
            const threadMessages = Array.isArray(rowThread?.messages) ? rowThread.messages : [];
            for (const item of threadMessages) {
              const message = record(item);
              if (!message) continue;
              const from = text(message.from);
              const direction = directionFor(from, businessPhone);
              const contact = threadId || (direction === "out" ? text(message.to) : from);
              pushMessage(bucket, seen, message, direction, contact);
            }
          }
          const loose = Array.isArray(history?.messages) ? history.messages : [];
          for (const item of loose) {
            const message = record(item);
            if (!message) continue;
            const from = text(message.from);
            const direction = directionFor(from, businessPhone);
            pushMessage(bucket, seen, message, direction, direction === "out" ? text(message.to) : from);
          }
        }
      }

      if (field === "history" && Array.isArray(value?.messages)) {
        for (const item of value.messages) {
          const message = record(item);
          if (!message) continue;
          const from = text(message.from);
          const direction = directionFor(from, businessPhone);
          pushMessage(bucket, seen, message, direction, direction === "out" ? text(message.to) : from);
        }
      }

      if (bucket.length > 0) grouped.set(phoneNumberId, bucket);
    }
  }
  return grouped;
}
