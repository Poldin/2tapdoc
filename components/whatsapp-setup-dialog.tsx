"use client";

import { useEffect, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { saveWhatsAppCredentials } from "@/app/clinics/actions";

const idPattern = /^[0-9]{5,32}$/;
const webhookFallback = "https://2tapdoc.vercel.app/api/whatsapp";
const metaApps = "https://developers.facebook.com/apps";
const metaManager = "https://business.facebook.com/latest/whatsapp_manager/overview";

const steps = [
  { title: "Prepara su Meta", hint: "Il numero nasce lì, 2tapdoc lo usa dopo." },
  { title: "Gli ID", hint: "Due sequenze di cifre, non il +39." },
  { title: "Le chiavi", hint: "Token permanente e segreto della stessa app." },
  { title: "Verifica", hint: "Meta conferma, poi le chiavi restano sul server." },
] as const;

type Draft = {
  step: number;
  phoneNumberId: string;
  wabaId: string;
};

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

function readDraft(integrationId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(integrationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const phoneNumberId = digits(parsed.phoneNumberId);
    const wabaId = digits(parsed.wabaId);
    const step = Number(parsed.step);
    return {
      phoneNumberId,
      wabaId,
      step: Number.isInteger(step) ? step : 0,
    };
  } catch {
    return null;
  }
}

function writeDraft(integrationId: string, draft: Draft) {
  try {
    window.localStorage.setItem(storageKey(integrationId), JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}

function digits(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 32) : "";
}

function cleanToken(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "");
}

function webhookUrl() {
  if (typeof window === "undefined") return webhookFallback;
  const origin = window.location.origin;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) return webhookFallback;
  return `${origin}/api/whatsapp`;
}

function fieldClassName() {
  return "h-12 w-full min-w-0 rounded-xl border border-line bg-background px-3 text-sm outline-none focus:border-teal";
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-[0.06em] text-muted">{label}</p>
      <div className="flex gap-2">
        <p className="h-12 min-w-0 flex-1 truncate rounded-xl border border-line bg-background px-3 text-sm leading-[3rem]">
          {value || "—"}
        </p>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className="h-12 shrink-0 rounded-full border border-line px-4 text-sm disabled:opacity-50"
        >
          {copied ? "Copiato" : "Copia"}
        </button>
      </div>
    </div>
  );
}

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-1 break-all text-sm">{value}</p>
    </div>
  );
}

function MetaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-teal">
      {children}
    </a>
  );
}

