"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { loadLatestChatMessages, loadOlderChatMessages } from "@/app/clinics/actions";
import { useClinicChrome } from "@/components/clinic-chrome";
import {
  BotLead,
  ChatTurn,
  LiveTrace,
  MessageComposer,
  ReplyQuote,
  foldEmojiReplies,
  formatDay,
  liveDraftSettled,
  liveDraftView,
  mergeThread,
  messageStamp,
  reconcileOutgoing,
  syncDayBadge,
  threadEntries,
  type BotMark,
  type ChatMessage,
  type ChatPerson,
  type LiveReply,
  type Outgoing,
  type ReplyDraft,
} from "@/components/clinic-shell";
import { ChatTitle } from "@/components/chat-title";
import { BotGlyph } from "@/components/mark";
import { Markdown } from "@/components/markdown";
import { botGreeting } from "@/lib/bot-greeting";
import { markdownToPlainText } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/client";

export function ChatThread({
  clinicId,
  chat,
  messages,
  hasOlder,
  olderCursor: olderCursorProp,
}: {
  clinicId: string;
  chat: {
    id: string;
    color: string;
    emoji: string;
    people: ChatPerson[];
    bots: BotMark[];
    hasEvents: boolean;
  };
  messages: ChatMessage[];
  hasOlder: boolean;
  olderCursor: number | null;
}) {
  const chrome = useClinicChrome();
  const noteActivity = chrome?.noteActivity;
  const [thread, setThread] = useState(messages);
  const [threadStamp, setThreadStamp] = useState(() => messageStamp(messages));
  const [canLoadOlder, setCanLoadOlder] = useState(hasOlder);
  const [olderCursor, setOlderCursor] = useState(olderCursorProp);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const loadToken = useRef(0);
  const reloadToken = useRef(0);
  const stamp = messageStamp(messages);
  if (threadStamp !== stamp) {
    setThreadStamp(stamp);
    setThread(mergeThread(thread, messages));
    setCanLoadOlder(hasOlder);
    setOlderCursor(olderCursorProp);
  }
  const shownMessages = threadStamp === stamp ? thread : mergeThread(thread, messages);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const knownMessages = useRef<{ chatId: string | null; ids: Set<string> }>({ chatId: null, ids: new Set() });
  const waitBaseline = useRef<string | null>(null);
  const replyCaret = useRef(0);
  const shownMessagesRef = useRef(shownMessages);
  shownMessagesRef.current = shownMessages;
  const [waiting, setWaiting] = useState(false);
  const [lives, setLives] = useState<LiveReply[]>([]);
  const livesRef = useRef<LiveReply[]>([]);
  const [entered, setEntered] = useState<Set<string>>(new Set());
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const badgeRef = useRef<HTMLParagraphElement>(null);
  const [dayLabel, setDayLabel] = useState(() =>
    messages.at(-1) ? formatDay(messages.at(-1)!.createdAt) : "oggi",
  );
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  const nextOutgoing = reconcileOutgoing(outgoing, chat.id, shownMessages);
  if (nextOutgoing !== outgoing) setOutgoing(nextOutgoing);
  const pendingOutgoing = nextOutgoing.filter((item) => item.chatId === chat.id);
  const threadMessages = foldEmojiReplies(shownMessages);
  const sending = pendingOutgoing.some((item) => !item.error);
  const lastBotMessage = [...shownMessages].reverse().find((message) => message.botId) ?? null;
  const replyLanded =
    waitBaseline.current !== null && lastBotMessage !== null && lastBotMessage.id !== waitBaseline.current;
  const openLives = lives.filter((item) => !liveDraftSettled(item, shownMessages));
  if (replyLanded) {
    replyCaret.current += 1;
    waitBaseline.current = null;
    if (waiting) setWaiting(false);
  }
  if (openLives.length !== lives.length) setLives(openLives);
  const liveKey = openLives
    .map((item) => `${item.botId}:${item.phase}:${item.updatedAt}:${item.body.length}:${item.trace.length}`)
    .join("|");
  const waitingReply = pendingOutgoing.filter((item) => !item.error);
  const showThinking = waiting && !replyLanded && openLives.length === 0 && chat.bots.length > 0;

  useEffect(() => {
    const last = shownMessages.at(-1);
    if (!last) return;
    noteActivity?.(chat.id, markdownToPlainText(last.body), last.createdAt);
  }, [chat.id, stamp, noteActivity, shownMessages]);

  useEffect(() => {
    let timer = 0;
    const reload = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const token = ++reloadToken.current;
        const requested = chat.id;
        void loadLatestChatMessages(clinicId, requested).then((result) => {
          if (reloadToken.current !== token || !result || "error" in result) return;
          setThread((current) => mergeThread(current, result.messages));
          const last = result.messages.at(-1);
          if (last) noteActivity?.(requested, markdownToPlainText(last.body), last.createdAt);
        });
      }, 50);
    };
    let stopped = false;
    const supabase = createClient();
    const channel = supabase.channel(`clinic:${clinicId}:${chat.id}`);
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_events", filter: `chat_id=eq.${chat.id}` },
      reload,
    );
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "chat_events", filter: `chat_id=eq.${chat.id}` },
      reload,
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "message_emojis", filter: `chat_id=eq.${chat.id}` },
      reload,
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
      reloadToken.current += 1;
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [chat.id, clinicId, noteActivity]);

  useLayoutEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    const channel = supabase.channel(`draft:${clinicId}:${chat.id}`);
    const seenAt = new Map<string, string>();
    const dropTimers = new Map<string, number>();
    const commit = (next: LiveReply[]) => {
      livesRef.current = next;
      setLives(next);
    };
    const drop = (botId: string) => {
      commit(livesRef.current.filter((item) => item.botId !== botId));
    };
    const apply = (
      row: { bot_id?: string; phase?: string; body?: string; updated_at?: string } | null,
      removed: boolean,
    ) => {
      const botId = row?.bot_id;
      if (!botId) return;
      const pending = dropTimers.get(botId);
      if (pending) {
        window.clearTimeout(pending);
        dropTimers.delete(botId);
      }
      if (removed) {
        const previous = livesRef.current.find((item) => item.botId === botId) ?? null;
        const hold =
          previous !== null &&
          previous.phase === "writing" &&
          previous.body.trim().length > 0 &&
          !liveDraftSettled(previous, shownMessagesRef.current);
        if (!hold || !previous) {
          drop(botId);
          return;
        }
        const held = previous.updatedAt;
        dropTimers.set(
          botId,
          window.setTimeout(() => {
            dropTimers.delete(botId);
            const current = livesRef.current.find((item) => item.botId === botId);
            if (!current || current.updatedAt !== held) return;
            drop(botId);
          }, 1600),
        );
        return;
      }
      const updatedAt = typeof row.updated_at === "string" ? row.updated_at : "";
      const previousAt = seenAt.get(botId) ?? "";
      if (updatedAt && previousAt && updatedAt < previousAt) return;
      if (updatedAt) seenAt.set(botId, updatedAt);
      const phase: LiveReply["phase"] = row.phase === "writing" ? "writing" : "thinking";
      const rawBody = typeof row.body === "string" ? row.body : "";
      const next: LiveReply = {
        botId,
        phase,
        body: phase === "writing" ? rawBody : "",
        trace: phase === "thinking" ? rawBody : "",
        updatedAt,
      };
      if (liveDraftSettled(next, shownMessagesRef.current)) {
        drop(botId);
        return;
      }
      const current = livesRef.current.find((item) => item.botId === botId);
      if (current && updatedAt && current.updatedAt && updatedAt < current.updatedAt) return;
      commit([...livesRef.current.filter((item) => item.botId !== botId), next]);
    };
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_drafts", filter: `chat_id=eq.${chat.id}` },
      (payload) => {
        if (payload.eventType === "DELETE") apply(payload.old, true);
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
            .eq("chat_id", chat.id)
            .then(({ data: existing }) => {
              if (stopped) return;
              for (const row of existing ?? []) apply(row, false);
            });
        });
      });
    });
    return () => {
      stopped = true;
      for (const timer of dropTimers.values()) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [chat.id, clinicId]);

  useLayoutEffect(() => {
    const known = knownMessages.current;
    if (known.chatId !== chat.id) {
      known.chatId = chat.id;
      known.ids = new Set(shownMessages.map((message) => message.id));
      setEntered((current) => (current.size === 0 ? current : new Set()));
      return;
    }
    const arrived = shownMessages.flatMap((message) => {
      if (known.ids.has(message.id)) return [];
      known.ids.add(message.id);
      return message.id;
    });
    if (arrived.length > 0) setEntered(new Set(arrived));
  }, [chat.id, shownMessages]);

  useLayoutEffect(() => {
    const scroller = threadRef.current;
    if (!scroller) return;
    if (stickToBottom.current) scroller.scrollTop = scroller.scrollHeight;
    syncDayBadge(scroller, badgeRef.current, setDayLabel);
  }, [chat.id, shownMessages, showThinking, sending, liveKey]);

  useEffect(() => {
    const scroller = threadRef.current;
    if (!scroller) return;
    const sync = () => {
      syncDayBadge(scroller, badgeRef.current, setDayLabel);
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stickToBottom.current = distance < 120;
    };
    scroller.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [chat.id, shownMessages]);

  function pinToMessage(scroller: HTMLDivElement) {
    const edge = scroller.getBoundingClientRect().top;
    for (const node of scroller.querySelectorAll<HTMLElement>("[id^='message-']")) {
      const box = node.getBoundingClientRect();
      if (box.bottom > edge + 1) return { id: node.id, offset: box.top - edge };
    }
    return null;
  }

  async function loadOlder() {
    const cursor = olderCursor;
    if (loadingOlder || !canLoadOlder || cursor === null) return;
    const requested = chat.id;
    const token = ++loadToken.current;
    const scroller = threadRef.current;
    const anchor = scroller ? pinToMessage(scroller) : null;
    setLoadingOlder(true);
    setOlderError(null);
    const result = await loadOlderChatMessages(clinicId, requested, cursor);
    if (loadToken.current !== token) return;
    if ("error" in result) {
      setLoadingOlder(false);
      setOlderError(result.error ?? "Non è stato possibile caricare i messaggi precedenti.");
      return;
    }
    for (const message of result.messages) knownMessages.current.ids.add(message.id);
    const more = result.hasOlder && result.nextCursor !== null && result.nextCursor !== cursor;
    flushSync(() => {
      if (result.messages.length > 0) setThread((current) => mergeThread(current, result.messages));
      setCanLoadOlder(more);
      setOlderCursor(result.nextCursor);
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

  function beginOutgoing(input: {
    id: string;
    chatId: string;
    body: string;
    replyTo: ReplyDraft | null;
    mentions: string[];
  }) {
    const currentMessages = shownMessagesRef.current;
    const target = input.replyTo ? currentMessages.find((message) => message.id === input.replyTo?.id) : null;
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
            authorName: target?.authorName ?? null,
            authorBot: target?.authorBot ?? null,
          }
        : null,
      error: null,
      seenIds: currentMessages.map((message) => message.id),
      mentions: input.mentions,
    };
    setOutgoing((current) => [
      ...current.filter((entry) => !(entry.chatId === input.chatId && entry.error && entry.body === input.body)),
      item,
    ]);
  }

  function settleOutgoing(id: string) {
    setOutgoing((current) => (current.some((item) => item.id === id) ? current.filter((item) => item.id !== id) : current));
    const token = ++reloadToken.current;
    const requested = chat.id;
    void loadLatestChatMessages(clinicId, requested).then((result) => {
      if (reloadToken.current !== token || !result || "error" in result) return;
      setThread((current) => mergeThread(current, result.messages));
      const last = result.messages.at(-1);
      if (last) noteActivity?.(requested, markdownToPlainText(last.body), last.createdAt);
    });
  }

  function noteWaiting(next: boolean) {
    if (!next) {
      waitBaseline.current = null;
      setWaiting(false);
      return;
    }
    waitBaseline.current = lastBotMessage?.id ?? "";
    setWaiting(true);
  }

  return (
    <>
      <ChatTitle
        label={dayLabel}
        badgeRef={badgeRef}
        color={chat.color}
        emoji={chat.emoji}
        face={chat.bots.length === 1 ? chat.bots[0] : null}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <div
          ref={threadRef}
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 pt-14 pb-6 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
        >
          <div className="mt-auto flex flex-col gap-3">
            {canLoadOlder || olderError ? (
              <div className="flex flex-col items-center gap-1 self-center">
                {canLoadOlder ? (
                  <button
                    type="button"
                    onClick={() => void loadOlder()}
                    disabled={loadingOlder}
                    className="rounded-full px-3 py-1 text-sm text-muted hover:text-ink disabled:opacity-60"
                  >
                    {loadingOlder ? "Caricamento…" : "Messaggi precedenti"}
                  </button>
                ) : null}
                {olderError ? <p className="text-center text-sm text-teal">{olderError}</p> : null}
              </div>
            ) : null}
            {threadMessages.length > 0 ? (
              threadEntries(threadMessages).map((entry) =>
                entry.kind === "day" ? (
                  <div key={entry.key} data-day={entry.label} className="self-center">
                    <span className="text-sm text-date">{entry.label}</span>
                  </div>
                ) : (
                  <ChatTurn
                    key={entry.message.id}
                    clinicId={clinicId}
                    chatId={chat.id}
                    message={entry.message}
                    named={chat.people.length > 1 || chat.bots.length > 1}
                    entered={entered.has(entry.message.id)}
                    bots={chat.bots}
                    onReply={setReplyTo}
                  />
                ),
              )
            ) : chat.hasEvents || chat.bots.length !== 1 ? null : (
              <div className="max-w-[min(36rem,100%)] min-w-0 self-start wrap-anywhere rounded-2xl bg-paper px-4 py-3 text-sm leading-6">
                <Markdown source={botGreeting} lead={<BotLead bot={chat.bots[0]} />} />
              </div>
            )}
            {sending ? (
              <div role="status" className="flex justify-end self-end py-1">
                <span className="sr-only">Invio in corso</span>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none" />
              </div>
            ) : null}
            {showThinking ? (
              <div
                role="status"
                aria-live="polite"
                className="flex w-full max-w-[min(36rem,100%)] flex-col items-start gap-2 self-start"
              >
                <p className="flex items-center gap-2 py-1 text-sm text-muted">
                  {chat.bots.length === 1 ? (
                    <BotGlyph color={chat.bots[0].color} emoji={chat.bots[0].emoji} plain className="h-5 w-5" />
                  ) : null}
                  <span>
                    sto elaborando
                    <span className="elaborating-dots" aria-hidden="true" />
                  </span>
                </p>
              </div>
            ) : null}
            {openLives.map((live) => {
              const view = liveDraftView(live, shownMessages, waitingReply);
              const bot = chat.bots.find((item) => item.id === live.botId) ?? null;
              return (
                <div key={live.botId} className="flex w-full max-w-[min(36rem,100%)] flex-col items-start gap-2 self-start">
                  {view.thinking ? (
                    <div role="status" aria-live="polite" className="flex w-full flex-col items-start gap-2">
                      <p className="flex items-center gap-2 py-1 text-sm text-muted">
                        {bot ? <BotGlyph color={bot.color} emoji={bot.emoji} plain className="h-5 w-5" /> : null}
                        <span>
                          sto elaborando
                          <span className="elaborating-dots" aria-hidden="true" />
                        </span>
                      </p>
                      {view.trace ? <LiveTrace text={view.trace} /> : null}
                    </div>
                  ) : null}
                  {view.text.trim() || view.target ? (
                    <div role="status" aria-live="polite" className="flex w-fit max-w-full min-w-0 flex-col">
                      <div className="max-w-full min-w-0 wrap-anywhere rounded-2xl bg-paper px-4 py-3 text-sm leading-6">
                        {view.target ? (
                          <ReplyQuote
                            reply={{
                              id: view.target.id,
                              excerpt: markdownToPlainText(view.target.body).slice(0, 180),
                              mine: view.target.mine,
                              botId: view.target.botId,
                              authorName: view.target.authorName,
                              authorBot: view.target.authorBot,
                            }}
                            mine={false}
                          />
                        ) : null}
                        {view.text.trim() && bot ? <Markdown source={view.text} lead={<BotLead bot={bot} animate />} /> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        <MessageComposer
          key={chat.id}
          clinicId={clinicId}
          chatId={chat.id}
          bots={chat.bots}
          replyTo={replyTo?.id ? replyTo : null}
          onClearReply={() => setReplyTo(null)}
          onWaiting={chat.bots.length > 0 ? noteWaiting : undefined}
          caretEpoch={replyCaret.current}
          onOutgoing={beginOutgoing}
          onOutgoingSettled={settleOutgoing}
        />
      </div>
    </>
  );
}
