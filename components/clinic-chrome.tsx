"use client";

import { createContext, useContext, type ReactNode } from "react";
import { type CreatedChat } from "@/app/clinics/actions";

export type ClinicChrome = {
  onChatCreated: (chat: CreatedChat) => void;
  noteActivity: (chatId: string, preview: string | null, activityAt: string) => void;
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
