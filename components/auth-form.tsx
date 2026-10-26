"use client";

import { useState } from "react";
import Link from "next/link";
import { resendSignupCode, signInWithPassword, signUpWithPassword, verifySignupCode } from "@/lib/auth/actions";
import { PasswordRules } from "@/components/password-rules";

const fieldClass =
  "h-12 rounded-xl border border-line bg-paper px-3 text-ink outline-none focus:border-teal";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const login = mode === "login";

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

  if (codeFor) {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 px-6">
        <form
          onSubmit={onVerify}
          role="dialog"
          aria-modal="true"
          aria-labelledby="otp-title"
          className="w-full max-w-md rounded-3xl bg-paper p-6"
        >
          <h2 id="otp-title" className="text-2xl font-semibold">
            Inserisci il codice
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ti abbiamo inviato un codice a <span className="text-ink">{codeFor}</span>.
          </p>
          <label className="mt-6 flex flex-col gap-2 text-sm">
            Codice
            <input
              name="token"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={128}
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
              className={`${fieldClass} font-mono`}
            />
          </label>
          {message ? <p className="mt-3 text-sm text-teal">{message}</p> : null}
          <button
            type="submit"
            disabled={pending || code.length === 0}
            className="mt-4 h-12 w-full rounded-full bg-teal text-teal-ink disabled:opacity-50"
          >
            {pending ? "Verifica…" : "Conferma"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onResend}
            className="mt-3 w-full text-sm text-muted"
          >
            Invia di nuovo il codice
          </button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
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
      <label className="flex flex-col gap-2 text-sm">
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
      {login ? null : <PasswordRules password={password} />}
      {message ? <p className="text-sm text-teal">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-full bg-teal text-teal-ink disabled:opacity-50"
      >
        {pending ? "Attendere…" : login ? "Entra" : "Crea l'account"}
      </button>
      <p className="text-sm text-muted">
        {login ? (
          <>
            Non hai un account?{" "}
            <Link href="/register" className="text-ink underline">
              Registrati
            </Link>
          </>
        ) : (
          <>
            Hai già un account?{" "}
            <Link href="/login" className="text-ink underline">
              Accedi
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
