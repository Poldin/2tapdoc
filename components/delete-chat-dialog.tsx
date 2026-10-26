"use client";

import { useActionState, useEffect } from "react";
import { deleteChat, type FormState } from "@/app/clinics/actions";

export function DeleteChatDialog({
  open,
  clinicId,
  chatId,
  name,
  stayOn,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  chatId: string;
  name: string;
  stayOn: string | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    deleteChat.bind(null, clinicId, chatId, stayOn),
    {},
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-chat-title"
        className="w-full max-w-sm rounded-3xl border border-line bg-paper p-5"
      >
        <h2 id="delete-chat-title" className="text-base font-medium">
          Eliminare questa chat?
        </h2>
        <p className="mt-2 text-sm text-muted">
          <span className="font-medium text-ink">{name}</span> viene cancellata, insieme ai
          messaggi. Un bot che non è in altre chat sparisce con lei.
        </p>
        {state.error ? <p className="mt-3 text-sm text-teal">{state.error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full border border-line px-4 text-sm"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            Elimina
          </button>
        </div>
      </form>
    </div>
  );
}
