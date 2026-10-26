"use client";

import { useActionState, useEffect, useState } from "react";
import { createChat, updateChat, type FormState } from "@/app/clinics/actions";
import { ChannelMark } from "@/components/mark";
import { channelSymbols, markColors } from "@/lib/marks";

export type ChatDraft = {
  chatId: string;
  title: string;
  color: string;
  emoji: string;
};

export function ChatDialog({
  open,
  clinicId,
  draft = null,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  draft?: ChatDraft | null;
  onClose: () => void;
}) {
  const [color, setColor] = useState(draft?.color ?? "teal");
  const [emoji, setEmoji] = useState(draft?.emoji ?? "speechbubble");
  const [state, action, pending] = useActionState<FormState, FormData>(
    draft ? updateChat.bind(null, clinicId, draft.chatId) : createChat.bind(null, clinicId),
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
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-dialog-title"
        className="flex max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-paper p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="chat-dialog-title" className="text-base font-medium">
              {draft ? "Modifica conversazione" : "Nuova conversazione"}
            </h2>
            <p className="mt-1 text-sm text-muted">Un cerchio colorato e un simbolo, non una faccia.</p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-3">
          <ChannelMark color={color} emoji={emoji} animate className="h-12 w-12" />
          <input
            name="title"
            autoFocus
            maxLength={80}
            defaultValue={draft?.title ?? ""}
            placeholder="Titolo"
            aria-label="Titolo della chat"
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-background px-3 text-sm outline-none focus:border-teal"
          />
        </div>

        <fieldset>
          <legend className="text-sm text-muted">Colore</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {markColors.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-pressed={color === item.id}
                onClick={() => setColor(item.id)}
                className={`h-8 w-8 rounded-full ${color === item.id ? "ring-2 ring-ink ring-offset-2" : ""}`}
                style={{ background: item.value }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm text-muted">Simbolo</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {channelSymbols.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-pressed={emoji === item.id}
                onClick={() => setEmoji(item.id)}
                className={`rounded-full ${emoji === item.id ? "ring-2 ring-ink ring-offset-1" : ""}`}
              >
                <ChannelMark color={color} emoji={item.id} className="h-7 w-7" />
              </button>
            ))}
          </div>
        </fieldset>

        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="emoji" value={emoji} />

        <button
          type="submit"
          disabled={pending}
          className="h-10 self-start rounded-full bg-teal px-4 text-sm text-teal-ink disabled:opacity-50"
        >
          {draft ? "Salva" : "Apri"}
        </button>
        {state.error ? <p className="text-sm text-teal">{state.error}</p> : null}
      </form>
    </div>
  );
}
