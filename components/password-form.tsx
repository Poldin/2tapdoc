"use client";

import { useState } from "react";
import { setPassword } from "@/lib/auth/actions";
import { PasswordRules } from "@/components/password-rules";

export function PasswordForm() {
  const [password, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await setPassword(password, confirm);
    setPending(false);
    if (result?.error) setMessage(result.error);
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 flex flex-col gap-4">
      <h2 className="text-sm text-muted">Password</h2>
      <PasswordRules password={password} />
      <label className="flex flex-col gap-2 text-sm">
        Nuova password
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setValue(event.target.value)}
          className="h-12 rounded-xl border border-line bg-paper px-3 outline-none focus:border-teal"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Ripeti la password
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="h-12 rounded-xl border border-line bg-paper px-3 outline-none focus:border-teal"
        />
      </label>
      {message ? <p className="text-sm text-teal">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-full bg-teal text-teal-ink disabled:opacity-50"
      >
        {pending ? "Salvataggio…" : "Imposta la password"}
      </button>
    </form>
  );
}
