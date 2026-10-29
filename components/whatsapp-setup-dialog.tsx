"use client";

import { useActionState, useEffect, useRef } from "react";
import { startMastroW, type CreatedChat, type FormState } from "@/app/clinics/actions";
import { BotGlyph } from "@/components/mark";

const mastroWColor = "green";
const mastroWEmoji = "1f9d0_facewithmonocle";

function storageKey(integrationId: string) {
  return `2tapdoc.whatsapp.setup.${integrationId}`;
}

export function clearWhatsAppSetupDraft(integrationId: string) {
  try {
    window.localStorage.removeItem(storageKey(integrationId));
  } catch {
    /* ignore quota / private mode */
  }
}

export function WhatsAppSetupDialog({
  open,
  clinicId,
  canManage,
  onClose,
  onCreatedChat,
}: {
  open: boolean;
  clinicId: string;
  integrationId: string;
  canManage: boolean;
  webhookVerifyToken?: string;
  onClose: () => void;
  onLinkedNote?: (note: string) => void;
  onCreatedChat?: (chat: CreatedChat) => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    startMastroW.bind(null, clinicId),
    {},
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onCreatedChatRef = useRef(onCreatedChat);
  onCreatedChatRef.current = onCreatedChat;

  useEffect(() => {
    if (!state.created) return;
    onCloseRef.current();
    onCreatedChatRef.current?.(state.created);
  }, [state.created]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-setup-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-5 overflow-hidden rounded-3xl border border-line bg-paper p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="whatsapp-setup-title" className="text-base font-medium">
            WhatsApp
          </h2>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            disabled={pending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <p className="text-sm leading-6 text-ink">
          Avviare WhatsApp richiede 5 - 10 min e lo puoi fare col supporto di{" "}
          <span className="font-semibold">MASTRO W</span>
        </p>

        {state.error ? (
          <p className="text-sm text-teal" aria-live="polite">
            {state.error}
          </p>
        ) : null}

        {canManage ? (
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-teal px-5 text-sm font-medium text-teal-ink disabled:opacity-50"
          >
            <BotGlyph color={mastroWColor} emoji={mastroWEmoji} animate plain className="h-7 w-7" />
            <span>{pending ? "Avvio Mastro W…" : "avvia MASTRO W"}</span>
          </button>
        ) : (
          <p className="text-sm text-muted">In attesa del collegamento.</p>
        )}
      </form>
    </div>
  );
}
