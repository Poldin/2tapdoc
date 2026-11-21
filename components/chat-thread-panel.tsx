"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowDown } from "lucide-react";
import { loadLatestChatMessages, loadOlderChatMessages } from "@/app/clinics/actions";
import { useClinicChrome } from "@/components/clinic-chrome";
import { formatUnreadCount } from "@/lib/chat-unread";
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
  outgoingMessage,
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
import { Markdown, type MentionBadge } from "@/components/markdown";
import { botGreeting } from "@/lib/bot-greeting";
import { markdownToPlainText } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/client";

export function ChatThread({
  clinicId,
  currentUserId,
  chat,
  messages,
  hasOlder,
  olderCursor: olderCursorProp,
}: {
  clinicId: string;
  currentUserId: string;
  chat: {
    id: string;
    color: string;
    emoji: string;
    people: ChatPerson[];
    bots: BotMark[];
    directBot: BotMark | null;
    hasEvents: boolean;
  };
  messages: ChatMessage[];
  hasOlder: boolean;
  olderCursor: number | null;
}) {
  const chrome = useClinicChrome();
  const noteActivity = chrome?.noteActivity;
  const markRead = chrome?.markRead;
  const isManuallyUnread = chrome?.isManuallyUnread;
  const clearManualUnread = chrome?.clearManualUnread;
  const listOpen = chrome?.listOpen ?? false;
  const chatState = chrome?.chatStates[chat.id];
  const [dividerAfterSeq, setDividerAfterSeq] = useState<number | null>(() => {
    const initial = chrome?.chatStates[chat.id];
    if (initial && initial.unreadCount > 0) return initial.lastReadSeq;
    return null;
  });
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
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
  const liveSeenBots = useRef<Set<string>>(new Set());
  const outgoingCleanups = useRef<Map<string, number>>(new Map());
  const [caretEpoch, setCaretEpoch] = useState(0);
  const shownMessagesRef = useRef(shownMessages);
  shownMessagesRef.current = shownMessages;
  const [lives, setLives] = useState<LiveReply[]>([]);
  const livesRef = useRef<LiveReply[]>([]);
  const [entered, setEntered] = useState<Set<string>>(new Set());
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const hadOutgoingRef = useRef(false);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [dayLabel, setDayLabel] = useState(() =>
    messages.at(-1) ? formatDay(messages.at(-1)!.createdAt) : "oggi",
  );
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  const nextOutgoing = reconcileOutgoing(outgoing, chat.id, shownMessages);
  if (nextOutgoing !== outgoing) setOutgoing(nextOutgoing);
  const pendingOutgoing = nextOutgoing.filter((item) => item.chatId === chat.id);
  const optimisticMessages = pendingOutgoing.map(outgoingMessage);
  const threadMessages = [...foldEmojiReplies(shownMessages), ...optimisticMessages];
  const openLives = lives.filter((item) => !liveDraftSettled(item, shownMessages));
  if (openLives.length !== lives.length) setLives(openLives);
  const liveKey = openLives
    .map((item) => `${item.botId}:${item.phase}:${item.updatedAt}:${item.body.length}:${item.trace.length}`)
    .join("|");
  const waitingReply = pendingOutgoing.filter((item) => !item.error);
  const named = chat.people.length > 1 || chat.bots.length > 1;
  const otherPeople = chat.people.filter((person) => person.id !== currentUserId);
  const latestRealSeq = shownMessages.reduce(
    (max, message) =>
      message.seq > max && message.seq < Number.MAX_SAFE_INTEGER ? message.seq : max,
    0,
  );
  const firstUnreadMessageId =
    dividerAfterSeq !== null
      ? (threadMessages.find(
          (message) =>
            !message.mine &&
            message.seq < Number.MAX_SAFE_INTEGER &&
            message.seq > dividerAfterSeq,
        )?.id ?? null)
      : null;
  const unreadBelowCount = !atBottom ? (chatState?.unreadCount ?? 0) : 0;
  const liveMentions: MentionBadge[] = [
    ...chat.bots.map((bot): MentionBadge => ({ kind: "bot", name: bot.name, emoji: bot.emoji, color: bot.color })),
    ...chat.people.map(
      (person): MentionBadge => ({
        kind: "person",
        name: person.name,
        avatarUrl: person.avatarUrl,
        emoji: person.emoji,
        color: person.color,
      }),
    ),
  ];

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
    const onVisibility = () => {
      setPageVisible(document.visibilityState === "visible");
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") setPageVisible(true);
    };
    const onOnline = () => reload();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

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
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [chat.id, clinicId, noteActivity]);

  useEffect(() => {
    if (!markRead || listOpen || !pageVisible || !atBottom) return;
    if (isManuallyUnread?.(chat.id)) return;
    const hasUnread = Boolean(chatState && (chatState.unreadCount > 0 || chatState.markedUnread));
    const hasUnmarkedSeq = Boolean(chatState && latestRealSeq > chatState.lastReadSeq);
    if (!hasUnread && !hasUnmarkedSeq) return;
    markRead(chat.id, latestRealSeq > 0 ? latestRealSeq : null);
  }, [
    chat.id,
    chatState,
    latestRealSeq,
    listOpen,
    pageVisible,
    atBottom,
    markRead,
    isManuallyUnread,
  ]);

  useLayoutEffect(() => {
    livesRef.current = lives;
    for (const item of lives) liveSeenBots.current.add(item.botId);
  }, [lives]);

  useEffect(() => {
    const cleanups = outgoingCleanups.current;
    return () => {
      for (const timer of cleanups.values()) window.clearTimeout(timer);
      cleanups.clear();
    };
  }, []);

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
      row: { bot_id?: string; phase?: string; body?: string; trace?: string; updated_at?: string } | null,
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
          }, 2000),
        );
        return;
      }
      const updatedAt = typeof row.updated_at === "string" ? row.updated_at : "";
      const previousAt = seenAt.get(botId) ?? "";
      if (updatedAt && previousAt && updatedAt < previousAt) return;
      if (updatedAt) seenAt.set(botId, updatedAt);
      const current = livesRef.current.find((item) => item.botId === botId);
      if (current && updatedAt && current.updatedAt && updatedAt < current.updatedAt) return;
      const incomingPhase: LiveReply["phase"] = row.phase === "writing" ? "writing" : "thinking";
      const rawBody = typeof row.body === "string" ? row.body : "";
      const rawTrace = typeof row.trace === "string" ? row.trace : "";
      const keepWriting =
        current?.phase === "writing" && current.body.trim().length > 0 && incomingPhase === "thinking";
      const phase: LiveReply["phase"] = keepWriting ? "writing" : incomingPhase;
      const body = keepWriting ? current.body : phase === "writing" ? rawBody : "";
      const trace =
        rawTrace ||
        (incomingPhase === "thinking" && rawBody ? rawBody : current?.trace ?? "");
      const next: LiveReply = {
        botId,
        phase,
        body,
        trace,
        updatedAt,
      };
      if (liveDraftSettled(next, shownMessagesRef.current)) {
        drop(botId);
        return;
      }
      liveSeenBots.current.add(botId);
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
            .select("bot_id, phase, body, trace, updated_at")
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
      liveSeenBots.current.clear();
      hadOutgoingRef.current = pendingOutgoing.length > 0;
      setEntered((current) => (current.size === 0 ? current : new Set()));
      return;
    }
    let botArrived = false;
    const arrived: string[] = [];
    for (const message of shownMessages) {
      if (known.ids.has(message.id)) continue;
      known.ids.add(message.id);
      if (message.botId) {
        botArrived = true;
        if (liveSeenBots.current.has(message.botId)) {
          liveSeenBots.current.delete(message.botId);
          continue;
        }
      }
      if (message.mine && hadOutgoingRef.current) {
        continue;
      }
      arrived.push(message.id);
    }
    for (const item of pendingOutgoing) {
      if (known.ids.has(item.id)) continue;
      known.ids.add(item.id);
      arrived.push(item.id);
    }
    hadOutgoingRef.current = pendingOutgoing.length > 0;
    if (botArrived) setCaretEpoch((value) => value + 1);
    if (arrived.length > 0) setEntered(new Set(arrived));
  }, [chat.id, shownMessages, pendingOutgoing]);

  useLayoutEffect(() => {
    const scroller = threadRef.current;
    if (!scroller) return;
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      const divider = unreadDividerRef.current;
      if (divider) {
        const dividerTop =
          divider.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        const maxBottomTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (dividerTop < maxBottomTop + 56) {
          scroller.scrollTop = Math.max(0, dividerTop - 72);
          const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
          const nearBottom = distance < 80;
          stickToBottom.current = nearBottom;
          setAtBottom(nearBottom);
          syncDayBadge(scroller, badgeRef.current, setDayLabel);
          return;
        }
      }
    }
    if (stickToBottom.current) {
      scroller.scrollTop = scroller.scrollHeight;
      setAtBottom(true);
    }
    syncDayBadge(scroller, badgeRef.current, setDayLabel);
  }, [chat.id, shownMessages, pendingOutgoing.length, liveKey]);

  useEffect(() => {
    const scroller = threadRef.current;
    if (!scroller) return;
    const sync = () => {
      syncDayBadge(scroller, badgeRef.current, setDayLabel);
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stickToBottom.current = distance < 120;
      setAtBottom(distance < 80);
    };
    scroller.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [chat.id, shownMessages]);

  function jumpToBottom() {
    const scroller = threadRef.current;
    stickToBottom.current = true;
    setAtBottom(true);
    if (scroller) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    }
    markRead?.(chat.id, latestRealSeq > 0 ? latestRealSeq : null);
  }

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
    setDividerAfterSeq(null);
    clearManualUnread?.(chat.id);
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

  function settleOutgoing(id: string, ok: boolean) {
    const existingTimer = outgoingCleanups.current.get(id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      outgoingCleanups.current.delete(id);
    }
    if (!ok) {
      setOutgoing((current) =>
        current.some((item) => item.id === id) ? current.filter((item) => item.id !== id) : current,
      );
      return;
    }
    const timer = window.setTimeout(() => {
      outgoingCleanups.current.delete(id);
      setOutgoing((current) =>
        current.some((item) => item.id === id) ? current.filter((item) => item.id !== id) : current,
      );
    }, 4000);
    outgoingCleanups.current.set(id, timer);
    const token = ++reloadToken.current;
    const requested = chat.id;
    void loadLatestChatMessages(clinicId, requested).then((result) => {
      if (reloadToken.current !== token || !result || "error" in result) return;
      setThread((current) => mergeThread(current, result.messages));
      const last = result.messages.at(-1);
      if (last) noteActivity?.(requested, markdownToPlainText(last.body), last.createdAt);
    });
  }

  return (
    <>
      <ChatTitle
        chatId={chat.id}
        label={dayLabel}
        badgeRef={badgeRef}
        color={chat.color}
        emoji={chat.emoji}
        face={chat.directBot}
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
                  <Fragment key={entry.message.id}>
                    {entry.message.id === firstUnreadMessageId ? (
                      <div
                        ref={unreadDividerRef}
                        role="separator"
                        aria-label="Nuovi messaggi"
                        className="my-2 flex items-center gap-3 self-stretch px-1"
                      >
                        <span className="h-px flex-1 bg-teal/30" />
                        <span className="rounded-full bg-teal/10 px-2.5 py-0.5 text-xs font-medium text-teal">
                          Nuovi messaggi
                        </span>
                        <span className="h-px flex-1 bg-teal/30" />
                      </div>
                    ) : null}
                    <ChatTurn
                      clinicId={clinicId}
                      chatId={chat.id}
                      message={entry.message}
                      named={named}
                      entered={entered.has(entry.message.id)}
                      bots={chat.bots}
                      people={chat.people}
                      onReply={setReplyTo}
                    />
                  </Fragment>
                ),
              )
            ) : chat.hasEvents || !chat.directBot ? null : (
              <div className="max-w-[min(36rem,100%)] min-w-0 self-start wrap-anywhere rounded-2xl bg-paper px-4 py-3 text-sm leading-6">
                <Markdown source={botGreeting} lead={<BotLead bot={chat.directBot} />} />
              </div>
            )}
            {openLives.map((live) => {
              const view = liveDraftView(live, shownMessages, waitingReply);
              const bot = chat.bots.find((item) => item.id === live.botId) ?? null;
              if (!view.thinking && !view.text.trim() && !view.target) return null;
              return (
                <div
                  key={live.botId}
                  role="status"
                  aria-live="polite"
                  className="msg-enter-theirs flex w-full max-w-[min(36rem,100%)] min-w-0 flex-col items-start gap-1 self-start"
                >
                  {named && bot ? <p className="px-1 text-xs text-muted">{bot.name}</p> : null}
                  <LiveTrace text={live.trace} />
                  <div className="flex max-w-full min-w-0 items-center">
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
                      {view.thinking ? (
                        <p className="text-muted">
                          {bot ? <BotLead bot={bot} animate /> : null}
                          <span>
                            sto elaborando
                            <span className="elaborating-dots" aria-hidden="true" />
                          </span>
                        </p>
                      ) : view.text.trim() ? (
                        <Markdown
                          source={view.text}
                          lead={bot ? <BotLead bot={bot} animate /> : undefined}
                          mentions={liveMentions}
                          mine={false}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative">
          {unreadBelowCount > 0 ? (
            <div className="pointer-events-none absolute right-0 -top-11 left-0 z-20 flex justify-center">
              <button
                type="button"
                onClick={jumpToBottom}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-teal px-3.5 py-1.5 text-xs font-medium text-teal-ink shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.2} />
                <span>
                  {unreadBelowCount === 1
                    ? "1 nuovo messaggio"
                    : `${formatUnreadCount(unreadBelowCount)} nuovi messaggi`}
                </span>
              </button>
            </div>
          ) : null}
          <MessageComposer
            key={chat.id}
            clinicId={clinicId}
            chatId={chat.id}
            bots={chat.bots}
            people={otherPeople}
            replyTo={replyTo?.id ? replyTo : null}
            onClearReply={() => setReplyTo(null)}
            caretEpoch={caretEpoch}
            onOutgoing={beginOutgoing}
            onOutgoingSettled={settleOutgoing}
          />
        </div>
      </div>
    </>
  );
}
