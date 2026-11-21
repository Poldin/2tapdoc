"use client";

import { useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Copy, PanelLeftClose, PanelLeftOpen, Plus, Reply, Search, Send, SmilePlus, Star, ThumbsDown, ThumbsUp, X } from "lucide-react";
import {
  fetchJoinedChat,
  fetchPendingConfirmations,
  preferMessage,
  reactToMessage,
  sendMessage,
  setMessageEmoji,
  type CreatedChat,
  type FormState,
} from "@/app/clinics/actions";
import { ClinicChromeProvider } from "@/components/clinic-chrome";
import {
  formatDuration,
  formatStepTokens,
  formatTokenCount,
  parseAgentSteps,
  stepTotals,
  type AgentStep,
} from "@/lib/agent-steps";
import { chatEmojis, isChatEmoji } from "@/lib/chat-emoji";
import { markdownToPlainText } from "@/lib/markdown";
import { takeReplyMarker } from "@/lib/reply-marker";
import { AgendaListItem, agendaListId } from "@/components/agenda-list-item";
import { PatientsListItem, patientsListId } from "@/components/patients-list-item";
import { BotActionDialog, type BotActionRequest } from "@/components/bot-action-dialog";
import { SettingsListItem, settingsListId } from "@/components/settings-list-item";
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
import { ChatSeats } from "@/components/chat-seats";
import { ChatTitle } from "@/components/chat-title";
import { ClinicSwitcher, type ClinicOption } from "@/components/clinic-switcher";
import { CreateMenu } from "@/components/create-menu";
import { SearchDialog } from "@/components/search-dialog";
import { Markdown } from "@/components/markdown";

export type ChatPerson = { id: string; name: string };

export type ChatListItem = {
  id: string;
  title: string | null;
  color: string;
  emoji: string;
  preview: string | null;
  activityAt: string;
  people: ChatPerson[];
  bots: BotMark[];
};

export type ChatReply = {
  id: string;
  excerpt: string;
  mine: boolean;
  botId: string | null;
  authorName: string | null;
  authorBot: BotMark | null;
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
  authorName: string | null;
  authorBot: BotMark | null;
  preferredAt: string | null;
  reaction: "up" | "down" | null;
  replyTo: ChatReply | null;
  emojis: ChatEmojiMark[];
  steps: AgentStep[];
  mentions: string[];
};

export type BotMark = {
  id: string;
  name: string;
  color: string;
  emoji: string;
};

export type LiveReply = {
  botId: string;
  phase: "thinking" | "writing";
  body: string;
  trace: string;
  updatedAt: string;
};

function copyableMessage(source: string) {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) =>
      label.trim() === href.trim() ? href.trim() : `${label.trim()} (${href.trim()})`,
    )
    .replace(/(\*\*\*|___)([\s\S]*?)\1/g, "$2")
    .replace(/(\*\*|__)([\s\S]*?)\1/g, "$2")
    .replace(/~~([\s\S]*?)~~/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .trim();
}

function stepsTitle(steps: AgentStep[], rawLog: boolean) {
  const base = rawLog ? "Passaggi" : steps.length === 1 ? "1 passaggio" : `${steps.length} passaggi`;
  const totals = stepTotals(steps);
  const extra = [
    totals.ms > 0 ? formatDuration(totals.ms) : "",
    totals.tokens > 0 ? `${formatTokenCount(totals.tokens)} token` : "",
  ].filter(Boolean);
  return extra.length ? `${base} · ${extra.join(" · ")}` : base;
}

