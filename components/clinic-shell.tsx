"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Plus, Reply, Search, Send, SmilePlus, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import {
  loadOlderChatMessages,
  preferMessage,
  reactToMessage,
  sendMessage,
  setMessageEmoji,
  type CreatedChat,
  type FormState,
} from "@/app/clinics/actions";
import { chatEmojis } from "@/lib/chat-emoji";
import { markdownToPlainText } from "@/lib/markdown";
import { takeReplyMarker } from "@/lib/reply-marker";
import { botGreeting } from "@/lib/bot-greeting";
import { AgendaListItem, agendaListId } from "@/components/agenda-list-item";
import { type AgendaEditPatient } from "@/components/agenda-edit-dialog";
import { AgendaView, type AgendaAppointment, type AgendaBlock, type AgendaLane } from "@/components/agenda-view";
import { PatientsListItem, patientsListId } from "@/components/patients-list-item";
import { PatientPage } from "@/components/patient-page";
import { BotActionDialog, type BotActionRequest } from "@/components/bot-action-dialog";
import { PatientsView } from "@/components/patients-view";
import { type PatientRecord } from "@/lib/patients";
import { SettingsListItem, settingsListId } from "@/components/settings-list-item";
import {
  SettingsView,
  type ClinicAsset,
  type ClinicIntegration,
  type ClinicMember,
  type ClinicRole,
  type Specialist,
} from "@/components/settings-view";
import {
  rememberAgenda,
  rememberPatients,
  rememberSettings,
  placeByRecency,
  type ClinicRecency,
} from "@/lib/clinic-recency";
import { rememberLastClinic } from "@/lib/last-clinic";
import { createClient } from "@/lib/supabase/client";
import { BotDialog, type BotDraft } from "@/components/bot-dialog";
import { BotGlyph, ChannelMark, warmBotFaces } from "@/components/mark";
import { ChatDialog, type ChatDraft } from "@/components/chat-dialog";
import { ChatMenu } from "@/components/chat-menu";
import { ChatTitle } from "@/components/chat-title";
import { ClinicSwitcher, type ClinicOption } from "@/components/clinic-switcher";
import { CreateMenu } from "@/components/create-menu";
import { SearchDialog } from "@/components/search-dialog";
import { Markdown } from "@/components/markdown";

export type ChatListItem = {
  id: string;
  title: string | null;
  color: string;
  emoji: string;
  preview: string | null;
  activityAt: string;
  bot: BotMark | null;
};

export type ChatReply = {
  id: string;
  excerpt: string;
  mine: boolean;
  botId: string | null;
};

export type ChatEmojiMark = {
  emoji: string;
  mine: boolean;
  botId: string | null;
};

export type ReplyDraft = {
  id: string;
  label: string;
  excerpt: string;
};

export type ChatMessage = {
  id: string;
  seq: number;
  body: string;
  createdAt: string;
  mine: boolean;
  botId: string | null;
  preferredAt: string | null;
  reaction: "up" | "down" | null;
  replyTo: ChatReply | null;
  emojis: ChatEmojiMark[];
};

export type BotMark = {
  id: string;
  name: string;
  color: string;
  emoji: string;
};

type LiveReply = {
  botId: string;
  phase: "thinking" | "writing";
  body: string;
  updatedAt: string;
};

/** Il messaggio del bot è già in chat: la bozza (faccia che pensa o testo a metà) è un residuo del turno appena chiuso. */
function liveDraftSettled(live: LiveReply, messages: ChatMessage[]) {
  const message = [...messages].reverse().find((item) => item.botId === live.botId);
  if (!message) return false;
  const draftAt = Date.parse(live.updatedAt);
  const savedAt = Date.parse(message.createdAt);
  if (Number.isNaN(draftAt) || Number.isNaN(savedAt)) {
    const draft = live.body.trim();
    return draft.length > 0 && message.body.trim() === draft;
  }
  return savedAt >= draftAt;
}

function messageStamp(messages: ChatMessage[]) {
  return messages
    .map((message) =>
      [
        message.id,
        message.seq,
        message.body,
        message.preferredAt ?? "",
        message.reaction ?? "",
        message.replyTo?.excerpt ?? "",
        message.emojis.map((emoji) => `${emoji.emoji}:${emoji.mine ? 1 : 0}:${emoji.botId ?? ""}`).join("."),
      ].join("\u001f"),
    )
    .join("\u001e");
}

type Outgoing = {
  id: string;
  chatId: string;
  body: string;
  createdAt: string;
  replyTo: ChatReply | null;
  error: string | null;
  seenIds: string[];
};

function outgoingMessage(item: Outgoing): ChatMessage {
  return {
    id: item.id,
    seq: Number.MAX_SAFE_INTEGER,
    body: item.body,
    createdAt: item.createdAt,
    mine: true,
    botId: null,
    preferredAt: null,
    reaction: null,
    replyTo: item.replyTo,
    emojis: [],
  };
}

function reconcileOutgoing(
  items: Outgoing[],
  chatId: string | null,
  server: ChatMessage[],
  known: Set<string>,
) {
  if (!chatId) return items;
  const mine = server.filter((message) => message.mine);
  const used = new Set<string>();
  let changed = false;
  const next = items.filter((item) => {
    if (item.chatId !== chatId || item.error) return true;
    const match = mine.find(
      (message) =>
        !used.has(message.id) &&
        !item.seenIds.includes(message.id) &&
        message.body.trim() === item.body,
    );
    if (!match) return true;
    used.add(match.id);
    known.add(match.id);
    changed = true;
    return false;
  });
  return changed ? next : items;
}

function mergeThread(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt));
}

function threadEntries(messages: ChatMessage[]) {
  const entries: Array<{ kind: "day"; key: string; label: string } | { kind: "message"; message: ChatMessage }> =
    [];
  let previous = "";
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (key !== previous) {
      entries.push({ kind: "day", key, label: formatDay(message.createdAt) });
      previous = key;
    }
    entries.push({ kind: "message", message });
  }
  return entries;
}

function syncDayBadge(
  thread: HTMLDivElement,
  badge: HTMLParagraphElement | null,
  setDayLabel: (value: string) => void,
) {
  const pins = [...thread.querySelectorAll<HTMLElement>("[data-day]")];
  if (!badge || pins.length === 0) {
    setDayLabel("oggi");
    return;
  }
  const line = badge.getBoundingClientRect().bottom;
  let active = pins[0].dataset.day ?? "oggi";
  for (const pin of pins) {
    const box = pin.getBoundingClientRect();
    if (box.top <= line) {
      active = pin.dataset.day ?? active;
      const covered = line - box.top;
      pin.style.opacity = String(1 - Math.min(1, Math.max(0, covered / Math.max(box.height, 1))));
    } else {
      pin.style.opacity = "1";
    }
  }
  setDayLabel(active);
}

