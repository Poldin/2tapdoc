"use client";

import { useEffect, useState } from "react";
import { passkeyErrorMessage, webAuthnSupported } from "@/lib/auth/passkey";
import { createClient } from "@/lib/supabase/client";

type Passkey = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

const dateFormat = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormat.format(date);
}

export function PasskeySettings() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    const available = webAuthnSupported();
    setSupported(available);
    if (!available) return;

    const supabase = createClient();
    void supabase.auth.passkey.list().then(({ data, error }) => {
      if (error) {
        setMessage(passkeyErrorMessage(error));
        return;
      }
      setPasskeys(data ?? []);
    });
  }, []);

  async function onActivate() {
    setPending(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.registerPasskey();
    if (error) {
      setPending(false);
      setMessage(passkeyErrorMessage(error));
      return;
    }
    const { data: listed, error: listError } = await supabase.auth.passkey.list();
    setPending(false);
    if (listError) {
      if (data) setPasskeys((current) => [...current, data]);
      setMessage("Attivato su questo dispositivo.");
      return;
    }
    setPasskeys(listed ?? []);
    setMessage("Attivato su questo dispositivo.");
  }

  async function onRemove(passkeyId: string) {
    setRemoving(passkeyId);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.passkey.delete({ passkeyId });
    setRemoving(null);
    if (error) {
      setMessage(passkeyErrorMessage(error) ?? "Non è stato possibile rimuovere il dispositivo.");
      return;
    }
    setPasskeys((current) => current.filter((passkey) => passkey.id !== passkeyId));
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm text-muted">Questo dispositivo</h2>
      <p className="mt-3 text-sm leading-6">
        Di solito entri con email e password. Se attivi questa opzione, su questo telefono o
        computer puoi entrare con impronta, volto o PIN.
      </p>
      {supported ? (
        <>
          {passkeys.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {passkeys.map((passkey) => {
                const created = formatWhen(passkey.created_at);
                const used = passkey.last_used_at ? formatWhen(passkey.last_used_at) : "";
                return (
                  <li
                    key={passkey.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{passkey.friendly_name || "Dispositivo"}</p>
                      <p className="text-sm text-muted">
                        {created ? `Aggiunto il ${created}` : "Collegato"}
                        {used ? ` · ultimo accesso ${used}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={removing === passkey.id}
                      onClick={() => void onRemove(passkey.id)}
                      className="shrink-0 text-sm text-muted underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      {removing === passkey.id ? "Rimozione…" : "Rimuovi"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {message ? <p className="mt-3 text-sm text-violet">{message}</p> : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => void onActivate()}
            className="mt-4 h-12 rounded-full bg-violet px-5 text-[15px] font-medium text-white transition-colors hover:bg-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:opacity-50"
          >
            {pending ? "Attendere…" : "Attiva su questo dispositivo"}
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm">
          Questo browser non supporta impronta o passkey. Continui a entrare con la password.
        </p>
      )}
    </section>
  );
}
