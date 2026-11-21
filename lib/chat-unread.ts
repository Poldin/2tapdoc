import { markdownToPlainText } from "@/lib/markdown";

export type ChatUnreadState = {
  chatId: string;
  clinicId: string;
  lastReadSeq: number;
  unreadCount: number;
  unreadMentionsCount: number;
  markedUnread: boolean;
  lastMessageSeq: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type ChatUnreadRpcRow = {
  chat_id?: unknown;
  last_read_seq?: unknown;
  unread_count?: unknown;
  unread_mentions_count?: unknown;
  marked_unread?: unknown;
};

export function parseSeq(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

export function parseNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return Math.max(0, parsed);
  }
  return 0;
}

export function asChatUnreadState(row: unknown): ChatUnreadState | null {
  if (!row || typeof row !== "object") return null;
  const item = row as Record<string, unknown>;
  if (typeof item.chat_id !== "string" || typeof item.clinic_id !== "string") return null;
  const rawPreview = typeof item.last_message_preview === "string" ? item.last_message_preview.trim() : "";
  const preview = rawPreview ? markdownToPlainText(rawPreview) : null;
  const lastMessageAt =
    typeof item.last_message_at === "string" && item.last_message_at.length > 0 ? item.last_message_at : null;
  return {
    chatId: item.chat_id,
    clinicId: item.clinic_id,
    lastReadSeq: parseSeq(item.last_read_seq),
    unreadCount: parseNonNegativeInt(item.unread_count),
    unreadMentionsCount: parseNonNegativeInt(item.unread_mentions_count),
    markedUnread: Boolean(item.marked_unread),
    lastMessageSeq: parseSeq(item.last_message_seq),
    lastMessageAt,
    lastMessagePreview: preview,
  };
}

export function formatUnreadCount(count: number): string {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

export function isChatUnread(
  state: Pick<ChatUnreadState, "unreadCount" | "markedUnread"> | null | undefined,
): boolean {
  return Boolean(state && (state.unreadCount > 0 || state.markedUnread));
}

export function unreadWeight(
  state: Pick<ChatUnreadState, "unreadCount" | "markedUnread"> | null | undefined,
): number {
  if (!state) return 0;
  if (state.unreadCount > 0) return state.unreadCount;
  return state.markedUnread ? 1 : 0;
}

export function summarizeClinicUnread(states: Iterable<ChatUnreadState>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const state of states) {
    const weight = unreadWeight(state);
    if (weight <= 0) continue;
    totals[state.clinicId] = (totals[state.clinicId] ?? 0) + weight;
  }
  return totals;
}

/**
 * Reconciles an incoming server/realtime state row against an in-flight optimistic read cursor.
 * Prevents a stale payload from momentarily resurrecting a badge the user just cleared,
 * while still immediately showing genuinely newer messages (lastMessageSeq > optimisticReadSeq).
 */
export function applyOptimisticReadGuard(
  incoming: ChatUnreadState,
  optimisticReadSeq: number | undefined,
  optimisticClearedMarked: boolean,
): ChatUnreadState {
  if (optimisticReadSeq === undefined && !optimisticClearedMarked) return incoming;

  const targetRead = optimisticReadSeq ?? 0;
  // If a strictly newer message arrived beyond our optimistic read cursor, trust the server count
  if (incoming.lastMessageSeq > targetRead) {
    return {
      ...incoming,
      lastReadSeq: Math.max(incoming.lastReadSeq, targetRead),
    };
  }

  // Otherwise, the server row hasn't caught up to our optimistic markRead yet
  return {
    ...incoming,
    lastReadSeq: Math.max(incoming.lastReadSeq, targetRead),
    unreadCount: 0,
    unreadMentionsCount: 0,
    markedUnread: optimisticClearedMarked ? false : incoming.markedUnread,
  };
}

export function applyRpcRowToState(
  current: ChatUnreadState | undefined,
  clinicId: string,
  row: ChatUnreadRpcRow,
): ChatUnreadState | null {
  const chatId = typeof row.chat_id === "string" ? row.chat_id : current?.chatId;
  if (!chatId) return null;
  const lastReadSeq = parseSeq(row.last_read_seq);
  return {
    chatId,
    clinicId: current?.clinicId ?? clinicId,
    lastReadSeq,
    unreadCount: parseNonNegativeInt(row.unread_count),
    unreadMentionsCount: parseNonNegativeInt(row.unread_mentions_count),
    markedUnread: Boolean(row.marked_unread),
    lastMessageSeq: Math.max(current?.lastMessageSeq ?? 0, lastReadSeq),
    lastMessageAt: current?.lastMessageAt ?? null,
    lastMessagePreview: current?.lastMessagePreview ?? null,
  };
}