function formatDay(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const stamp = (value: Date) =>
    value.getFullYear() * 10000 + (value.getMonth() + 1) * 100 + value.getDate();
  if (stamp(date) === stamp(today)) return "oggi";
  if (stamp(date) === stamp(yesterday)) return "ieri";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function formatClock(iso: string) {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatActivity(iso: string) {
  const day = formatDay(iso);
  if (day === "oggi") return formatClock(iso);
  if (day === "ieri") return "ieri";
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(iso));
}

function listItem(chat: CreatedChat): ChatListItem {
  return {
    id: chat.id,
    title: chat.title,
    color: chat.color,
    emoji: chat.emoji,
    preview: chat.preview,
    activityAt: chat.activityAt,
    bot: chat.bot,
  };
}

function chatLabel(title: string | null) {
  return title?.trim() || "Chat senza titolo";
}

const navKey = "clinic-nav";

function chatName(chat: ChatListItem) {
  return chat.bot?.name ?? chatLabel(chat.title);
}

function fitField(field: HTMLTextAreaElement) {
  field.style.height = "0px";
  field.style.height = `${field.scrollHeight}px`;
}

function draftKey(clinicId: string, chatId: string) {
  return `composer:${clinicId}:${chatId}`;
}

/** Telefono e tablet no: il focus aprirebbe la tastiera. Un portatile touch con trackpad sì. */
function desktopTyping() {
  return (
    window.matchMedia("(any-hover: hover)").matches &&
    window.matchMedia("(any-pointer: fine)").matches
  );
}

function scheduleDesktopCaret(fieldRef: { current: HTMLTextAreaElement | null }) {
  let first = 0;
  let second = 0;
  const run = () => {
    const field = fieldRef.current;
    if (!field || field.disabled || !desktopTyping()) return;
    if (document.querySelector("[role='dialog']")) return;
    const active = document.activeElement;
    const submit = field.form?.querySelector("button[type='submit']");
    const idle =
      !active ||
      active === document.body ||
      active === document.documentElement ||
      active === field ||
      active === submit;
    if (!idle) return;
    if (active !== field && document.getSelection()?.toString()) return;
    field.focus({ preventScroll: true });
  };
  run();
  first = window.requestAnimationFrame(() => {
    run();
    second = window.requestAnimationFrame(run);
  });
  return () => {
    window.cancelAnimationFrame(first);
    window.cancelAnimationFrame(second);
  };
}

function readDraft(clinicId: string, chatId: string) {
  try {
    return sessionStorage.getItem(draftKey(clinicId, chatId)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(clinicId: string, chatId: string, value: string) {
  try {
    const key = draftKey(clinicId, chatId);
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    return;
  }
}

function MessageComposer({
  clinicId,
  chatId,
  replyTo,
  onClearReply,
  onWaiting,
  caretEpoch,
  onOutgoing,
  onOutgoingError,
}: {
  clinicId: string;
  chatId: string;
  replyTo: ReplyDraft | null;
  onClearReply: () => void;
  onWaiting?: (waiting: boolean) => void;
  caretEpoch: number;
  onOutgoing?: (input: { id: string; chatId: string; body: string; replyTo: ReplyDraft | null }) => void;
  onOutgoingError?: (id: string, error: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const onWaitingRef = useRef(onWaiting);
  const onClearReplyRef = useRef(onClearReply);
  const sentRef = useRef<number | undefined>(undefined);
  const sentSnapshot = useRef<string | null>(null);
  const outgoingId = useRef<string | null>(null);
  const reportedFail = useRef<number | undefined>(undefined);
  const onOutgoingRef = useRef(onOutgoing);
  const onOutgoingErrorRef = useRef(onOutgoingError);
  onWaitingRef.current = onWaiting;
  onClearReplyRef.current = onClearReply;
  onOutgoingRef.current = onOutgoing;
  onOutgoingErrorRef.current = onOutgoingError;
  const [ready, setReady] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [state, action, pending] = useActionState<FormState & { failed?: number }, FormData>(
    async (previous, formData) => {
      const result = await sendMessage(clinicId, chatId, previous, formData);
      return result.error ? { ...result, failed: Date.now() } : result;
    },
    {},
  );

  useEffect(() => {
    const query = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (state.sent) {
      const snapshot = sentSnapshot.current;
      sentSnapshot.current = null;
      if (snapshot == null || field.value === snapshot) {
        writeDraft(clinicId, chatId, "");
        formRef.current?.reset();
      }
    } else {
      const saved = readDraft(clinicId, chatId);
      if (saved) field.value = saved;
    }
    setReady(field.value.trim().length > 0);
    fitField(field);
  }, [state.sent, clinicId, chatId]);

  useEffect(() => {
    if (!state.sent) return;
    if (sentRef.current !== state.sent) {
      sentRef.current = state.sent;
      onClearReplyRef.current();
    }
    return scheduleDesktopCaret(fieldRef);
  }, [state.sent]);

  useEffect(() => {
    if (!caretEpoch) return;
    return scheduleDesktopCaret(fieldRef);
  }, [caretEpoch]);

  useEffect(() => {
    if (!state.failed || state.failed === reportedFail.current || !state.error) return;
    reportedFail.current = state.failed;
    const id = outgoingId.current;
    if (!id) return;
    onOutgoingErrorRef.current?.(id, state.error);
  }, [state.failed, state.error]);

  useEffect(() => {
    if (replyTo) fieldRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (pending) onWaitingRef.current?.(true);
    else if (state.error) onWaitingRef.current?.(false);
  }, [pending, state.error]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => {
        const field = fieldRef.current;
        const snapshot = field?.value ?? "";
        const body = snapshot.trim();
        if (!body) return;
        sentSnapshot.current = snapshot;
        onWaitingRef.current?.(true);
        const id = `pending-${crypto.randomUUID()}`;
        outgoingId.current = id;
        flushSync(() => {
          onOutgoingRef.current?.({ id, chatId, body, replyTo });
        });
        queueMicrotask(() => {
          const current = fieldRef.current;
          if (!current || current.value !== snapshot) return;
          current.value = "";
          writeDraft(clinicId, chatId, "");
          setReady(false);
          fitField(current);
        });
      }}
      className="flex flex-col gap-2 px-4 pb-3"
    >
      {state.error ? <p className="px-4 text-sm text-teal">{state.error}</p> : null}
      {replyTo ? (
        <div className="flex items-stretch gap-2 rounded-2xl border border-line bg-paper px-3 py-2">
          <span className="w-0.5 shrink-0 rounded-full bg-ink" />
          <span className="min-w-0 flex-1">
            {replyTo.label ? <span className="block text-xs">{replyTo.label}</span> : null}
            <span className="block truncate text-xs text-muted">{replyTo.excerpt}</span>
          </span>
          <button
            type="button"
            aria-label="Annulla la risposta"
            onClick={onClearReply}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <input type="hidden" name="replyTo" value={replyTo.id} />
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={fieldRef}
          name="body"
          required
          rows={1}
          maxLength={4000}
          placeholder="Scrivi qui..."
          aria-label="Messaggio"
          disabled={pending && !desktop}
          onInput={(event) => {
            const field = event.currentTarget;
            writeDraft(clinicId, chatId, field.value);
            setReady(field.value.trim().length > 0);
            fitField(field);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!pending && event.currentTarget.value.trim()) formRef.current?.requestSubmit();
          }}
          className="composer-field max-h-40 min-h-12 min-w-0 flex-1 resize-none overflow-x-hidden overflow-y-auto rounded-3xl border border-line bg-paper px-4 py-3 text-sm leading-5 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !ready}
          aria-label="Invia"
          onMouseDown={(event) => {
            if (event.button !== 0 || !desktop) return;
            event.preventDefault();
          }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
        >
          <Send className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}

function BotLead({ bot, animate = false }: { bot: BotMark; animate?: boolean }) {
  return (
    <BotGlyph
      color={bot.color}
      emoji={bot.emoji}
      animate={animate}
      plain
      className="mr-1.5 h-5 w-5 align-[-0.2em]"
    />
  );
}

const messageIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function PreferStar({
  clinicId,
  chatId,
  messageId,
  preferredAt,
}: {
  clinicId: string;
  chatId: string;
  messageId: string;
  preferredAt: string | null;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const on = override ?? preferredAt !== null;

  useEffect(() => {
    setOverride(null);
  }, [preferredAt]);

  if (!messageIdPattern.test(messageId)) return null;

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Togli dai preferiti" : "Segna come preferito"}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOverride(next);
        startTransition(async () => {
          const result = await preferMessage(clinicId, chatId, messageId, next);
          if (result.error) setOverride(null);
        });
      }}
      className={`flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-40 ${
        on ? "text-yellow-500" : "text-muted"
      }`}
    >
      <Star className={`h-3.5 w-3.5 ${on ? "fill-current" : "fill-none"}`} strokeWidth={2} />
    </button>
  );
}

function MessageVotes({
  clinicId,
  chatId,
  messageId,
  vote,
}: {
  clinicId: string;
  chatId: string;
  messageId: string;
  vote: "up" | "down" | null;
}) {
  const [override, setOverride] = useState<"up" | "down" | "none" | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = override === null ? vote : override === "none" ? null : override;

  useEffect(() => {
    setOverride(null);
  }, [vote]);

  if (!messageIdPattern.test(messageId)) return null;

  function choose(next: "up" | "down") {
    const resolved = shown === next ? "none" : next;
    setOverride(resolved);
    startTransition(async () => {
      const result = await reactToMessage(clinicId, chatId, messageId, resolved);
      if (result.error) setOverride(null);
    });
  }

  return (
    <>
      <button
        type="button"
        aria-pressed={shown === "up"}
        aria-label={shown === "up" ? "Togli il pollice in su" : "Pollice in su"}
        disabled={pending}
        onClick={() => choose("up")}
        className={`flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-40 ${
          shown === "up" ? "text-green-600" : "text-muted"
        }`}
      >
        <ThumbsUp className={`h-3.5 w-3.5 ${shown === "up" ? "fill-current" : "fill-none"}`} strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-pressed={shown === "down"}
        aria-label={shown === "down" ? "Togli il pollice in giù" : "Pollice in giù"}
        disabled={pending}
        onClick={() => choose("down")}
        className={`flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-40 ${
          shown === "down" ? "text-red-600" : "text-muted"
        }`}
      >
        <ThumbsDown className={`h-3.5 w-3.5 ${shown === "down" ? "fill-current" : "fill-none"}`} strokeWidth={2} />
      </button>
    </>
  );
}

function speakerName(message: { mine: boolean; botId: string | null }, bot: BotMark | null) {
  if (message.mine) return "Tu";
  if (bot && message.botId === bot.id) return bot.name;
  return "Messaggio";
}

function ReplyQuote({
  reply,
  mine,
  bot,
}: {
  reply: ChatReply;
  mine: boolean;
  bot: BotMark | null;
}) {
  return (
    <button
      type="button"
      onClick={() => focusMessage(reply.id)}
      className={`mb-2 block w-full rounded-xl px-2 py-1 text-left ${mine ? "bg-white/10" : "bg-background"}`}
    >
      {bot && !reply.mine ? null : (
        <span className="block text-xs font-medium">{speakerName(reply, bot)}</span>
      )}
      <span className={`line-clamp-2 text-xs ${mine ? "text-paper/80" : "text-muted"}`}>{reply.excerpt}</span>
    </button>
  );
}

function focusMessage(id: string) {
  const node = document.getElementById(`message-${id}`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.remove("message-flash");
  void node.offsetWidth;
  node.classList.add("message-flash");
}

function shownEmojiGroups(emojis: ChatEmojiMark[], mineEmoji: string | null) {
  const shown = mineEmoji
    ? [...emojis.filter((item) => !item.mine), { emoji: mineEmoji, mine: true, botId: null }]
    : emojis.filter((item) => !item.mine);
  const groups = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const item of shown) {
    const group = groups.get(item.emoji) ?? { emoji: item.emoji, count: 0, mine: false };
    group.count += 1;
    if (item.mine) group.mine = true;
    groups.set(item.emoji, group);
  }
  return [...groups.values()];
}

function ChatTurn({
  clinicId,
  chatId,
  message,
  bot,
  entered,
  error,
  onReply,
}: {
  clinicId: string;
  chatId: string;
  message: ChatMessage;
  bot: BotMark | null;
  entered: boolean;
  error?: string | null;
  onReply: (reply: ReplyDraft) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; down: boolean } | null>(null);
  const [override, setOverride] = useState<string | "none" | null>(null);
  const [pending, startTransition] = useTransition();
  const savedMine = message.emojis.find((item) => item.mine)?.emoji ?? null;
  const mineEmoji = override === null ? savedMine : override === "none" ? null : override;
  const emojiKey = message.emojis.map((item) => `${item.emoji}:${item.mine ? 1 : 0}:${item.botId ?? ""}`).join("|");
  const groups = shownEmojiGroups(message.emojis, mineEmoji);
  const canGesture = messageIdPattern.test(message.id);

  useEffect(() => {
    setOverride(null);
  }, [emojiKey]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-emoji-picker]")) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function choose(next: string | null) {
    if (!canGesture) return;
    const resolved = mineEmoji === next ? null : next;
    setOverride(resolved ?? "none");
    setOpen(false);
    startTransition(async () => {
      const result = await setMessageEmoji(clinicId, chatId, message.id, resolved);
      if (result.error) setOverride(null);
    });
  }

  function openPicker() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 288;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const down = rect.top < 240;
    setBox({ top: down ? rect.bottom + 8 : rect.top - 8, left, down });
    setOpen(true);
  }

  const picker =
    open && box
      ? createPortal(
          <div
            data-emoji-picker
            className="fixed z-50 w-72 rounded-2xl border border-line bg-paper p-2 shadow-sm"
            style={{
              top: box.top,
              left: box.left,
              transform: box.down ? undefined : "translateY(-100%)",
            }}
          >
            <div className="grid grid-cols-8 gap-0.5">
              {chatEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={pending}
                  aria-pressed={mineEmoji === emoji}
                  aria-label={`Reagisci con ${emoji}`}
                  onClick={() => choose(emoji)}
                  className={`flex aspect-square items-center justify-center rounded-lg text-xl disabled:opacity-40 ${
                    mineEmoji === emoji ? "bg-background" : "hover:bg-background"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  const gestures = canGesture ? (
    <div className={`flex items-center ${message.mine ? "flex-row-reverse" : ""}`}>
      <button
        type="button"
        aria-label="Rispondi a questo messaggio"
        onClick={() =>
          onReply({
            id: message.id,
            label: bot && !message.mine ? "" : speakerName(message, bot),
            excerpt: markdownToPlainText(message.body).slice(0, 180),
          })
        }
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted"
      >
        <Reply className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Reagisci con un'emoji"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={pending}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted disabled:opacity-40"
      >
        <SmilePlus className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  ) : null;

  return (
    <div
      id={`message-${message.id}`}
      className={`flex w-fit max-w-[min(36rem,100%)] min-w-0 flex-col gap-1 ${
        message.mine ? "items-end self-end" : "items-start self-start"
      } ${entered ? (message.mine ? "msg-enter-mine" : "msg-enter-theirs") : ""}`}
    >
      <div className="flex min-w-0 items-center">
        {message.mine ? gestures : null}
        <div
          className={`max-w-full min-w-0 wrap-anywhere rounded-2xl px-4 py-3 text-sm leading-6 ${
            message.mine ? "bg-ink text-paper" : "bg-paper"
          }`}
        >
          {message.replyTo ? <ReplyQuote reply={message.replyTo} mine={message.mine} bot={bot} /> : null}
          <Markdown
            source={message.body}
            lead={bot && message.botId === bot.id ? <BotLead bot={bot} /> : undefined}
          />
        </div>
        {message.mine ? null : gestures}
      </div>
      {groups.length > 0 ? (
        <div className={`-mt-1 flex flex-wrap gap-1 px-2 ${message.mine ? "justify-end" : "justify-start"}`}>
          {groups.map((group) => (
            <button
              key={group.emoji}
              type="button"
              disabled={!canGesture || pending}
              onClick={() => choose(group.emoji)}
              aria-label={
                group.mine ? `Togli la reazione ${group.emoji}` : `Reagisci con ${group.emoji}`
              }
              className={`rounded-full border bg-paper px-1.5 py-0.5 text-sm leading-none disabled:opacity-40 ${
                group.mine ? "border-ink" : "border-line"
              }`}
            >
              {group.emoji}
              {group.count > 1 ? ` ${group.count}` : ""}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-0.5 px-1">
        <time dateTime={message.createdAt} className="text-xs text-muted">
          {formatClock(message.createdAt)}
        </time>
        <PreferStar
          clinicId={clinicId}
          chatId={chatId}
          messageId={message.id}
          preferredAt={message.preferredAt}
        />
        <MessageVotes clinicId={clinicId} chatId={chatId} messageId={message.id} vote={message.reaction} />
      </div>
      {error ? <p className="px-1 text-xs text-teal">{error}</p> : null}
      {picker}
    </div>
  );
}

export function ClinicShell({
  clinicId,
  clinicName,
  clinics,
  email,
  chats,
  activeChatId,
  messages,
  hasOlder,
  olderCursor: olderCursorProp,
  hasEvents,
  agendaOpen,
  lanes,
  appointments = [],
  blocks = [],
  agendaPatients = [],
  patientsOpen,
  patients,
  selectedPatient,
  canWritePatients,
  settingsOpen,
  settingsMembers,
  settingsRoles,
  specialists,
  assets,
  integrations,
  canRenameClinic,
  canDeleteClinic,
  canManageMembers,
  canManageRoles,
  canManageAgenda,
  canManageIntegrations,
  webhookVerifyToken,
  currentUserId,
  recency: initialRecency,
  confirmations,
}: {
  clinicId: string;
  clinicName: string;
  clinics: ClinicOption[];
  email: string;
  chats: ChatListItem[];
  activeChatId: string | null;
  messages: ChatMessage[];
  hasOlder: boolean;
  olderCursor: number | null;
  hasEvents: boolean;
  agendaOpen: boolean;
  lanes: AgendaLane[];
  appointments?: AgendaAppointment[];
  blocks?: AgendaBlock[];
  agendaPatients?: AgendaEditPatient[];
  patientsOpen: boolean;
  patients: PatientRecord[];
  selectedPatient: PatientRecord | null;
  canWritePatients: boolean;
  settingsOpen: boolean;
  settingsMembers: ClinicMember[];
  settingsRoles: ClinicRole[];
  specialists: Specialist[];
  assets: ClinicAsset[];
  integrations: ClinicIntegration[];
  canRenameClinic: boolean;
  canDeleteClinic: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageAgenda: boolean;
  canManageIntegrations: boolean;
  webhookVerifyToken: string;
  currentUserId: string;
  recency: ClinicRecency;
  confirmations: BotActionRequest[];
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clinicsOpen, setClinicsOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelDraft, setChannelDraft] = useState<ChatDraft | null>(null);
  const [botOpen, setBotOpen] = useState(false);
  const [botDraft, setBotDraft] = useState<BotDraft | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [thread, setThread] = useState(messages);
  const [threadChat, setThreadChat] = useState(activeChatId);
  const [threadStamp, setThreadStamp] = useState(() => messageStamp(messages));
  const [canLoadOlder, setCanLoadOlder] = useState(hasOlder);
  const [olderCursor, setOlderCursor] = useState(olderCursorProp);
  const [historyChat, setHistoryChat] = useState(activeChatId);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const viewedChat = useRef(activeChatId);
  const loadToken = useRef(0);
  viewedChat.current = activeChatId;
  const stamp = messageStamp(messages);
  if (threadChat !== activeChatId || historyChat !== activeChatId) {
    loadToken.current += 1;
    setThreadChat(activeChatId);
    setHistoryChat(activeChatId);
    setThread(messages);
    setThreadStamp(stamp);
    setCanLoadOlder(hasOlder);
    setOlderCursor(olderCursorProp);
    setLoadingOlder(false);
    setOlderError(null);
  } else if (threadStamp !== stamp) {
    setThreadStamp(stamp);
    setThread(mergeThread(thread, messages));
  }
  const historyReady = threadChat === activeChatId && historyChat === activeChatId;
  const history = !historyReady ? messages : threadStamp === stamp ? thread : mergeThread(thread, messages);
  const [recency, setRecency] = useState(initialRecency);
  const recencyToken = `${clinicId}\n${initialRecency.agendaAt ?? ""}\n${initialRecency.patientsAt ?? ""}\n${initialRecency.settingsAt ?? ""}`;
  const [recencyTokenSeen, setRecencyTokenSeen] = useState(recencyToken);
  if (recencyTokenSeen !== recencyToken) {
    setRecencyTokenSeen(recencyToken);
    setRecency(initialRecency);
  }
  const shownRecency = recencyTokenSeen === recencyToken ? recency : initialRecency;
  const createButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const start = () => warmBotFaces();
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 400);
    return () => window.clearTimeout(id);
  }, []);

  const router = useRouter();
  const initial = (email.trim()[0] || "?").toUpperCase();
  const listRef = useRef<HTMLUListElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const knownMessages = useRef<{ chatId: string | null; ids: Set<string> }>({
    chatId: null,
    ids: new Set(),
  });
  const waitBaseline = useRef<string | null>(null);
  const replyCaret = useRef(0);
  const shownMessagesRef = useRef<ChatMessage[]>([]);
  const [draftChatId, setDraftChatId] = useState(activeChatId);
  const [waiting, setWaiting] = useState(false);
  const [live, setLive] = useState<LiveReply | null>(null);
  const [entered, setEntered] = useState<Set<string>>(new Set());
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const badgeRef = useRef<HTMLParagraphElement>(null);
  const [dayChat, setDayChat] = useState(activeChatId);
  const [dayLabel, setDayLabel] = useState(() =>
    messages.at(-1) ? formatDay(messages.at(-1)!.createdAt) : "oggi",
  );
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  const [replyChatId, setReplyChatId] = useState(activeChatId);
  if (replyChatId !== activeChatId) {
    setReplyChatId(activeChatId);
    setReplyTo(null);
  }
  const [focusBox, setFocusBox] = useState<{ top: number; height: number } | null>(null);
  const [slide, setSlide] = useState(false);
  const [added, setAdded] = useState<ChatListItem[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [opened, setOpened] = useState<{
    id: string;
    messages: ChatMessage[];
    hasEvents: boolean;
    from: string | null;
  } | null>(null);
  let openThread = opened;
  if (openThread && activeChatId !== openThread.from) {
    openThread = null;
    setOpened(null);
  }
  const serverIds = new Set(chats.map((chat) => chat.id));
  const hidden = new Set(removed.filter((id) => serverIds.has(id)));
  const visibleChats = [
    ...added.filter((chat) => !serverIds.has(chat.id) && !removed.includes(chat.id)),
    ...chats.filter((chat) => !hidden.has(chat.id)),
  ].sort((a, b) => b.activityAt.localeCompare(a.activityAt));
  const viewingChat = Boolean(openThread);
  const showAgenda = agendaOpen && !viewingChat;
  const showPatients = patientsOpen && !viewingChat;
  const showSettings = settingsOpen && !viewingChat;
  const shownActiveId = openThread?.id ?? activeChatId;
  const shownMessages = openThread?.messages ?? history;
  const shownCanLoadOlder = openThread ? false : historyReady ? canLoadOlder : hasOlder;
  const shownCursor = openThread ? null : historyReady ? olderCursor : olderCursorProp;
  const shownOlderError = historyReady && !openThread ? olderError : null;
  const shownLoadingOlder = historyReady && !openThread && loadingOlder;
  const shownHasEvents = openThread?.hasEvents ?? hasEvents;
  const lastBotMessage = [...shownMessages].reverse().find((message) => message.botId) ?? null;
  shownMessagesRef.current = shownMessages;
  const nextOutgoing = reconcileOutgoing(
    outgoing,
    shownActiveId,
    shownMessages,
    knownMessages.current.ids,
  );
  if (nextOutgoing !== outgoing) setOutgoing(nextOutgoing);
  const pendingOutgoing = nextOutgoing.filter((item) => item.chatId === shownActiveId);
  const visibleMessages = pendingOutgoing.length
    ? [...shownMessages, ...pendingOutgoing.map(outgoingMessage)]
    : shownMessages;
  const outgoingErrors = new Map(
    pendingOutgoing.flatMap((item) => (item.error ? [[item.id, item.error] as const] : [])),
  );
  const replyLanded =
    draftChatId === shownActiveId &&
    waitBaseline.current !== null &&
    lastBotMessage !== null &&
    lastBotMessage.id !== waitBaseline.current;
  const draftSaved =
    draftChatId === shownActiveId && live !== null && liveDraftSettled(live, shownMessages);
  if (draftChatId !== shownActiveId) {
    setDraftChatId(shownActiveId);
    setWaiting(false);
    setLive(null);
    waitBaseline.current = null;
    stickToBottom.current = true;
  } else if (replyLanded || draftSaved) {
    replyCaret.current += 1;
    waitBaseline.current = null;
    if (waiting) setWaiting(false);
    if (live) setLive(null);
  }
  const replySettled = replyLanded || draftSaved;
  const visibleLive = draftChatId === shownActiveId && !replySettled ? live : null;
  const visibleWaiting = draftChatId === shownActiveId && waiting && !replySettled;
  const active = visibleChats.find((chat) => chat.id === shownActiveId) ?? null;
  const streamBody =
    visibleLive?.phase === "writing" && visibleLive.body.trim() ? visibleLive.body : "";
  const streamMarker = streamBody ? takeReplyMarker(streamBody) : null;
  const savedReplyTarget = streamMarker
    ? (shownMessages.find((message) => message.id === streamMarker.id) ?? null)
    : null;
  const waitingReply = pendingOutgoing.filter((item) => !item.error);
  const streamTarget =
    savedReplyTarget ??
    (streamMarker && !savedReplyTarget && waitingReply.length === 1
      ? outgoingMessage(waitingReply[0])
      : null);
  const streamText = streamMarker ? streamMarker.body : streamBody;
  const showThinking =
    Boolean(active?.bot) && !streamBody && (visibleWaiting || visibleLive?.phase === "thinking");
  const rows = placeByRecency(visibleChats, [
    { id: agendaListId, at: shownRecency.agendaAt },
    { id: patientsListId, at: shownRecency.patientsAt },
    { id: settingsListId, at: shownRecency.settingsAt },
  ]);
  const visibleKey = rows
    .map((row) => (row.kind === "chat" ? row.chat.id : row.id))
    .join(" ");
  const showPanel = showAgenda || showPatients || showSettings || Boolean(active);
  const selectedListId = openThread
    ? openThread.id
    : showSettings
      ? settingsListId
      : showPatients
        ? patientsListId
        : showAgenda
          ? agendaListId
          : active?.id ?? null;
  const openedDay = shownMessages.at(-1) ? formatDay(shownMessages.at(-1)!.createdAt) : "oggi";
  if (dayChat !== shownActiveId) {
    setDayChat(shownActiveId);
    setDayLabel(openedDay);
  }
  const railClosed = navCollapsed && showPanel;
  const refreshPage = useRef(router.refresh);
  refreshPage.current = router.refresh;
  const quietChatIds = useRef(new Set<string>());
  const creatingBot = useRef(false);
  creatingBot.current = botOpen && botDraft === null;
  const confirmationToken = confirmations.map((item) => `${item.id}:${item.action}`).join("|");
  const [pendingConfirmations, setPendingConfirmations] = useState(confirmations);
  const [seenConfirmationToken, setSeenConfirmationToken] = useState(confirmationToken);
  if (seenConfirmationToken !== confirmationToken) {
    setSeenConfirmationToken(confirmationToken);
    setPendingConfirmations(confirmations);
  }
  const pendingConfirmation = pendingConfirmations[0] ?? null;

  const activeId = active?.id ?? null;

  useEffect(() => {
    if (opened || !activeId || agendaOpen || patientsOpen || settingsOpen) return;

    const supabase = createClient();
    let timer = 0;
    let listTimer = 0;
    let stopped = false;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshPage.current(), 50);
    };
    const channel = supabase.channel(`clinic:${clinicId}:${activeId}`);
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_events",
        filter: `chat_id=eq.${activeId}`,
      },
      refresh,
    );
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "chat_events",
        filter: `chat_id=eq.${activeId}`,
      },
      refresh,
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "message_emojis",
        filter: `chat_id=eq.${activeId}`,
      },
      refresh,
    );
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_clinics",
        filter: `clinic_id=eq.${clinicId}`,
      },
      (payload) => {
        const chatId = payload.new.chat_id;
        window.clearTimeout(listTimer);
        listTimer = window.setTimeout(() => {
          if (creatingBot.current) return;
          if (typeof chatId === "string" && quietChatIds.current.has(chatId)) return;
          refreshPage.current();
        }, 50);
      },
    );
    void supabase.auth.getSession().then(({ data }) => {
      if (stopped) return;
      const token = data.session?.access_token;
      const ready = token ? supabase.realtime.setAuth(token) : Promise.resolve();
      void ready.then(() => {
        if (!stopped) channel.subscribe();
      });
    });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(listTimer);
      void supabase.removeChannel(channel);
    };
  }, [opened, activeId, agendaOpen, patientsOpen, settingsOpen, clinicId]);

  useEffect(() => {
    const botId = active?.bot?.id;
    if (opened || !activeId || !botId || agendaOpen || patientsOpen || settingsOpen) return;

    const supabase = createClient();
    let stopped = false;
    const channel = supabase.channel(`draft:${clinicId}:${activeId}`);

    const apply = (row: { bot_id?: string; phase?: string; body?: string; updated_at?: string } | null, removed: boolean) => {
      if (removed) {
        setLive((current) => {
          if (!current || current.phase !== "writing" || !current.body.trim()) return null;
          if (liveDraftSettled(current, shownMessagesRef.current)) return null;
          return current;
        });
        return;
      }
      if (!row || row.bot_id !== botId) return;
      const updatedAt = typeof row.updated_at === "string" ? row.updated_at : "";
      setLive((current) => {
        if (updatedAt && current?.updatedAt && updatedAt < current.updatedAt) return current;
        const phase: LiveReply["phase"] =
          row.phase === "writing" ? "writing" : "thinking";
        const body = phase === "writing" && typeof row.body === "string" ? row.body : "";
        const next: LiveReply = { botId, phase, body, updatedAt };
        if (liveDraftSettled(next, shownMessagesRef.current)) return null;
        return next;
      });
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_drafts",
        filter: `chat_id=eq.${activeId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") apply(null, true);
        else apply(payload.new, false);
      },
    );

    void supabase.auth.getSession().then(({ data }) => {
      if (stopped) return;
      const token = data.session?.access_token;
      const ready = token ? supabase.realtime.setAuth(token) : Promise.resolve();
      void ready.then(() => {
        if (stopped) return;
        channel.subscribe((status) => {
          if (status !== "SUBSCRIBED" || stopped) return;
          void supabase
            .from("chat_drafts")
            .select("bot_id, phase, body, updated_at")
            .eq("chat_id", activeId)
            .eq("bot_id", botId)
            .maybeSingle()
            .then(({ data: existing }) => {
              if (!stopped && existing) apply(existing, false);
            });
        });
      });
    });

    return () => {
      stopped = true;
      void supabase.removeChannel(channel);
    };
  }, [opened, activeId, agendaOpen, patientsOpen, settingsOpen, clinicId, active?.bot?.id]);

  useEffect(() => {
    const supabase = createClient();
    let timer = 0;
    let stopped = false;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshPage.current(), 50);
    };
    const channel = supabase.channel(`clinic-confirmations:${clinicId}`);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bot_confirmations",
        filter: `clinic_id=eq.${clinicId}`,
      },
      refresh,
    );
    void supabase.auth.getSession().then(({ data }) => {
      if (stopped) return;
      const token = data.session?.access_token;
      const ready = token ? supabase.realtime.setAuth(token) : Promise.resolve();
      void ready.then(() => {
        if (!stopped) channel.subscribe();
      });
    });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [clinicId]);

  function onChatCreated(chat: CreatedChat) {
    const item = listItem(chat);
    setAdded((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
    setRemoved((current) => current.filter((id) => id !== item.id));
    setOpened({
      id: chat.id,
      messages: chat.messages,
      hasEvents: chat.messages.length > 0,
      from: activeChatId,
    });
    setChannelOpen(false);
    setChannelDraft(null);
    setBotOpen(false);
    setBotDraft(null);
    setListOpen(false);
    router.replace(`/clinics/${clinicId}?chat=${chat.id}`, { scroll: false });
  }

  function onBotCreated(chat: CreatedChat) {
    const item = listItem(chat);
    quietChatIds.current.add(item.id);
    setAdded((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
    setRemoved((current) => current.filter((id) => id !== item.id));
    setBotOpen(false);
    setBotDraft(null);
  }

  function onChatRemoved(chatId: string) {
    setAdded((current) => current.filter((entry) => entry.id !== chatId));
    setRemoved((current) => (current.includes(chatId) ? current : [...current, chatId]));
    if (opened?.id === chatId) setOpened(null);
  }

  useLayoutEffect(() => {
    if (localStorage.getItem(navKey) === "collapsed") setNavCollapsed(true);
  }, []);

  useEffect(() => {
    rememberLastClinic(currentUserId, clinicId);
  }, [currentUserId, clinicId]);

  function toggleNav() {
    setNavCollapsed((collapsed) => {
      const next = !collapsed;
      localStorage.setItem(navKey, next ? "collapsed" : "open");
      return next;
    });
    setMenuOpen(false);
    setClinicsOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (!agendaOpen && !patientsOpen && !settingsOpen) return;
    const timer = window.setTimeout(() => {
      setRecency(
        settingsOpen
          ? rememberSettings(clinicId)
          : patientsOpen
            ? rememberPatients(clinicId)
            : rememberAgenda(clinicId),
      );
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [agendaOpen, patientsOpen, settingsOpen, clinicId]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const item = selectedListId
        ? list.querySelector<HTMLElement>(`[data-chat="${selectedListId}"]`)
        : null;
      if (!item) {
        setFocusBox(null);
        return;
      }
      const top = item.offsetTop;
      const height = item.offsetHeight;
      setFocusBox((current) =>
        current && current.top === top && current.height === height ? current : { top, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [selectedListId, visibleKey]);

  useEffect(() => {
    if (!focusBox) return;
    const frame = requestAnimationFrame(() => setSlide(true));
    return () => cancelAnimationFrame(frame);
  }, [focusBox]);

  useLayoutEffect(() => {
    const known = knownMessages.current;
    if (known.chatId !== shownActiveId) {
      known.chatId = shownActiveId;
      known.ids = new Set(shownMessages.map((message) => message.id));
      setEntered((current) => (current.size === 0 ? current : new Set()));
      return;
    }
    const arrived = visibleMessages.flatMap((message) => {
      if (known.ids.has(message.id)) return [];
      known.ids.add(message.id);
      return message.id;
    });
    if (arrived.length > 0) setEntered(new Set(arrived));
  }, [shownActiveId, visibleMessages]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    if (stickToBottom.current) thread.scrollTop = thread.scrollHeight;
    syncDayBadge(thread, badgeRef.current, setDayLabel);
  }, [shownActiveId, visibleMessages, showThinking, streamBody]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const sync = () => {
      syncDayBadge(thread, badgeRef.current, setDayLabel);
      const distance = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
      stickToBottom.current = distance < 120;
    };
    thread.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(thread);
    return () => {
      thread.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [shownActiveId, shownMessages]);

  function pinToMessage(scroller: HTMLDivElement) {
    const edge = scroller.getBoundingClientRect().top;
    for (const node of scroller.querySelectorAll<HTMLElement>("[id^='message-']")) {
      const box = node.getBoundingClientRect();
      if (box.bottom > edge + 1) return { id: node.id, offset: box.top - edge };
    }
    return null;
  }

  async function loadOlder() {
    const cursor = shownCursor;
    if (!active || shownLoadingOlder || !shownCanLoadOlder || cursor === null) return;
    const requested = active.id;
    const token = ++loadToken.current;
    const scroller = threadRef.current;
    const anchor = scroller ? pinToMessage(scroller) : null;
    setLoadingOlder(true);
    setOlderError(null);
    const result = await loadOlderChatMessages(clinicId, requested, cursor);
    if (loadToken.current !== token || viewedChat.current !== requested) return;
    if ("error" in result) {
      setLoadingOlder(false);
      setOlderError(result.error ?? "Non è stato possibile caricare i messaggi precedenti.");
      return;
    }
    const page = result;
    for (const message of page.messages) knownMessages.current.ids.add(message.id);
    const more = page.hasOlder && page.nextCursor !== null && page.nextCursor !== cursor;
    flushSync(() => {
      if (page.messages.length > 0) setThread((current) => mergeThread(current, page.messages));
      setCanLoadOlder(more);
      setOlderCursor(page.nextCursor);
      setLoadingOlder(false);
    });
    const nextScroller = threadRef.current;
    if (anchor && nextScroller) {
      const node = nextScroller.querySelector<HTMLElement>(`#${CSS.escape(anchor.id)}`);
      if (node) {
        const edge = nextScroller.getBoundingClientRect().top;
        nextScroller.scrollTop += node.getBoundingClientRect().top - edge - anchor.offset;
      }
      const distance = nextScroller.scrollHeight - nextScroller.scrollTop - nextScroller.clientHeight;
      stickToBottom.current = distance < 120;
    }
  }

  function beginOutgoing(input: { id: string; chatId: string; body: string; replyTo: ReplyDraft | null }) {
    const messages = shownMessagesRef.current;
    const target = input.replyTo ? messages.find((message) => message.id === input.replyTo?.id) : null;
    const item: Outgoing = {
      id: input.id,
      chatId: input.chatId,
      body: input.body,
      createdAt: new Date().toISOString(),
      replyTo: input.replyTo
        ? {
            id: input.replyTo.id,
            excerpt: input.replyTo.excerpt,
            mine: target?.mine ?? false,
            botId: target?.botId ?? null,
          }
        : null,
      error: null,
      seenIds: messages.map((message) => message.id),
    };
    setOutgoing((current) => [
      ...current.filter((entry) => !(entry.chatId === input.chatId && entry.error && entry.body === input.body)),
      item,
    ]);
  }

  function failOutgoing(id: string, error: string) {
    setOutgoing((current) => current.map((item) => (item.id === id ? { ...item, error } : item)));
  }

  function noteWaiting(next: boolean) {
    if (!next) {
      waitBaseline.current = null;
      setWaiting(false);
      setLive(null);
      return;
    }
    waitBaseline.current = lastBotMessage?.id ?? "";
    setWaiting(true);
  }

  return (
    <div className="fixed inset-0 flex bg-background text-ink">
      <aside
        className={`${showPanel && !listOpen ? "hidden md:flex" : "flex"} relative z-30 h-full min-w-0 shrink-0 flex-col bg-paper motion-reduce:transition-none md:border-r md:border-line md:transition-[width] md:duration-200 md:ease-out ${
          railClosed ? "w-full md:w-18" : "w-full md:w-80"
        }`}
      >
        <div
          className={`relative flex items-center gap-2 px-4 pt-4 pb-2 ${railClosed ? "md:justify-center md:px-2" : ""}`}
        >
          <div className={railClosed ? "contents md:hidden" : "contents"}>
          <ClinicSwitcher
            clinics={clinics}
            currentId={clinicId}
            name={clinicName}
            open={clinicsOpen}
            onOpenChange={(next) => {
              setClinicsOpen(next);
              if (next) {
                setMenuOpen(false);
                setSearchOpen(false);
              }
            }}
          />
          <div>
            <button
              ref={createButtonRef}
              type="button"
              aria-label="Crea"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                warmBotFaces();
                setMenuOpen((open) => !open);
                setSearchOpen(false);
                setClinicsOpen(false);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line"
            >
              <Plus className="h-5 w-5" strokeWidth={2} />
            </button>
            <CreateMenu
              open={menuOpen}
              anchorRef={createButtonRef}
              onClose={() => setMenuOpen(false)}
              onConversation={() => {
                setMenuOpen(false);
                setChannelDraft(null);
                setChannelOpen(true);
                setBotOpen(false);
              }}
              onBot={() => {
                setMenuOpen(false);
                setBotDraft(null);
                setBotOpen(true);
                setChannelOpen(false);
              }}
            />
          </div>
          <button
            type="button"
            aria-label="Cerca"
            aria-expanded={searchOpen}
            onClick={() => {
              flushSync(() => {
                setSearchOpen(true);
                setChannelOpen(false);
                setBotOpen(false);
                setMenuOpen(false);
                setClinicsOpen(false);
              });
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line"
          >
            <Search className="h-5 w-5" strokeWidth={2} />
          </button>
          </div>
          <button
            type="button"
            onClick={toggleNav}
            aria-expanded={!railClosed}
            aria-label={railClosed ? "Espandi il menu" : "Comprimi il menu"}
            className="hidden h-10 w-10 items-center justify-center text-muted hover:text-ink md:flex"
          >
            {railClosed ? (
              <PanelLeftOpen className="h-5 w-5" strokeWidth={2} />
            ) : (
              <PanelLeftClose className="h-5 w-5" strokeWidth={2} />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-x-hidden overflow-y-auto px-2">
          <ul ref={listRef} className="relative">
            {focusBox ? (
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-x-0 z-0 rounded-2xl bg-ink motion-reduce:transition-none ${
                  slide ? "transition-[top,height] duration-200 ease-out" : ""
                }`}
                style={{ top: focusBox.top, height: focusBox.height }}
              />
            ) : null}
            {rows.map((row) => {
              if (row.kind === "pin" && row.id === agendaListId) {
                return (
                  <AgendaListItem
                    key={agendaListId}
                    clinicId={clinicId}
                    compact={railClosed}
                    selected={selectedListId === agendaListId}
                    onSelect={() => setListOpen(false)}
                  />
                );
              }
              if (row.kind === "pin" && row.id === patientsListId) {
                return (
                  <PatientsListItem
                    key={patientsListId}
                    clinicId={clinicId}
                    compact={railClosed}
                    selected={selectedListId === patientsListId}
                    onSelect={() => setListOpen(false)}
                  />
                );
              }
              if (row.kind === "pin" && row.id === settingsListId) {
                return (
                  <SettingsListItem
                    key={settingsListId}
                    clinicId={clinicId}
                    compact={railClosed}
                    selected={selectedListId === settingsListId}
                    onSelect={() => setListOpen(false)}
                  />
                );
              }
              if (row.kind !== "chat") return null;
              const chat = row.chat;
                const selected = chat.id === active?.id;
                return (
                  <li key={chat.id} data-chat={chat.id} className="relative">
                    <Link
                      href={`/clinics/${clinicId}?chat=${chat.id}`}
                      aria-current={selected ? "page" : undefined}
                      title={chatName(chat)}
                      onClick={() => setListOpen(false)}
                      className={`relative z-10 flex items-stretch gap-3 rounded-2xl py-2 pr-3 pl-2 transition-colors duration-200 motion-reduce:transition-none ${
                        railClosed ? "md:justify-center md:px-2" : ""
                      } ${selected ? "text-paper" : "hover:bg-line"}`}
                    >
                      <span className="flex h-12 w-12 shrink-0 self-center">
                        {chat.bot ? (
                          <BotGlyph
                            color={chat.bot.color}
                            emoji={chat.bot.emoji}
                            animate={selected}
                            plain
                            className="h-full w-full"
                          />
                        ) : (
                          <ChannelMark
                            color={chat.color}
                            emoji={chat.emoji}
                            animate={selected}
                            plain
                            className="h-full w-full"
                          />
                        )}
                      </span>
                      <span
                        className={`flex min-w-0 flex-1 flex-col justify-center ${railClosed ? "md:sr-only" : ""}`}
                      >
                        <span className="truncate pr-7 font-medium">{chatName(chat)}</span>
                        <span className="mt-1 flex items-center justify-between gap-3">
                          <span className={`min-w-0 truncate text-sm ${selected ? "text-paper/70" : "text-muted"}`}>
                            {chat.preview || "Nessun messaggio"}
                          </span>
                          <span className={`shrink-0 text-xs ${selected ? "text-paper/70" : "text-muted"}`}>
                            {formatActivity(chat.activityAt)}
                          </span>
                        </span>
                      </span>
                    </Link>
                    <div className={`absolute top-3 right-3 z-20 ${railClosed ? "md:hidden" : ""}`}>
                      <ChatMenu
                        selected={selected}
                        clinicId={clinicId}
                        chatId={chat.id}
                        name={chatName(chat)}
                        onRemoved={onChatRemoved}
                        onEdit={() => {
                          setSearchOpen(false);
                          setMenuOpen(false);
                          if (chat.bot) {
                            setBotDraft({
                              botId: chat.bot.id,
                              chatId: chat.id,
                              name: chat.bot.name,
                              color: chat.bot.color,
                              emoji: chat.bot.emoji,
                            });
                            setBotOpen(true);
                            setChannelOpen(false);
                          } else {
                            setChannelDraft({
                              chatId: chat.id,
                              title: chat.title ?? "",
                              color: chat.color,
                              emoji: chat.emoji,
                            });
                            setChannelOpen(true);
                            setBotOpen(false);
                          }
                        }}
                      />
                    </div>
                  </li>
                );
            })}
          </ul>
          {visibleChats.length === 0 ? (
            <p className={`px-2 py-6 text-sm text-muted ${railClosed ? "md:hidden" : ""}`}>
              Nessuna chat o bot. <br /> Premi + per crearli.
            </p>
          ) : null}
        </div>

        <Link
          href="/profile"
          className={`flex items-center gap-3 px-4 py-3 ${railClosed ? "md:justify-center md:px-2" : ""}`}
          aria-label="Profilo"
          title={email}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal text-sm text-teal-ink">
            {initial}
          </span>
          <span className={`min-w-0 ${railClosed ? "md:sr-only" : ""}`}>
            <span className="block truncate text-xs text-muted">{email}</span>
          </span>
        </Link>
      </aside>

      {showPanel ? (
      <section className={`relative ${listOpen ? "hidden md:flex" : "flex"} h-full min-w-0 flex-1 flex-col`}>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="absolute top-2 left-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper shadow-sm md:hidden"
          aria-label="Torna alle chat"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        {showSettings ? (
          <SettingsView
            clinicId={clinicId}
            clinicName={clinicName}
            canRename={canRenameClinic}
            canDelete={canDeleteClinic}
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
            canManageAgenda={canManageAgenda}
            currentUserId={currentUserId}
            members={settingsMembers}
            roles={settingsRoles}
            specialists={specialists}
            assets={assets}
            integrations={integrations}
            canManageIntegrations={canManageIntegrations}
            webhookVerifyToken={webhookVerifyToken}
            onCreatedChat={onChatCreated}
          />
        ) : showPatients && selectedPatient ? (
          <PatientPage clinicId={clinicId} patient={selectedPatient} />
        ) : showPatients ? (
          <PatientsView clinicId={clinicId} patients={patients} canWrite={canWritePatients} />
        ) : showAgenda ? (
          <AgendaView
            clinicId={clinicId}
            lanes={lanes}
            appointments={appointments}
            blocks={blocks}
            patients={agendaPatients}
            canMove={canManageAgenda}
          />
        ) : active ? (
        <>
        <ChatTitle
          label={dayLabel}
          badgeRef={badgeRef}
          bot={active.bot}
          color={active.color}
          emoji={active.emoji}
        />

        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <div
          ref={threadRef}
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 pt-14 pb-6 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          <div className="mt-auto flex flex-col gap-3">
          {shownCanLoadOlder || shownOlderError ? (
            <div className="flex flex-col items-center gap-1 self-center">
              {shownCanLoadOlder ? (
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={shownLoadingOlder}
                  className="rounded-full px-3 py-1 text-sm text-muted hover:text-ink disabled:opacity-60"
                >
                  {shownLoadingOlder ? "Caricamento…" : "Messaggi precedenti"}
                </button>
              ) : null}
              {shownOlderError ? <p className="text-center text-sm text-teal">{shownOlderError}</p> : null}
            </div>
          ) : null}
          {visibleMessages.length > 0 ? (
            threadEntries(visibleMessages).map((entry) =>
              entry.kind === "day" ? (
                <div key={entry.key} data-day={entry.label} className="self-center">
                  <span className="text-sm text-date">{entry.label}</span>
                </div>
              ) : (
                <ChatTurn
                  key={entry.message.id}
                  clinicId={clinicId}
                  chatId={active.id}
                  message={entry.message}
                  bot={active.bot}
                  entered={entered.has(entry.message.id)}
                  error={outgoingErrors.get(entry.message.id)}
                  onReply={setReplyTo}
                />
              ),
            )
          ) : shownHasEvents || !active.bot ? null : (
            <div className="max-w-[min(36rem,100%)] min-w-0 self-start wrap-anywhere rounded-2xl bg-paper px-4 py-3 text-sm leading-6">
              <Markdown source={botGreeting} lead={<BotLead bot={active.bot} />} />
            </div>
          )}
          {showThinking && active.bot ? (
            <div role="status" aria-live="polite" className="self-start py-1">
              <span className="sr-only">Sto elaborando</span>
              <BotGlyph
                color={active.bot.color}
                emoji={active.bot.emoji}
                animate
                plain
                className="h-10 w-10"
              />
            </div>
          ) : null}
          {(streamText.trim() || streamTarget) && active.bot ? (
            <div
              role="status"
              aria-live="polite"
              className="flex w-fit max-w-[min(36rem,100%)] min-w-0 flex-col self-start"
            >
              <div className="max-w-full min-w-0 wrap-anywhere rounded-2xl bg-paper px-4 py-3 text-sm leading-6">
                {streamTarget ? (
                  <ReplyQuote
                    reply={{
                      id: streamTarget.id,
                      excerpt: markdownToPlainText(streamTarget.body).slice(0, 180),
                      mine: streamTarget.mine,
                      botId: streamTarget.botId,
                    }}
                    mine={false}
                    bot={active.bot}
                  />
                ) : null}
                {streamText.trim() ? (
                  <Markdown source={streamText} lead={<BotLead bot={active.bot} animate />} />
                ) : null}
              </div>
            </div>
          ) : null}
          </div>
        </div>

        <MessageComposer
          key={active.id}
          clinicId={clinicId}
          chatId={active.id}
          replyTo={replyTo?.id ? replyTo : null}
          onClearReply={() => setReplyTo(null)}
          onWaiting={active.bot ? noteWaiting : undefined}
          caretEpoch={replyCaret.current}
          onOutgoing={beginOutgoing}
          onOutgoingError={failOutgoing}
        />
        </div>
        </>
        ) : null}
      </section>
      ) : null}
      <ChatDialog
        key={channelDraft ? `chat-${channelDraft.chatId}` : channelOpen ? "chat-create-open" : "chat-create-closed"}
        open={channelOpen}
        clinicId={clinicId}
        draft={channelDraft}
        onCreated={onChatCreated}
        onClose={() => {
          setChannelOpen(false);
          setChannelDraft(null);
        }}
      />
      <BotDialog
        key={botDraft ? `bot-${botDraft.botId}` : botOpen ? "bot-create-open" : "bot-create-closed"}
        open={botOpen}
        clinicId={clinicId}
        draft={botDraft}
        onCreated={onBotCreated}
        onClose={() => {
          setBotOpen(false);
          setBotDraft(null);
        }}
      />
      <BotActionDialog
        key={pendingConfirmation?.id ?? "no-bot-action"}
        open={Boolean(pendingConfirmation)}
        clinicId={clinicId}
        request={pendingConfirmation}
        onDecided={(requestId) => {
          setPendingConfirmations((current) => current.filter((item) => item.id !== requestId));
        }}
      />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