export function WhatsAppSetupDialog({
  open,
  clinicId,
  integrationId,
  canManage,
  webhookVerifyToken,
  dropError,
  dropPending,
  dropAction,
  onClose,
  onLinkedNote,
}: {
  open: boolean;
  clinicId: string;
  integrationId: string;
  canManage: boolean;
  webhookVerifyToken: string;
  dropError?: string;
  dropPending: boolean;
  dropAction: (formData: FormData) => void;
  onClose: () => void;
  onLinkedNote?: (note: string) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [phoneHint, setPhoneHint] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [connectError, setConnectError] = useState<string>();
  const [stepError, setStepError] = useState<string>();
  const [hydrated, setHydrated] = useState(false);
  const [connectPending, startConnect] = useTransition();
  const webhook = webhookUrl();
  const idsReady = idPattern.test(phoneNumberId) && idPattern.test(wabaId);
  const keysReady = accessToken.trim().length >= 20 && appSecret.trim().length >= 8;
  const busy = connectPending || dropPending;
  const current = steps[step] ?? steps[0];

  useEffect(() => {
    if (!open) return;
    const draft = readDraft(integrationId);
    if (draft) {
      setPhoneNumberId(draft.phoneNumberId);
      setWabaId(draft.wabaId);
      setStep(draft.step >= 3 ? 2 : Math.min(Math.max(draft.step, 0), 2));
    }
    setHydrated(true);
  }, [open, integrationId]);

  useEffect(() => {
    if (!open || !hydrated) return;
    writeDraft(integrationId, { step, phoneNumberId, wabaId });
  }, [open, hydrated, integrationId, step, phoneNumberId, wabaId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  function setPhone(value: string) {
    setPhoneHint(/[+() ]/.test(value) && /\d/.test(value));
    setPhoneNumberId(digits(value));
    setStepError(undefined);
  }

  function setAccount(value: string) {
    setWabaId(digits(value));
    setStepError(undefined);
  }

  function go(next: number) {
    setConnectError(undefined);
    setStepError(undefined);
    if (next === 1) {
      setStep(1);
      return;
    }
    if (next === 2) {
      if (!idsReady) {
        setStepError("Servono due ID numerici, copiati dalla configurazione API.");
        return;
      }
      setStep(2);
      return;
    }
    if (next === 3) {
      if (!idsReady) {
        setStep(1);
        setStepError("Servono due ID numerici, copiati dalla configurazione API.");
        return;
      }
      if (!keysReady) {
        setStepError("Incolla un token permanente e il segreto della stessa app.");
        return;
      }
      setStep(3);
      return;
    }
    setStep(Math.max(0, next));
  }

  function onFieldKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, next: number) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (busy) return;
    if (next === 4) {
      verify();
      return;
    }
    go(next);
  }

  function verify() {
    if (!idsReady || !keysReady || busy) return;
    setConnectError(undefined);
    startConnect(async () => {
      const result = await saveWhatsAppCredentials(clinicId, integrationId, {
        phoneNumberId,
        wabaId,
        accessToken: cleanToken(accessToken),
        appSecret: appSecret.trim(),
      });
      setConnectError(result.error);
      if (!result.error || result.error.startsWith("Numero collegato")) {
        clearWhatsAppSetupDraft(integrationId);
        setAccessToken("");
        setAppSecret("");
        if (result.error) onLinkedNote?.(result.error);
      }
      router.refresh();
    });
  }

  const primaryLabel =
    step === 3
      ? connectPending
        ? "Verifica con Meta…"
        : "Verifica e collega"
      : step === 0
        ? "Ho preparato Meta"
        : "Continua";
  const primaryDisabled =
    busy || (step === 1 && !idsReady) || (step === 2 && !keysReady) || (step === 3 && (!idsReady || !keysReady));

  function onPrimary() {
    if (step === 3) verify();
    else go(step + 1);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-setup-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-paper p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="whatsapp-setup-title" className="text-base font-medium">
              WhatsApp
            </h2>
            <p className="mt-1 text-xs font-medium tracking-[0.06em] text-muted">
              {step + 1} di {steps.length} · {current.title}
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            disabled={busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="thread-scroll mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <p className="text-sm text-muted">{current.hint}</p>

          {step === 0 ? (
            <>
              <div className="flex aspect-video items-center justify-center rounded-2xl bg-background">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper">
                  <Play className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <p className="text-sm">
                2tapdoc non crea l&apos;account WhatsApp. Usa un numero che su Meta è già dello studio: fatture,
                nome visibile e limiti restano lì.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  "Un Business Portfolio.",
                  "Un account WhatsApp con il numero già verificato.",
                  "Un metodo di pagamento su quel conto. Meta addebita le conversazioni allo studio.",
                  "Un'app Meta con WhatsApp. Da lì escono token e segreto.",
                ].map((item, index) => (
                  <div key={item} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs text-muted">
                      {index + 1}
                    </span>
                    <p className="text-sm">{item}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                <MetaLink href={metaManager}>Gestore WhatsApp</MetaLink>
                <span className="text-muted"> · </span>
                <MetaLink href={metaApps}>App Meta</MetaLink>
              </p>
              <p className="text-sm text-muted">
                Puoi completarli in un&apos;altra scheda. Qui il punto in cui sei resta salvato, tranne token e
                segreto.
              </p>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className="text-sm">
                Aprili in <span className="whitespace-nowrap">App Meta → WhatsApp → Configurazione API</span>.
                Phone number ID e WhatsApp Business Account ID sono cifre. Se incolli il +39, non è quello.
              </p>
              <label className="flex flex-col gap-2 text-sm">
                ID del numero
                <input
                  value={phoneNumberId}
                  onChange={(event) => setPhone(event.target.value)}
                  onKeyDown={(event) => onFieldKeyDown(event, 2)}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className={fieldClassName()}
                />
              </label>
              {phoneHint ? (
                <p className="text-sm text-muted">
                  Quello è il numero in chiaro. Serve l&apos;ID, una sequenza lunga, nella configurazione API.
                </p>
              ) : null}
              <label className="flex flex-col gap-2 text-sm">
                ID dell&apos;account WhatsApp
                <input
                  value={wabaId}
                  onChange={(event) => setAccount(event.target.value)}
                  onKeyDown={(event) => onFieldKeyDown(event, 2)}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  className={fieldClassName()}
                />
              </label>
              <p className="text-sm">
                <MetaLink href={metaApps}>Apri le app Meta</MetaLink>
              </p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="text-sm">
                Non usare il token della configurazione API: scade in poche ore. Serve un token di un{" "}
                <span className="whitespace-nowrap">utente di sistema</span>, senza scadenza, e il segreto della
                stessa app.
              </p>
              <div className="flex flex-col gap-2 text-sm text-muted">
                <p>1. Meta Business Suite → Impostazioni → Utenti di sistema.</p>
                <p>2. Crea un utente e assegnagli l&apos;app e l&apos;account WhatsApp, con controllo completo.</p>
                <p>3. Genera token con whatsapp_business_management e whatsapp_business_messaging.</p>
                <p>4. Scadenza: mai. Poi App Meta → Impostazioni → Base → Chiave segreta.</p>
              </div>
              <label className="flex flex-col gap-2 text-sm">
                Token
                <input
                  type="password"
                  value={accessToken}
                  onChange={(event) => {
                    setAccessToken(cleanToken(event.target.value));
                    setStepError(undefined);
                  }}
                  onKeyDown={(event) => onFieldKeyDown(event, 3)}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className={fieldClassName()}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                Segreto dell&apos;app
                <input
                  type="password"
                  value={appSecret}
                  onChange={(event) => {
                    setAppSecret(event.target.value);
                    setStepError(undefined);
                  }}
                  onKeyDown={(event) => onFieldKeyDown(event, 3)}
                  autoComplete="off"
                  spellCheck={false}
                  className={fieldClassName()}
                />
              </label>
              <div className="flex flex-col gap-3 rounded-2xl bg-background p-4">
                <p className="text-sm">
                  Sull&apos;app Meta, in Webhook, incolla questi due valori. Campo da attivare: messages.
                </p>
                <CopyRow label="URL" value={webhook} />
                <CopyRow label="Token di verifica" value={webhookVerifyToken} />
                {!webhookVerifyToken ? (
                  <p className="text-sm text-muted">Manca il token di verifica sulla piattaforma.</p>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Recap label="ID del numero" value={phoneNumberId} />
              <Recap label="ID dell'account WhatsApp" value={wabaId} />
              <Recap label="Chiavi" value="Token e segreto pronti. Restano sul server, non in questa pagina." />
              <Recap
                label="Webhook"
                value="Se sull'app Meta non hai ancora messo URL e token, i messaggi in arrivo non arrivano."
              />
              <p className="text-sm text-muted">
                Se Meta non riconosce i dati, torna alle chiavi: token e segreto devono appartenere alla stessa app
                degli ID.
              </p>
            </>
          ) : null}

          {stepError ? (
            <p className="text-sm text-teal" aria-live="polite">
              {stepError}
            </p>
          ) : null}
          {connectError ? (
            <p className="text-sm text-teal" aria-live="polite">
              {connectError}
            </p>
          ) : null}
          {dropError ? <p className="text-sm text-teal">{dropError}</p> : null}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => go(step - 1)}
                disabled={busy}
                className="h-12 min-w-0 flex-1 rounded-full border border-line text-sm disabled:opacity-50"
              >
                Indietro
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                onClick={onPrimary}
                disabled={primaryDisabled}
                className="h-12 min-w-0 flex-1 rounded-full bg-teal text-sm text-teal-ink disabled:opacity-50"
              >
                {primaryLabel}
              </button>
            ) : (
              <p className="flex h-12 flex-1 items-center text-sm text-muted">In attesa del collegamento.</p>
            )}
          </div>
          {canManage ? (
            <form action={dropAction}>
              <button
                type="submit"
                disabled={busy}
                className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50"
              >
                {dropPending ? "Rimozione…" : "Rimuovi"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
