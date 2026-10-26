"use client";

import { useActionState, useEffect } from "react";
import { createClinic, type FormState } from "@/app/clinics/actions";

export function ClinicDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createClinic, {});

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
        aria-labelledby="clinic-dialog-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-paper p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="clinic-dialog-title" className="text-base font-medium">
              Nuova clinica
            </h2>
            <p className="mt-1 text-sm text-muted">Dai un nome alla clinica.</p>
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
        <label className="flex flex-col gap-2 text-sm">
          Nome della clinica
          <input
            name="name"
            required
            maxLength={80}
            autoFocus
            className="h-12 rounded-xl border border-line bg-background px-3 outline-none focus:border-teal"
          />
        </label>
        {state.error ? <p className="text-sm text-teal">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-full bg-teal text-teal-ink disabled:opacity-50"
        >
          {pending ? "Creazione…" : "Crea la clinica"}
        </button>
      </form>
    </div>
  );
}
