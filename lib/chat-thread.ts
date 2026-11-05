import { parseAgentSteps, type AgentStep } from "@/lib/agent-steps";
import { isChatEmoji } from "@/lib/chat-emoji";
import { markdownToPlainText } from "@/lib/markdown";
import { takeReplyMarker } from "@/lib/reply-marker";
import { createClient } from "@/lib/supabase/server";

/** First screen of a chat, and each older page opened from the button. */
export const chatPageSize = 40;

export type ThreadMessage = {
  id: string;
  seq: number;
  body: string;
  createdAt: string;
  mine: boolean;
  botId: string | null;
  preferredAt: string | null;
  reaction: "up" | "down" | null;
  replyTo: { id: string; excerpt: string; mine: boolean; botId: string | null } | null;
  emojis: { emoji: string; mine: boolean; botId: string | null }[];
  steps: AgentStep[];
};

type EventRow = {
  id: string;
  seq: number | string;
  kind: string;
  payload: unknown;
  created_at: string;
  user_id: string | null;
  bot_id: string | null;
  preferred_at: string | null;
  reply_to_id: string | null;
};

type StoredMessage = EventRow & { body: string; seq: number };

export function messageBody(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = (payload as { body?: unknown }).body;
  return typeof body === "string" && body.trim() !== "" ? body : null;
}

function messageSteps(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return parseAgentSteps((payload as { steps?: unknown }).steps);
}

function asSeq(value: number | string) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function asEvent(value: unknown): EventRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<EventRow>;
  if (typeof row.id !== "string" || typeof row.created_at !== "string") return null;
  if (typeof row.seq !== "number" && typeof row.seq !== "string") return null;
  if (asSeq(row.seq) === null) return null;
  return row as EventRow;
}

function asStored(row: EventRow): StoredMessage | null {
  const body = messageBody(row.payload);
  const seq = asSeq(row.seq);
  if (!body || seq === null) return null;
  return { ...row, body, seq };
}

export async function loadChatThread(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  chatId: string,
  beforeSeq: number | null,
): Promise<{ messages: ThreadMessage[]; hasOlder: boolean; nextCursor: number | null; error?: string }> {
  let query = supabase
    .from("chat_events")
    .select("id, seq, kind, payload, created_at, user_id, bot_id, preferred_at, reply_to_id")
    .eq("chat_id", chatId)
    .eq("kind", "message");
  if (beforeSeq !== null) query = query.lt("seq", beforeSeq);

  const { data, error } = await query.order("seq", { ascending: false }).limit(chatPageSize + 1);
  if (error) return { messages: [], hasOlder: false, nextCursor: null, error: error.message };

  const rows = (data ?? []).flatMap((item) => {
    const row = asEvent(item);
    return row ? [row] : [];
  });
  const hasOlder = rows.length > chatPageSize;
  const taken = rows.slice(0, chatPageSize);
  const nextCursor = taken.length > 0 ? asSeq(taken[taken.length - 1].seq) : null;
  const visible = taken.flatMap((row) => {
    const stored = asStored(row);
    return stored ? [stored] : [];
  });
  visible.reverse();

  const byId = new Map(visible.map((row) => [row.id, row]));
  const missingReplyIds = [
    ...new Set(
      visible.flatMap((row) => {
        const linked = row.reply_to_id ?? (row.bot_id ? takeReplyMarker(row.body)?.id : null);
        return linked && !byId.has(linked) ? [linked] : [];
      }),
    ),
  ];
  if (missingReplyIds.length > 0) {
    const { data: replies } = await supabase
      .from("chat_events")
      .select("id, seq, kind, payload, created_at, user_id, bot_id, preferred_at, reply_to_id")
      .eq("chat_id", chatId)
      .in("id", missingReplyIds);
    for (const item of replies ?? []) {
      const row = asEvent(item);
      const stored = row ? asStored(row) : null;
      if (stored) byId.set(stored.id, stored);
    }
  }

  const ids = visible.map((row) => row.id);
  const reactionByEvent = new Map<string, "up" | "down">();
  const emojiByEvent = new Map<string, ThreadMessage["emojis"]>();
  if (ids.length > 0) {
    const [{ data: reactionRows }, { data: emojiRows }] = await Promise.all([
      supabase.from("message_reaction_current").select("event_id, vote").eq("user_id", userId).in("event_id", ids),
      supabase
        .from("message_emojis")
        .select("event_id, emoji, user_id, bot_id")
        .in("event_id", ids)
        .order("created_at"),
    ]);
    for (const row of reactionRows ?? []) {
      if (row.vote === "up" || row.vote === "down") reactionByEvent.set(row.event_id, row.vote);
    }
    for (const row of emojiRows ?? []) {
      if (typeof row.emoji !== "string" || !isChatEmoji(row.emoji)) continue;
      const list = emojiByEvent.get(row.event_id) ?? [];
      list.push({ emoji: row.emoji, mine: row.user_id === userId, botId: row.bot_id });
      emojiByEvent.set(row.event_id, list);
    }
  }

  const messages = visible.flatMap((row) => {
    const marker = row.bot_id ? takeReplyMarker(row.body) : null;
    const replyId = row.reply_to_id ?? marker?.id ?? null;
    const target = replyId ? byId.get(replyId) : undefined;
    const markerIsMessage = Boolean(marker && (row.reply_to_id || target?.id === marker.id));
    const body = marker && markerIsMessage ? marker.body : row.body;
    return [
      {
        id: row.id,
        seq: row.seq,
        body,
        createdAt: row.created_at,
        mine: row.user_id === userId,
        botId: row.bot_id ?? null,
        preferredAt: row.preferred_at ?? null,
        reaction: reactionByEvent.get(row.id) ?? null,
        replyTo: target
          ? {
              id: target.id,
              excerpt: markdownToPlainText(takeReplyMarker(target.body)?.body ?? target.body).slice(0, 180),
              mine: target.user_id === userId,
              botId: target.bot_id ?? null,
            }
          : null,
        emojis: emojiByEvent.get(row.id) ?? [],
        steps: row.bot_id ? messageSteps(row.payload) : [],
      },
    ];
  });

  return { messages, hasOlder, nextCursor };
}
