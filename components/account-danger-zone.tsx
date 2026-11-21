"use client";

import { useEffect, useState } from "react";
import { deleteAccount } from "@/lib/auth/actions";

export function AccountDangerZone({ accountEmail }: { accountEmail: string }) {
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  function openDialog() {
    setEmailInput("");
    setMessage(null);
    setOpen(true);
  }

  function closeDialog() {
    if (pending) return;
    setOpen(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await deleteAccount(emailInput);
    setPending(false);
    if (result?.error) setMessage(result.error);
    // success: server redirect; no client state update needed
  }

  const fieldClass =
    "h-12 w-full rounded-xl border border-line bg-paper px-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600";

  return (
    <section className="mt-10 rounded-2xl border border-red-200 bg-red-50/80 p-5">
      <h2 className="text-sm font-medium text-red-900">Zona pericolosa</h2>
      <p className="mt-2 text-sm leading-6 text-red-900/85">
        Elimina definitivamente il tuo account Clinico. Perderai l’accesso; le clinche di cui facevi parte potrebbero
        trattenere dati necessari per obblighi di legge o per il funzionamento della clinica.
      </p>
      <button
        type="button"
        onClick={openDialog}
        className="mt-4 h-12 w-full rounded-full bg-red-600 px-5 text-[15px] font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        Elimina account
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-5 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <form
            onSubmit={onSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-[0_24px_60px_-28px_rgba(28,25,21,0.45)] sm:p-8"
          >
            <h2
              id="delete-account-title"
              className="text-[clamp(1.5rem,3vw,1.85rem)] font-semibold tracking-[-0.03em] text-red-900"
            >
              Eliminare l’account?
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Questa azione non si può annullare. Conferma inserendo il tuo indirizzo email:{" "}
              <span className="font-medium text-ink">{accountEmail}</span>
            </p>
            <label className="mt-6 flex flex-col gap-2 text-sm font-medium text-ink">
              La tua email
              <input
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder={accountEmail}
                className={fieldClass}
              />
            </label>
            {message ? <p className="mt-4 text-sm font-medium text-red-700">{message}</p> : null}
            <button
              type="submit"
              disabled={pending}
              className="mt-6 h-12 w-full rounded-full bg-red-600 text-[15px] font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-50"
            >
              {pending ? "Eliminazione…" : "Elimina definitivamente"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={closeDialog}
              className="mt-3 w-full text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-50"
            >
              Annulla
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
