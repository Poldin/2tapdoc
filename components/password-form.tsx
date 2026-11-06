"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setPassword } from "@/lib/auth/actions";
import { PasswordRules } from "@/components/password-rules";

export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [password, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  function openDialog() {
    setValue("");
    setConfirm("");
    setMessage(null);
    setSuccessBanner(false);
    setShowPassword(false);
    setShowConfirm(false);
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
    const result = await setPassword(password, confirm);
    setPending(false);
    if (result?.error) {
      setMessage(result.error);
      return;
    }
    setOpen(false);
    setValue("");
    setConfirm("");
    setSuccessBanner(true);
  }

  const fieldClass =
    "h-12 w-full rounded-xl border border-line bg-paper pl-3 pr-12 text-[15px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-violet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet";

  return (
    <section className="mt-10">
      <h2 className="text-sm text-muted">Password</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Usata per accedere con email. Conservala al sicuro; lo staff dello studio non la vede mai.
      </p>
      {successBanner ? (
        <p className="mt-3 text-sm text-violet" role="status">
          Password aggiornata.
        </p>
      ) : null}
      <button
        type="button"
        onClick={openDialog}
        className="mt-4 h-12 w-full rounded-full border border-line bg-paper px-5 text-[15px] font-medium text-ink transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
      >
        Cambia password
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
            aria-labelledby="password-dialog-title"
            className="w-full max-w-md rounded-[28px] border border-line bg-white p-6 shadow-[0_24px_60px_-28px_rgba(28,25,21,0.45)] sm:p-8"
          >
            <h2
              id="password-dialog-title"
              className="text-[clamp(1.5rem,3vw,1.85rem)] font-semibold tracking-[-0.03em]"
            >
              Nuova password
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Scegli una password forte che non usi altrove.
            </p>

            <div className="mt-6">
              <PasswordRules password={password} />
            </div>

            <label className="mt-6 flex flex-col gap-2 text-sm font-medium text-ink">
              Nuova password
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  autoFocus
                  value={password}
                  onChange={(event) => setValue(event.target.value)}
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-sand-deep hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="size-5" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Eye className="size-5" strokeWidth={1.75} aria-hidden />
                  )}
                </button>
              </div>
            </label>

            <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-ink">
              Ripeti la password
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-sand-deep hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
                  aria-label={showConfirm ? "Nascondi conferma password" : "Mostra conferma password"}
                  aria-pressed={showConfirm}
                >
                  {showConfirm ? (
                    <EyeOff className="size-5" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <Eye className="size-5" strokeWidth={1.75} aria-hidden />
                  )}
                </button>
              </div>
            </label>

            {message ? <p className="mt-4 text-sm text-violet">{message}</p> : null}

            <button
              type="submit"
              disabled={pending}
              className="mt-6 h-12 w-full rounded-full bg-violet text-[15px] font-medium text-white transition-colors hover:bg-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:opacity-50"
            >
              {pending ? "Salvataggio…" : "Salva la password"}
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
