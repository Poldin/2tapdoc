"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Plus, Search, Send, Star } from "lucide-react";
import { preferMessage, sendMessage, type CreatedChat, type FormState } from "@/app/clinics/actions";
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
import { createClient } from "@/lib/supabase/client";
import { BotDialog, type BotDraft } from "@/components/bot-dialog";
import { BotGlyph, ChannelMark } from "@/components/mark";
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

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  botId: string | null;
  preferredAt: string | null;
};

export type BotMark = {
  id: string;
  name: string;
  color: string;
  emoji: string;
};

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

function MessageComposer({ clinicId, chatId }: { clinicId: string; chatId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [ready, setReady] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    sendMessage.bind(null, clinicId, chatId),
    {},
  );

  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    if (state.sent) {
      writeDraft(clinicId, chatId, "");
      formRef.current?.reset();
    } else {
      const saved = readDraft(clinicId, chatId);
      if (saved) field.value = saved;
    }
    setReady(field.value.trim().length > 0);
    fitField(field);
  }, [state.sent, clinicId, chatId]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2 px-4 pb-3">
      {state.error ? <p className="px-4 text-sm text-teal">{state.error}</p> : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={fieldRef}
          name="body"
          required
          rows={1}
          maxLength={4000}
          placeholder="Scrivi qui..."
          aria-label="Messaggio"
          disabled={pending}
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
          className="composer-field max-h-40 min-h-12 min-w-0 flex-1 resize-none overflow-x-hidden overflow-y-auto rounded-[1.5rem] border border-line bg-paper px-4 py-3 text-sm leading-5 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !ready}
          aria-label="Invia"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
        >
          <Send className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
    </form>
  );
}

