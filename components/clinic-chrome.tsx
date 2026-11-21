"use client";

import { createContext, useContext, type ReactNode } from "react";
import { type CreatedChat } from "@/app/clinics/actions";
import { type ChatUnreadState } from "@/lib/chat-unread";

export type ChatMenuTarget = {
  clinicId: string;
  chatId: string;
  name: string;
  people: boolean;
  unread: boolean;
  onEdit: () => void;
  onPeople: () => void;
  onRemoved: (chatId: string) => void;
  onToggleUnread: () => void;
};

export type ClinicChrome = {
  onChatCreated: (chat: CreatedChat) => void;
  noteActivity: (chatId: string, preview: string | null, activityAt: string) => void;
  chatStates: Record<string, ChatUnreadState>;
  listOpen: boolean;
  isManuallyUnread: (chatId: string) => boolean;
  clearManualUnread: (chatId: string) => void;
  markRead: (chatId: string, upToSeq?: number | null, options?: { force?: boolean }) => void;
  markUnread: (chatId: string) => void;
  chatMenuTarget: (chatId: string) => ChatMenuTarget | null;
};

const ClinicChromeContext = createContext<ClinicChrome | null>(null);

export function ClinicChromeProvider({
  value,
  children,
}: {
  value: ClinicChrome;
  children: ReactNode;
}) {
  return <ClinicChromeContext.Provider value={value}>{children}</ClinicChromeContext.Provider>;
}

export function useClinicChrome() {
  return useContext(ClinicChromeContext);
}