function stepsCopyText(steps: AgentStep[]) {
  if (steps.length === 1 && steps[0].name === "passaggi" && !steps[0].input) return steps[0].outcome.trim();
  return steps
    .map((step) => {
      const tokens = formatStepTokens(step);
      const head = [step.name, typeof step.ms === "number" ? formatDuration(step.ms) : "", tokens]
        .filter(Boolean)
        .join(" · ");
      return [head, step.input.trim(), step.outcome.trim()].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    };
  }, []);

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const value = text.trim();
    if (!value) return;
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        if (resetRef.current !== null) window.clearTimeout(resetRef.current);
        resetRef.current = window.setTimeout(() => {
          resetRef.current = null;
          setCopied(false);
        }, 1600);
      },
      () => setCopied(false),
    );
  }

  return (
    <button
      type="button"
      aria-live="polite"
      aria-label={copied ? "Copiato" : label}
      onClick={onClick}
      className={`flex h-6 shrink-0 items-center justify-center rounded-full ${
        copied ? "gap-1 px-1.5 text-green-600" : "w-6 text-muted"
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
      {copied ? <span className="text-xs leading-none">Copiato</span> : null}
    </button>
  );
}

function AgentSteps({ steps, startOpen = false, live = false }: { steps: AgentStep[]; startOpen?: boolean; live?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (steps.length === 0) return null;
  const rawLog = steps.length === 1 && steps[0].name === "passaggi" && !steps[0].input;
  const title = stepsTitle(steps, rawLog);
  const copyText = stepsCopyText(steps);
  return (
    <details
      open={open}
      onToggle={(event) => {
        if (event.currentTarget instanceof HTMLDetailsElement) setOpen(event.currentTarget.open);
      }}
      className="w-fit max-w-full rounded-2xl bg-paper px-4 py-2"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted [&::-webkit-details-marker]:hidden">
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${open ? "rotate-90" : ""}`} strokeWidth={2} />
        <span className="min-w-0 flex-1">{title}</span>
        {copyText ? <CopyButton text={copyText} label="Copia i passaggi" /> : null}
      </summary>
      {rawLog ? (
        <pre className="mt-2 max-h-64 overflow-auto border-t border-line pt-2 font-mono text-xs leading-5 whitespace-pre-wrap text-ink">
          {steps[0].outcome}
        </pre>
      ) : (
        <ol className="mt-2 flex flex-col gap-3 border-t border-line pt-2">
          {steps.map((step, index) => {
            const tokens = formatStepTokens(step);
            return (
              <li key={`${step.name}-${index}`}>
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-ink">{step.name}</span>
                  {typeof step.ms === "number" ? (
                    <span className="text-xs text-muted">{formatDuration(step.ms)}</span>
                  ) : null}
                  {tokens ? <span className="text-xs text-muted">{tokens}</span> : null}
                </p>
                {step.input ? (
                  <pre className="mt-1 max-h-40 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap text-muted">
                    {step.input}
                  </pre>
                ) : null}
                {step.outcome ? (
                  <pre className="mt-1 max-h-48 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap text-ink">
                    {step.outcome}
                  </pre>
                ) : live && typeof step.ms !== "number" ? (
                  <p className="mt-1 text-xs text-muted">in corso</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

export function LiveTrace({ text }: { text: string }) {
  const steps = parseAgentSteps(text);
  if (steps.length > 0) return <AgentSteps steps={steps} startOpen live />;
  return <AgentSteps steps={[{ name: "passaggi", input: "", outcome: text }]} startOpen live />;
}

/** Il messaggio del bot è già in chat: la bozza (faccia che pensa o testo a metà) è un residuo del turno appena chiuso. */
export function liveDraftView(live: LiveReply, messages: ChatMessage[], waiting: Outgoing[]) {
  const streamBody = live.phase === "writing" && live.body.trim() ? live.body : "";
  const marker = streamBody ? takeReplyMarker(streamBody) : null;
  const saved = marker ? (messages.find((message) => message.id === marker.id) ?? null) : null;
  const target =
    saved ?? (marker && !saved && waiting.length === 1 ? outgoingMessage(waiting[0]) : null);
  const emojiReply = Boolean(marker && isChatEmoji(marker.body));
  const text = emojiReply ? "" : marker && saved ? marker.body : streamBody;
  const thinking = !text.trim() && (live.phase === "thinking" || (emojiReply && Boolean(streamBody)));
  return { text, target, thinking, trace: thinking ? live.trace : "" };
}

export function liveDraftSettled(live: LiveReply, messages: ChatMessage[]) {
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

export function messageStamp(messages: ChatMessage[]) {
  return messages
    .map((message) =>
      [
        message.id,
        message.seq,
        message.body,
        message.preferredAt ?? "",
        message.reaction ?? "",
        message.authorName ?? "",
        message.authorBot?.name ?? "",
        message.replyTo?.excerpt ?? "",
        message.emojis.map((emoji) => `${emoji.emoji}:${emoji.mine ? 1 : 0}:${emoji.botId ?? ""}`).join("."),
        message.steps
          .map(
            (step) =>
              `${step.name}\u001f${step.input.length}\u001f${step.outcome.length}\u001f${step.ms ?? ""}\u001f${step.inputTokens ?? ""}\u001f${step.outputTokens ?? ""}`,
          )
          .join("."),
      ].join("\u001f"),
    )
    .join("\u001e");
}

export type Outgoing = {
  id: string;
  chatId: string;
  body: string;
  createdAt: string;
  replyTo: ChatReply | null;
  error: string | null;
  seenIds: string[];
  mentions: string[];
};

function outgoingMessage(item: Outgoing): ChatMessage {
  return {
    id: item.id,
    seq: Number.MAX_SAFE_INTEGER,
    body: item.body,
    createdAt: item.createdAt,
    mine: true,
    botId: null,
    authorName: null,
    authorBot: null,
    preferredAt: null,
    reaction: null,
    replyTo: item.replyTo,
    emojis: [],
    steps: [],
    mentions: item.mentions,
  };
}

function sameBody(a: string, b: string) {
  return a.replace(/\r\n?/g, "\n").trim() === b.replace(/\r\n?/g, "\n").trim();
}

export function reconcileOutgoing(items: Outgoing[], chatId: string | null, server: ChatMessage[]) {
  if (!chatId) return items;
  const mine = server.filter((message) => message.mine);
  const used = new Set<string>();
  let changed = false;
  const next = items.filter((item) => {
    if (item.chatId !== chatId || item.error) return true;
    const match = mine.find(
      (message) =>
        !used.has(message.id) && !item.seenIds.includes(message.id) && sameBody(message.body, item.body),
    );
    if (!match) return true;
    used.add(match.id);
    changed = true;
    return false;
  });
  return changed ? next : items;
}

export function mergeThread(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt));
}

export function threadEntries(messages: ChatMessage[]) {
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

export function syncDayBadge(
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

export function formatDay(iso: string) {
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
    people: [],
    bots: chat.bot ? [chat.bot] : [],
  };
}

function chatLabel(title: string | null) {
  return title?.trim() || "Chat senza titolo";
}

const navKey = "clinic-nav";

function chatName(chat: ChatListItem) {
  return chatLabel(chat.title);
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

type ComposerMention = { id: string; name: string };

function readDraft(clinicId: string, chatId: string) {
  try {
    const raw = sessionStorage.getItem(draftKey(clinicId, chatId)) ?? "";
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as { body?: unknown; mentions?: unknown };
      if (typeof parsed.body === "string" && Array.isArray(parsed.mentions)) {
        const mentions = parsed.mentions.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as { id?: unknown; name?: unknown };
          if (typeof row.id !== "string" || typeof row.name !== "string" || !row.name) return [];
          return [{ id: row.id, name: row.name }];
        });
        return { body: parsed.body, mentions };
      }
    }
    return { body: raw, mentions: [] as ComposerMention[] };
  } catch {
    return { body: "", mentions: [] as ComposerMention[] };
  }
}

function writeDraft(clinicId: string, chatId: string, body: string, mentions: ComposerMention[]) {
  try {
    const key = draftKey(clinicId, chatId);
    if (!body) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify({ body, mentions }));
  } catch {
    return;
  }
}

function mentionQuery(value: string, caret: number) {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1] ?? "")) return null;
  const query = before.slice(at + 1);
  if (/[\s\n]/.test(query)) return null;
  return { start: at, query };
}

function mentionChoices(bots: BotMark[], query: string) {
  const needle = query.toLocaleLowerCase("it");
  const list = needle ? bots.filter((bot) => bot.name.toLocaleLowerCase("it").includes(needle)) : [...bots];
  return list.sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function mentionStart(body: string, token: string, from: number) {
  let at = from;
  while (at < body.length) {
    const found = body.indexOf(token, at);
    if (found < 0) return -1;
    const before = found === 0 ? "" : (body[found - 1] ?? "");
    const after = body[found + token.length] ?? "";
    const open = before === "" || /\s/.test(before);
    const closed = after === "" || /[\s.,!?;:)\]"'»]/.test(after);
    if (open && closed) return found;
    at = found + token.length;
  }
  return -1;
}

function mentionRanges(body: string, items: ComposerMention[]) {
  const seen = new Map<string, number>();
  const ranges: { start: number; end: number; id: string; name: string }[] = [];
  for (const item of items) {
    const token = `@${item.name}`;
    const nth = seen.get(token) ?? 0;
    let from = 0;
    let start = -1;
    for (let index = 0; index <= nth; index += 1) {
      start = mentionStart(body, token, from);
      if (start < 0) break;
      from = start + token.length;
    }
    if (start < 0) continue;
    ranges.push({ start, end: start + token.length, id: item.id, name: item.name });
    seen.set(token, nth + 1);
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function mentionsInBody(body: string, items: ComposerMention[]) {
  const ranges = mentionRanges(body, items);
  return ranges.map((range) => ({ id: range.id, name: range.name }));
}

function ComposerMirror({ body, mentions }: { body: string; mentions: ComposerMention[] }) {
  const ranges = mentionRanges(body, mentions);
  const nodes = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) nodes.push(body.slice(cursor, range.start));
    nodes.push(
      <span key={`${range.id}-${range.start}`} className="rounded-sm bg-teal/25">
        {body.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  }
  if (cursor < body.length) nodes.push(body.slice(cursor));
  return nodes;
}

export function MessageComposer({
  clinicId,
  chatId,
  bots,
  replyTo,
  onClearReply,
  onWaiting,
  caretEpoch,
  onOutgoing,
  onOutgoingSettled,
}: {
  clinicId: string;
  chatId: string;
  bots: BotMark[];
  replyTo: ReplyDraft | null;
  onClearReply: () => void;
  onWaiting?: (waiting: boolean) => void;
  caretEpoch: number;
  onOutgoing?: (input: {
    id: string;
    chatId: string;
    body: string;
    replyTo: ReplyDraft | null;
    mentions: string[];
  }) => void;
  onOutgoingSettled?: (id: string) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const onWaitingRef = useRef(onWaiting);
  const onClearReplyRef = useRef(onClearReply);
  const sentRef = useRef<number | undefined>(undefined);
  const sentSnapshot = useRef<string | null>(null);
  const sentMentions = useRef<ComposerMention[]>([]);
  const outgoingId = useRef<string | null>(null);
  const reportedFail = useRef<number | undefined>(undefined);
  const onOutgoingRef = useRef(onOutgoing);
  const onOutgoingSettledRef = useRef(onOutgoingSettled);
  onWaitingRef.current = onWaiting;
  onClearReplyRef.current = onClearReply;
  onOutgoingRef.current = onOutgoing;
  onOutgoingSettledRef.current = onOutgoingSettled;
  const [ready, setReady] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [picker, setPicker] = useState<{ start: number; query: string } | null>(null);
  const [pickIndex, setPickIndex] = useState(0);
  const [plain, setPlain] = useState("");
  const [mentions, setMentions] = useState<ComposerMention[]>([]);
  const mentionsRef = useRef<ComposerMention[]>([]);
  const mentionFieldRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  function rememberMentions(items: ComposerMention[]) {
    mentionsRef.current = items;
    setMentions(items);
    if (mentionFieldRef.current) {
      mentionFieldRef.current.value = [...new Set(items.map((item) => item.id))].join(",");
    }
  }

  function applyComposer(field: HTMLTextAreaElement, items: ComposerMention[]) {
    const kept = mentionsInBody(field.value, items);
    rememberMentions(kept);
    setPlain(field.value);
    setPicker(mentionQuery(field.value, field.selectionStart ?? field.value.length));
    setPickIndex(0);
    writeDraft(clinicId, chatId, field.value, kept);
    setReady(field.value.trim().length > 0);
    fitField(field);
    const mirror = mirrorRef.current;
    if (mirror) mirror.scrollTop = field.scrollTop;
  }

  function chooseMention(bot: BotMark) {
    const field = fieldRef.current;
    const query = picker;
    if (!field || !query) return;
    const caret = field.selectionStart ?? field.value.length;
    const next = `${field.value.slice(0, query.start)}@${bot.name} ${field.value.slice(caret)}`;
    field.value = next;
    const cursor = query.start + bot.name.length + 2;
    field.setSelectionRange(cursor, cursor);
    applyComposer(field, [...mentionsRef.current, { id: bot.id, name: bot.name }]);
    field.focus();
  }
  const pickerBots = picker ? mentionChoices(bots, picker.query) : [];
  if (pickIndex > 0 && pickIndex >= pickerBots.length) setPickIndex(0);
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
        writeDraft(clinicId, chatId, "", []);
        rememberMentions([]);
        formRef.current?.reset();
      }
    } else if (state.failed && state.error && state.failed !== reportedFail.current) {
      reportedFail.current = state.failed;
      const snapshot = sentSnapshot.current;
      sentSnapshot.current = null;
      const id = outgoingId.current;
      outgoingId.current = null;
      if (id) onOutgoingSettledRef.current?.(id);
      if (snapshot) {
        field.value = snapshot;
        rememberMentions(sentMentions.current);
        writeDraft(clinicId, chatId, snapshot, sentMentions.current);
      }
    } else if (!state.failed) {
      const saved = readDraft(clinicId, chatId);
      if (saved.body) field.value = saved.body;
      rememberMentions(saved.mentions);
    }
    setPlain(field.value);
    setReady(field.value.trim().length > 0);
    fitField(field);
  }, [state.sent, state.failed, state.error, clinicId, chatId]);

  useEffect(() => {
    if (!state.sent) return;
    if (sentRef.current !== state.sent) {
      sentRef.current = state.sent;
      onClearReplyRef.current();
      const id = outgoingId.current;
      outgoingId.current = null;
      if (id) onOutgoingSettledRef.current?.(id);
    }
    return scheduleDesktopCaret(fieldRef);
  }, [state.sent]);

  useEffect(() => {
    if (!caretEpoch) return;
    return scheduleDesktopCaret(fieldRef);
  }, [caretEpoch]);

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
        const kept = mentionsInBody(snapshot, mentionsRef.current);
        rememberMentions(kept);
        sentSnapshot.current = snapshot;
        sentMentions.current = kept;
        onWaitingRef.current?.(bots.length === 1 || kept.length > 0);
        const id = `pending-${crypto.randomUUID()}`;
        outgoingId.current = id;
        flushSync(() => {
          onOutgoingRef.current?.({
            id,
            chatId,
            body,
            replyTo,
            mentions: [...new Set(kept.map((item) => item.id))],
          });
        });
        queueMicrotask(() => {
          const current = fieldRef.current;
          if (!current || current.value !== snapshot) return;
          current.value = "";
          writeDraft(clinicId, chatId, "", []);
          rememberMentions([]);
          setPlain("");
          setPicker(null);
          setReady(false);
          fitField(current);
        });
      }}
      className="flex flex-col gap-2 px-4 pb-3"
    >
      {state.error ? <p className="px-4 text-sm text-teal">{state.error}</p> : null}
      <input ref={mentionFieldRef} type="hidden" name="mentionIds" defaultValue="" />
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
      <div className="relative flex items-end gap-2">
        {picker && pickerBots.length > 0 ? (
          <ul
            id="mention-list"
            className="absolute bottom-full left-0 z-30 mb-2 max-h-48 w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-paper p-1 shadow-sm"
            role="listbox"
          >
            {pickerBots.map((bot, index) => (
              <li key={bot.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === pickIndex}
                  ref={index === pickIndex ? (node) => node?.scrollIntoView({ block: "nearest" }) : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setPickIndex(index)}
                  onClick={() => chooseMention(bot)}
                  className={`flex w-full items-center gap-2 rounded-2xl px-2 py-1.5 text-left text-sm transition-colors duration-200 motion-reduce:transition-none hover:bg-line ${
                    index === pickIndex ? "bg-line" : ""
                  }`}
                >
                  <BotGlyph color={bot.color} emoji={bot.emoji} plain className="h-6 w-6" />
                  <span className="truncate">{bot.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={`relative min-w-0 flex-1 rounded-3xl border border-line bg-paper ${pending && !desktop ? "opacity-50" : ""}`}>
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 text-sm leading-5 wrap-anywhere whitespace-pre-wrap text-ink"
          >
            {plain ? <ComposerMirror body={plain} mentions={mentions} /> : null}
          </div>
          <textarea
            ref={fieldRef}
            name="body"
            required
            rows={1}
            maxLength={4000}
            placeholder="Scrivi qui..."
            aria-label="Messaggio"
            aria-expanded={Boolean(picker && pickerBots.length > 0)}
            aria-controls={picker && pickerBots.length > 0 ? "mention-list" : undefined}
            disabled={pending && !desktop}
            onInput={(event) => applyComposer(event.currentTarget, mentionsRef.current)}
            onClick={(event) => applyComposer(event.currentTarget, mentionsRef.current)}
            onKeyUp={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                applyComposer(event.currentTarget, mentionsRef.current);
              }
            }}
            onScroll={(event) => {
              const mirror = mirrorRef.current;
              if (mirror) mirror.scrollTop = event.currentTarget.scrollTop;
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !event.nativeEvent.isComposing) {
                const field = event.currentTarget;
                const caret = field.selectionStart ?? 0;
                if (caret === field.selectionEnd) {
                  const ranges = mentionRanges(field.value, mentionsRef.current);
                  const inside = ranges.find((range) => caret > range.start && caret <= range.end);
                  const afterSpace = ranges.find((range) => caret === range.end + 1 && field.value[range.end] === " ");
                  const hit = inside ?? afterSpace;
                  if (hit) {
                    event.preventDefault();
                    const cut = afterSpace ? hit.end + 1 : hit.end;
                    field.value = field.value.slice(0, hit.start) + field.value.slice(cut);
                    field.setSelectionRange(hit.start, hit.start);
                    applyComposer(
                      field,
                      ranges
                        .filter((range) => range !== hit)
                        .map((range) => ({ id: range.id, name: range.name })),
                    );
                    return;
                  }
                }
              }
              if (picker && pickerBots.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setPickIndex((index) => (index + 1) % pickerBots.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setPickIndex((index) => (index - 1 + pickerBots.length) % pickerBots.length);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setPicker(null);
                  return;
                }
                if (
                  (event.key === "Tab" && !event.shiftKey) ||
                  (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing)
                ) {
                  event.preventDefault();
                  const bot = pickerBots[pickIndex];
                  if (bot) chooseMention(bot);
                  return;
                }
              }
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!pending && event.currentTarget.value.trim()) formRef.current?.requestSubmit();
            }}
            className="composer-field relative z-10 max-h-40 min-h-12 w-full resize-none overflow-x-hidden overflow-y-auto rounded-3xl border-0 bg-transparent px-4 py-3 text-sm leading-5 wrap-anywhere text-transparent caret-ink outline-none placeholder:text-muted"
          />
        </div>
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

export function BotLead({ bot, animate = false }: { bot: BotMark; animate?: boolean }) {
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

function speakerName(message: { mine: boolean; authorName: string | null; authorBot: BotMark | null }) {
  if (message.mine) return "Tu";
  if (message.authorBot) return message.authorBot.name;
  if (message.authorName) return message.authorName;
  return "Messaggio";
}

export function ReplyQuote({ reply, mine }: { reply: ChatReply; mine: boolean }) {
  return (
    <button
      type="button"
      onClick={() => focusMessage(reply.id)}
      className={`mb-2 block w-full rounded-xl px-2 py-1 text-left ${mine ? "bg-white/10" : "bg-background"}`}
    >
      <span className="block text-xs font-medium">{speakerName(reply)}</span>
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

export function foldEmojiReplies(messages: ChatMessage[]): ChatMessage[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const extras = new Map<string, ChatEmojiMark[]>();
  const hidden = new Set<string>();
  for (const message of messages) {
    if (!message.botId || !message.replyTo || !byId.has(message.replyTo.id)) continue;
    const emoji = message.body.trim();
    if (!isChatEmoji(emoji)) continue;
    if (message.steps.length > 0) continue;
    hidden.add(message.id);
    const target = byId.get(message.replyTo.id);
    if (!target) continue;
    const already =
      target.emojis.some((item) => item.emoji === emoji && item.botId === message.botId) ||
      (extras.get(target.id) ?? []).some((item) => item.emoji === emoji && item.botId === message.botId);
    if (already) continue;
    const list = extras.get(target.id) ?? [];
    list.push({ emoji, mine: false, botId: message.botId });
    extras.set(target.id, list);
  }
  if (hidden.size === 0) return messages;
  return messages.flatMap((message) => {
    if (hidden.has(message.id)) return [];
    const extra = extras.get(message.id);
    return extra ? [{ ...message, emojis: [...message.emojis, ...extra] }] : [message];
  });
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

export function ChatTurn({
  clinicId,
  chatId,
  message,
  named,
  entered,
  bots,
  error,
  onReply,
}: {
  clinicId: string;
  chatId: string;
  message: ChatMessage;
  named: boolean;
  entered: boolean;
  bots: BotMark[];
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
            label: speakerName(message),
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

  const showSteps = !message.mine && message.steps.length > 0;
  const copyText = copyableMessage(message.body);
  return (
    <div
      id={`message-${message.id}`}
      className={`flex min-w-0 flex-col gap-1 ${
        message.mine
          ? "w-fit max-w-[min(36rem,100%)] items-end self-end"
          : showSteps
            ? "w-full max-w-[min(36rem,100%)] items-start self-start"
            : "w-fit max-w-[min(36rem,100%)] items-start self-start"
      } ${entered ? (message.mine ? "msg-enter-mine" : "msg-enter-theirs") : ""}`}
    >
      {named && !message.mine ? (
        <p className="px-1 text-xs text-muted">{speakerName(message)}</p>
      ) : null}
      {showSteps ? <AgentSteps steps={message.steps} /> : null}
      <div className="flex min-w-0 items-center">
        {message.mine ? gestures : null}
        <div
          className={`max-w-full min-w-0 wrap-anywhere rounded-2xl px-4 py-3 text-sm leading-6 ${
            message.mine ? "bg-ink text-paper" : "bg-paper"
          }`}
        >
          {message.replyTo ? <ReplyQuote reply={message.replyTo} mine={message.mine} /> : null}
          <Markdown
            source={message.body}
            lead={message.authorBot ? <BotLead bot={message.authorBot} /> : undefined}
            mentions={bots.filter((bot) => message.mentions.includes(bot.id))}
            mine={message.mine}
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
        {copyText ? <CopyButton text={copyText} label="Copia il messaggio" /> : null}
      </div>
      {error ? <p className="px-1 text-xs text-teal">{error}</p> : null}
      {picker}
    </div>
  );
}

const listChatPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ClinicShell({
  clinicId,
  clinicName,
  clinics,
  email,
  chats,
  currentUserId,
  clinicPeople,
  myBots,
  recency: initialRecency,
  children,
}: {
  clinicId: string;
  clinicName: string;
  clinics: ClinicOption[];
  email: string;
  chats: ChatListItem[];
  currentUserId: string;
  clinicPeople: ChatPerson[];
  myBots: BotMark[];
  recency: ClinicRecency;
  children: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clinicsOpen, setClinicsOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelDraft, setChannelDraft] = useState<ChatDraft | null>(null);
  const [botOpen, setBotOpen] = useState(false);
  const [botDraft, setBotDraft] = useState<BotDraft | null>(null);
  const [seatsChatId, setSeatsChatId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const agendaOpen = view === "agenda";
  const patientsOpen = view === "patients";
  const settingsOpen = view === "settings";
  const chatParam = searchParams.get("chat");
  const selectedChatId =
    !agendaOpen && !patientsOpen && !settingsOpen && chatParam && listChatPattern.test(chatParam)
      ? chatParam
      : null;
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
  const [focusBox, setFocusBox] = useState<{ top: number; height: number } | null>(null);
  const [slide, setSlide] = useState(false);
  const [added, setAdded] = useState<ChatListItem[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [patches, setPatches] = useState<Record<string, { preview: string | null; activityAt: string }>>({});
  const noteActivity = useCallback((chatId: string, preview: string | null, activityAt: string) => {
    setPatches((current) => {
      const prev = current[chatId];
      if (prev && prev.preview === preview && prev.activityAt === activityAt) return current;
      return { ...current, [chatId]: { preview, activityAt } };
    });
  }, []);
  const serverIds = new Set(chats.map((chat) => chat.id));
  const hidden = new Set(removed.filter((id) => serverIds.has(id)));
  const visibleChats = [
    ...added.filter((chat) => !serverIds.has(chat.id) && !removed.includes(chat.id)),
    ...chats.filter((chat) => !hidden.has(chat.id)),
  ]
    .map((chat) => {
      const patch = patches[chat.id];
      if (!patch || patch.activityAt < chat.activityAt) return chat;
      if (patch.activityAt === chat.activityAt && patch.preview === chat.preview) return chat;
      return { ...chat, preview: patch.preview, activityAt: patch.activityAt };
    })
    .sort((a, b) => b.activityAt.localeCompare(a.activityAt));
  const rows = placeByRecency(visibleChats, [
    { id: agendaListId, at: shownRecency.agendaAt },
    { id: patientsListId, at: shownRecency.patientsAt },
    { id: settingsListId, at: shownRecency.settingsAt },
  ]);
  const visibleKey = rows.map((row) => (row.kind === "chat" ? row.chat.id : row.id)).join(" ");
  const showPanel = agendaOpen || patientsOpen || settingsOpen || Boolean(selectedChatId);
  const selectedListId = settingsOpen
    ? settingsListId
    : patientsOpen
      ? patientsListId
      : agendaOpen
        ? agendaListId
        : selectedChatId;
  const railClosed = navCollapsed && showPanel;
  const quietChatIds = useRef(new Set<string>());
  const creatingBot = useRef(false);
  creatingBot.current = botOpen && botDraft === null;
  const [pendingConfirmations, setPendingConfirmations] = useState<BotActionRequest[]>([]);
  const pendingConfirmation = pendingConfirmations[0] ?? null;


  useEffect(() => {
    const supabase = createClient();
    let timer = 0;
    let stopped = false;
    const pull = (chatId: string) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (creatingBot.current) return;
        if (quietChatIds.current.has(chatId)) return;
        void fetchJoinedChat(clinicId, chatId).then((item) => {
          if (stopped || !item) return;
          setAdded((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
          setRemoved((current) => current.filter((id) => id !== item.id));
        });
      }, 50);
    };
    const channel = supabase.channel(`clinic-list:${clinicId}`);
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_clinics", filter: `clinic_id=eq.${clinicId}` },
      (payload) => {
        const chatId = payload.new.chat_id;
        if (typeof chatId === "string") pull(chatId);
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
      void supabase.removeChannel(channel);
    };
  }, [clinicId]);

  useEffect(() => {
    const supabase = createClient();
    let timer = 0;
    let stopped = false;
    const pull = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void fetchPendingConfirmations(clinicId).then((items) => {
          if (!stopped) setPendingConfirmations(items);
        });
      }, 50);
    };
    pull();
    const channel = supabase.channel(`clinic-confirmations:${clinicId}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bot_confirmations", filter: `clinic_id=eq.${clinicId}` },
      pull,
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

  return (
    <ClinicChromeProvider value={{ onChatCreated, noteActivity }}>
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
                const selected = chat.id === selectedChatId;
                const face = chat.bots.length === 1 ? chat.bots[0] : null;
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
                        {face ? (
                          <BotGlyph
                            color={face.color}
                            emoji={face.emoji}
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
                        onPeople={() => {
                          setSearchOpen(false);
                          setMenuOpen(false);
                          setSeatsChatId(chat.id);
                        }}
                        onEdit={() => {
                          setSearchOpen(false);
                          setMenuOpen(false);
                          setChannelDraft({
                            chatId: chat.id,
                            title: chat.title ?? "",
                            color: chat.color,
                            emoji: chat.emoji,
                          });
                          setChannelOpen(true);
                          setBotOpen(false);
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
        {children}
      </section>
      ) : (
        children
      )}
      {seatsChatId ? (
        <ChatSeats
          clinicId={clinicId}
          chatId={seatsChatId}
          people={visibleChats.find((chat) => chat.id === seatsChatId)?.people ?? []}
          bots={visibleChats.find((chat) => chat.id === seatsChatId)?.bots ?? []}
          colleagues={clinicPeople.filter(
            (person) =>
              !(visibleChats.find((chat) => chat.id === seatsChatId)?.people ?? []).some(
                (seat) => seat.id === person.id,
              ),
          )}
          myBots={myBots}
          currentUserId={currentUserId}
          onEditBot={(bot) => {
            setBotDraft({
              botId: bot.id,
              chatId: seatsChatId,
              name: bot.name,
              color: bot.color,
              emoji: bot.emoji,
            });
            setSeatsChatId(null);
            setBotOpen(true);
            setChannelOpen(false);
          }}
          onLeft={() => {
            onChatRemoved(seatsChatId);
            setSeatsChatId(null);
            router.refresh();
          }}
          onClose={() => setSeatsChatId(null)}
        />
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
    </ClinicChromeProvider>
  );
}
