"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FingerprintPattern } from "lucide-react";
import {
  requestPasswordReset,
  resendSignupCode,
  signInWithPassword,
  signUpWithPassword,
  verifySignupCode,
} from "@/lib/auth/actions";
import { passkeyErrorMessage, webAuthnSupported } from "@/lib/auth/passkey";
import { PasswordRules } from "@/components/password-rules";
import { createClient } from "@/lib/supabase/client";

const fieldClass =
  "h-12 rounded-full border border-line bg-sand px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-violet focus:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet";

const primaryButton =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-violet px-6 text-[15px] font-medium text-white transition-colors hover:bg-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:opacity-50";

const secondaryButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:opacity-50";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const login = mode === "login";

  useEffect(() => {
    if (!login) return;
    setPasskeyReady(webAuthnSupported());
  }, [login]);

  function openReset() {
    setResetEmail(email);
    setResetMessage(null);
    setResetSent(false);
    setResetOpen(true);
  }

  function closeReset() {
    if (resetPending) return;
    setResetOpen(false);
  }

  useEffect(() => {
    if (!resetOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !resetPending) setResetOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [resetOpen, resetPending]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = login
      ? await signInWithPassword(email, password)
      : await signUpWithPassword(email, password);
    setPending(false);
    if (result?.needsCode && result.email) {
      setCodeFor(result.email);
      return;
    }
    if (result?.error) setMessage(result.error);
  }

  async function onVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!codeFor) return;
    setPending(true);
    setMessage(null);
    const result = await verifySignupCode(codeFor, code);
    setPending(false);
    if (result?.error) setMessage(result.error);
  }

  async function onResend() {
    if (!codeFor) return;
    setPending(true);
    setMessage(null);
    const result = await resendSignupCode(codeFor);
    setPending(false);
    setMessage(result.error ?? "Ti abbiamo inviato un nuovo codice.");
  }

  async function onPasskey() {
    setPasskeyPending(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPasskey();
    if (error) {
      setPasskeyPending(false);
      setMessage(passkeyErrorMessage(error));
      return;
    }
    window.location.assign("/clinics");
  }

  async function onReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetPending(true);
    setResetMessage(null);
    const result = await requestPasswordReset(resetEmail);
    setResetPending(false);
    if (result?.error) {
      setResetMessage(result.error);
      return;
    }
    setResetSent(true);
  }

  if (codeFor) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-5 backdrop-blur-[2px]">
        <form
          onSubmit={onVerify}
          role="dialog"
          aria-modal="true"
          aria-labelledby="otp-title"
          className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-[0_24px_60px_-28px_rgba(28,25,21,0.45)] sm:p-8"
        >
          <h2 id="otp-title" className="text-[clamp(1.5rem,3vw,1.85rem)] font-semibold tracking-[-0.03em]">
            Inserisci il codice
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Ti abbiamo inviato un codice a <span className="font-medium text-ink">{codeFor}</span>.
          </p>
          <label className="mt-6 flex flex-col gap-2 text-sm font-medium text-ink">
            Codice
            <input
              name="token"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={128}
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
              className={`${fieldClass} font-mono tracking-[0.18em]`}
            />
          </label>
          {message ? <p className="mt-3 text-sm text-violet">{message}</p> : null}
          <button type="submit" disabled={pending || code.length === 0} className={`mt-6 ${primaryButton}`}>
            {pending ? "Verifica…" : "Conferma"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onResend}
            className="mt-3 w-full text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-50"
          >
            Invia di nuovo il codice
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Email
        <input
          name="email"
          type="email"
          autoComplete={login ? "username" : "email"}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Password
        <input
          name="password"
          type="password"
          autoComplete={login ? "current-password" : "new-password"}
          required
          minLength={login ? undefined : 8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
      </label>
      {login ? (
        <button
          type="button"
          onClick={openReset}
          className="-mt-1 self-end text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Password dimenticata?
        </button>
      ) : (
        <PasswordRules password={password} />
      )}
      {message ? <p className="text-sm text-violet">{message}</p> : null}
      <button type="submit" disabled={pending || passkeyPending} className={`mt-2 ${primaryButton}`}>
        {pending ? "Attendere…" : login ? "Entra" : "Crea l’account"}
      </button>
      {login && passkeyReady ? (
        <button
          type="button"
          disabled={pending || passkeyPending}
          onClick={() => void onPasskey()}
          className={secondaryButton}
        >
          {passkeyPending ? (
            "Attendere…"
          ) : (
            <>
              Entra con dispositivo
              <FingerprintPattern aria-hidden className="size-[18px]" strokeWidth={1.75} />
            </>
          )}
        </button>
      ) : null}
      <p className="text-center text-sm leading-6 text-muted">
        {login ? (
          <>
            Non hai un account?{" "}
            <Link href="/register" className="font-medium text-ink underline-offset-4 hover:underline">
              Registrati
            </Link>
          </>
        ) : (
          <>
            Hai già un account?{" "}
            <Link href="/login" className="font-medium text-ink underline-offset-4 hover:underline">
              Accedi
            </Link>
          </>
        )}
      </p>
    </form>
      {resetOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-5 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReset();
          }}
        >
          <form
            onSubmit={onReset}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-[0_24px_60px_-28px_rgba(28,25,21,0.45)] sm:p-8"
          >
            <h2 id="reset-title" className="text-[clamp(1.5rem,3vw,1.85rem)] font-semibold tracking-[-0.03em]">
              Recupera la password
            </h2>
            {resetSent ? (
              <>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Se <span className="font-medium text-ink">{resetEmail}</span> è registrata, ti abbiamo
                  inviato un messaggio con le istruzioni per scegliere una nuova password.
                </p>
                <button type="button" onClick={closeReset} className={`mt-6 ${primaryButton}`}>
                  Chiudi
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Inserisci l’email dell’account. Ti inviamo un messaggio per impostare una nuova password.
                </p>
                <label className="mt-6 flex flex-col gap-2 text-sm font-medium text-ink">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    className={fieldClass}
                  />
                </label>
                {resetMessage ? <p className="mt-3 text-sm text-violet">{resetMessage}</p> : null}
                <button type="submit" disabled={resetPending} className={`mt-6 ${primaryButton}`}>
                  {resetPending ? "Invio…" : "Invia l’email"}
                </button>
                <button
                  type="button"
                  disabled={resetPending}
                  onClick={closeReset}
                  className="mt-3 w-full text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-50"
                >
                  Annulla
                </button>
              </>
            )}
          </form>
        </div>
      ) : null}
    </>
  );
}