function BotLead({ bot }: { bot: BotMark }) {
  return <BotGlyph color={bot.color} emoji={bot.emoji} plain className="mr-1.5 h-5 w-5 align-[-0.2em]" />;
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
        on ? "text-ink" : "text-muted"
      }`}
    >
      <Star className={`h-3.5 w-3.5 ${on ? "fill-current" : "fill-none"}`} strokeWidth={2} />
    </button>
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
  const [recency, setRecency] = useState(initialRecency);
  const recencyToken = `${clinicId}\n${initialRecency.agendaAt ?? ""}\n${initialRecency.patientsAt ?? ""}\n${initialRecency.settingsAt ?? ""}`;
  const [recencyTokenSeen, setRecencyTokenSeen] = useState(recencyToken);
  if (recencyTokenSeen !== recencyToken) {
    setRecencyTokenSeen(recencyToken);
    setRecency(initialRecency);
  }
  const shownRecency = recencyTokenSeen === recencyToken ? recency : initialRecency;
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const router = useRouter();
  const initial = (email.trim()[0] || "?").toUpperCase();
  const listRef = useRef<HTMLUListElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const knownMessages = useRef<{ chatId: string | null; ids: Set<string> }>({
    chatId: null,
    ids: new Set(),
  });
  const [entered, setEntered] = useState<Set<string>>(new Set());
  const badgeRef = useRef<HTMLParagraphElement>(null);
  const [dayChat, setDayChat] = useState(activeChatId);
  const [dayLabel, setDayLabel] = useState(() =>
    messages.at(-1) ? formatDay(messages.at(-1)!.createdAt) : "oggi",
  );
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
  const shownMessages = openThread?.messages ?? messages;
  const shownHasEvents = openThread?.hasEvents ?? hasEvents;
  const active = visibleChats.find((chat) => chat.id === shownActiveId) ?? null;
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
  const confirmationToken = confirmations.map((item) => `${item.id}:${item.action}`).join("|");
  const [pendingConfirmations, setPendingConfirmations] = useState(confirmations);
  const [seenConfirmationToken, setSeenConfirmationToken] = useState(confirmationToken);
  if (seenConfirmationToken !== confirmationToken) {
    setSeenConfirmationToken(confirmationToken);
    setPendingConfirmations(confirmations);
  }
  const pendingConfirmation = pendingConfirmations[0] ?? null;

  useEffect(() => {
    if (opened || !activeChatId || agendaOpen || patientsOpen || settingsOpen) return;

    const supabase = createClient();
    let timer = 0;
    let stopped = false;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshPage.current(), 50);
    };
    const channel = supabase.channel(`clinic:${clinicId}:${activeChatId}`);
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_events",
        filter: `chat_id=eq.${activeChatId}`,
      },
      refresh,
    );
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "chat_events",
        filter: `chat_id=eq.${activeChatId}`,
      },
      refresh,
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chat_clinics",
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
  }, [opened, activeChatId, agendaOpen, patientsOpen, settingsOpen, clinicId]);

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

  function onChatRemoved(chatId: string) {
    setAdded((current) => current.filter((entry) => entry.id !== chatId));
    setRemoved((current) => (current.includes(chatId) ? current : [...current, chatId]));
    const currentId = opened?.id ?? activeChatId;
    if (currentId !== chatId) {
      if (opened?.id === chatId) setOpened(null);
      router.refresh();
      return;
    }
    const next = visibleChats.find((chat) => chat.id !== chatId);
    if (!next) {
      setOpened(null);
      router.replace(`/clinics/${clinicId}`, { scroll: false });
      return;
    }
    if (next.id === activeChatId) {
      setOpened(null);
      router.refresh();
      return;
    }
    setOpened({ id: next.id, messages: [], hasEvents: true, from: activeChatId });
    router.replace(`/clinics/${clinicId}?chat=${next.id}`, { scroll: false });
  }

  useLayoutEffect(() => {
    if (localStorage.getItem(navKey) === "collapsed") setNavCollapsed(true);
  }, []);

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
    const arrived = shownMessages.flatMap((message) => {
      if (known.ids.has(message.id)) return [];
      known.ids.add(message.id);
      return message.id;
    });
    if (arrived.length > 0) setEntered(new Set(arrived));
  }, [shownActiveId, shownMessages]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
    syncDayBadge(thread, badgeRef.current, setDayLabel);
  }, [shownActiveId, shownMessages]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const sync = () => syncDayBadge(thread, badgeRef.current, setDayLabel);
    thread.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(thread);
    return () => {
      thread.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [shownActiveId, shownMessages]);

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
        <div ref={threadRef} className="thread-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-14 pb-6">
          <div className="mt-auto flex flex-col gap-3">
          {shownMessages.length > 0 ? (
            threadEntries(shownMessages).map((entry) =>
              entry.kind === "day" ? (
                <div key={entry.key} data-day={entry.label} className="self-center">
                  <span className="text-sm text-date">{entry.label}</span>
                </div>
              ) : (
                <div
                  key={entry.message.id}
                  className={`flex w-fit max-w-[36rem] flex-col items-end gap-1 ${
                    entry.message.mine ? "self-end" : "self-start"
                  } ${
                    entered.has(entry.message.id)
                      ? entry.message.mine
                        ? "msg-enter-mine"
                        : "msg-enter-theirs"
                      : ""
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                      entry.message.mine ? "bg-ink text-paper" : "bg-paper"
                    }`}
                  >
                    <Markdown
                      source={entry.message.body}
                      lead={
                        active.bot && entry.message.botId === active.bot.id ? (
                          <BotLead bot={active.bot} />
                        ) : undefined
                      }
                    />
                  </div>
                  <div className="flex items-center gap-0.5 px-1">
                    <time dateTime={entry.message.createdAt} className="text-xs text-muted">
                      {formatClock(entry.message.createdAt)}
                    </time>
                    <PreferStar
                      clinicId={clinicId}
                      chatId={active.id}
                      messageId={entry.message.id}
                      preferredAt={entry.message.preferredAt}
                    />
                  </div>
                </div>
              ),
            )
          ) : shownHasEvents || !active.bot ? null : (
            <div className="max-w-[36rem] self-start rounded-2xl bg-paper px-4 py-3 text-sm leading-6">
              <Markdown source={botGreeting} lead={<BotLead bot={active.bot} />} />
            </div>
          )}
          </div>
        </div>

        <MessageComposer key={active.id} clinicId={clinicId} chatId={active.id} />
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
        onCreated={onChatCreated}
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
