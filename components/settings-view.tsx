"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  FileText,
  FolderOpen,
  Globe,
  IdCard,
  List,
  Mail,
  MessageCircle,
  Phone,
  Pill,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { BotGlyph } from "@/components/mark";
import { clearWhatsAppSetupDraft, WhatsAppSetupDialog } from "@/components/whatsapp-setup-dialog";
import {
  addClinicMember,
  createClinicalObject,
  createDoctor,
  createIntegration,
  createRole,
  deleteClinic,
  dropIntegration,
  loadClinicTokenAccount,
  setClinicTokenBudget,
  updateClinic,
  updateClinicalObject,
  updateDoctor,
  updateMember,
  updateRole,
  type CreatedChat,
  type FormState,
} from "@/app/clinics/actions";
import { formatTokenCount } from "@/lib/agent-steps";
import { permissionCatalog, permissionKeys, permissionLabel } from "@/lib/permissions";
import type { ClinicTokenAccount, OnDemandMode } from "@/lib/token-account";
import { clinicPricingPlans } from "@/components/pricing-plans";

export type ClinicMember = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  roleId: string;
  role: string;
};

export type ClinicRole = {
  id: string;
  name: string;
  admin: boolean;
  permissions: string[];
};

export type Specialist = {
  id: string;
  givenName: string;
  familyName: string;
  specialization: string | null;
  userId: string | null;
  active: boolean;
};

export type ClinicAsset = {
  id: string;
  name: string;
  description: string | null;
};

const sections = [
  { id: "generali", label: "generali" },
  { id: "equipe", label: "equipe" },
  { id: "assets", label: "stanze e oggetti" },
  { id: "integrazioni", label: "integrazioni" },
  { id: "elimina", label: "elimina" },
] as const;

export type ClinicBot = {
  id: string;
  name: string;
  color: string;
  emoji: string;
};

export type ClinicIntegration = {
  id: string;
  provider: string;
  account: string;
  status: string;
  whatsapp: { creditCents: number; messageCount: number } | null;
};

const toolCatalog = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    body: "I pazienti scrivono allo studio. L'assistente risponde da questo numero.",
    available: true,
  },
  {
    id: "public_page",
    label: "Pagina pubblica",
    body: "Una pagina dello studio, aperta a chi arriva dal link.",
    available: true,
  },
  {
    id: "gmail",
    label: "Gmail",
    body: "La posta dello studio nello stesso assistente.",
    available: false,
  },
  {
    id: "phone",
    label: "Telefono",
    body: "Le chiamate seguono lo stesso modo di rispondere e di prenotare.",
    available: false,
  },
  {
    id: "reminders",
    label: "Promemoria",
    body: "Conferme, spostamenti e richiami degli appuntamenti.",
    available: false,
  },
  {
    id: "records",
    label: "Cartelle",
    body: "Nota, allegati e storia di ogni visita.",
    available: false,
  },
  {
    id: "price_list",
    label: "Listino",
    body: "Le prestazioni dello studio e i loro prezzi.",
    available: false,
  },
  {
    id: "register",
    label: "Cassa",
    body: "Incassato e da incassare, sull'appuntamento.",
    available: false,
  },
  {
    id: "invoices",
    label: "Fatture",
    body: "La fattura in PDF per il paziente.",
    available: false,
  },
  {
    id: "tessera_sanitaria",
    label: "Tessera sanitaria",
    body: "L'invio delle spese sanitarie al Sistema TS.",
    available: false,
  },
  {
    id: "reports",
    label: "Referti",
    body: "Il documento clinico firmato, da pubblicare sull'FSE.",
    available: false,
  },
  {
    id: "prescriptions",
    label: "Ricette",
    body: "Le prescrizioni del medico.",
    available: false,
  },
  {
    id: "consents",
    label: "Consensi",
    body: "Contatto, privacy e opposizione, sulla scheda del paziente.",
    available: false,
  },
] as const;

const toolIcons = {
  whatsapp: MessageCircle,
  public_page: Globe,
  gmail: Mail,
  phone: Phone,
  reminders: Bell,
  records: FolderOpen,
  price_list: List,
  register: Wallet,
  invoices: Receipt,
  tessera_sanitaria: IdCard,
  reports: FileText,
  prescriptions: Pill,
  consents: ShieldCheck,
} as const;

function integrationLabel(provider: string) {
  return toolCatalog.find((tool) => tool.id === provider)?.label ?? provider;
}

function integrationStatus(integration: ClinicIntegration) {
  if (integration.provider === "public_page" && integration.status === "connected") return "Attiva";
  if (integration.status === "connected") return "Collegato";
  if (integration.status === "pending") return "Da collegare";
  return integration.status;
}

function integrationSummary(integration: ClinicIntegration) {
  if (integration.provider === "public_page" && integration.account.trim()) return `/p/${integration.account.trim()}`;
  return integration.account.trim() || "—";
}

function euro(cents: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function syncSectionBadge(
  thread: HTMLDivElement,
  badge: HTMLParagraphElement | null,
  setLabel: (value: string) => void,
) {
  const pins = [...thread.querySelectorAll<HTMLElement>("[data-section]")];
  if (!badge || pins.length === 0) {
    setLabel(sections[0].label);
    return;
  }
  const line = badge.getBoundingClientRect().bottom;
  let active = pins[0].dataset.section ?? sections[0].label;
  for (const pin of pins) {
    const box = pin.getBoundingClientRect();
    if (box.top <= line) {
      active = pin.dataset.section ?? active;
      const covered = line - box.top;
      pin.style.opacity = String(1 - Math.min(1, Math.max(0, covered / Math.max(box.height, 1))));
    } else {
      pin.style.opacity = "1";
    }
  }
  setLabel(active);
}

function useCloseWhenSent(open: boolean, sent: number | undefined, onClose: () => void) {
  const seen = useRef(sent);
  useEffect(() => {
    if (!open) {
      seen.current = sent;
      return;
    }
    if (sent && sent !== seen.current) {
      seen.current = sent;
      onClose();
    }
  }, [open, sent, onClose]);
}

function specialistName(specialist: Specialist) {
  return `${specialist.givenName} ${specialist.familyName}`.replace(/\s+/g, " ").trim();
}

function memberLabel(member: ClinicMember) {
  return member.name?.trim() || member.email;
}

function fieldClassName() {
  return "h-12 w-full min-w-0 rounded-xl border border-line bg-background px-3 text-sm outline-none focus:border-teal";
}

function DataTable({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-paper">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 text-xs font-medium tracking-[0.06em] text-muted">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ columns, children }: { columns: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-8 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}

function TableHeading({
  title,
  pin,
  onAdd,
  canAdd,
}: {
  title: string;
  pin?: string;
  onAdd?: () => void;
  canAdd?: boolean;
}) {
  return (
    <div className="relative flex min-h-10 items-center justify-center">
      <div {...(pin ? { "data-section": pin } : {})}>
        <span className={pin ? "text-sm text-date" : "text-sm font-medium"}>{title}</span>
      </div>
      {canAdd && onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="absolute right-0 top-1/2 h-10 -translate-y-1/2 rounded-full border border-line bg-paper px-4 text-sm"
        >
          Aggiungi
        </button>
      ) : null}
    </div>
  );
}

function SettingsDialog({
  open,
  title,
  onClose,
  action,
  pending,
  error,
  submitLabel,
  allowSubmit = true,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  submitLabel: string;
  allowSubmit?: boolean;
  children: ReactNode;
}) {
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
        aria-labelledby="settings-dialog-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-paper p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="settings-dialog-title" className="text-base font-medium">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none"
          >
            ×
          </button>
        </div>
        {children}
        {error ? <p className="text-sm text-teal">{error}</p> : null}
        {allowSubmit ? (
          <button
            type="submit"
            disabled={pending}
            className="h-12 rounded-full bg-teal text-teal-ink disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : submitLabel}
          </button>
        ) : (
          <button type="button" onClick={onClose} className="h-12 rounded-full bg-ink px-4 text-sm text-paper">
            Chiudi
          </button>
        )}
      </form>
    </div>
  );
}

function ClinicNameForm({ clinicId, clinicName, canRename }: { clinicId: string; clinicName: string; canRename: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateClinic.bind(null, clinicId),
    {},
  );
  const [name, setName] = useState(clinicName);
  const [seenName, setSeenName] = useState(clinicName);
  if (seenName !== clinicName) {
    setSeenName(clinicName);
    setName(clinicName);
  }
  const dirty = name.trim() !== clinicName.trim() && name.trim() !== "";

  if (!canRename) {
    return (
      <div className="rounded-2xl bg-paper px-4 py-4">
        <p className="text-xs font-medium tracking-[0.06em] text-muted">Nome della clinica</p>
        <p className="mt-2 text-base font-medium">{clinicName}</p>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl bg-paper px-4 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-xs font-medium tracking-[0.06em] text-muted">Nome della clinica</span>
          <input
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`mt-2 ${fieldClassName()}`}
          />
        </label>
        <button
          type="submit"
          disabled={pending || !dirty}
          className="h-12 shrink-0 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
        >
          {pending ? "Salvataggio…" : "Salva"}
        </button>
      </div>
      {state.error ? <p className="mt-3 text-sm text-teal">{state.error}</p> : null}
    </form>
  );
}

const renewalDate = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Rome",
});

const usageUpdatedAt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

function centsToField(cents: number) {
  return (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const onDemandModes: { id: OnDemandMode; label: string }[] = [
  { id: "disabled", label: "Disattivato" },
  { id: "fixed", label: "Importo fisso" },
  { id: "unlimited", label: "Senza limite" },
];

function UsageBar({ ratio }: { ratio: number }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-teal" style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }} />
    </div>
  );
}

function TokenAccountCard({ clinicId, account }: { clinicId: string; account: ClinicTokenAccount }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    setClinicTokenBudget.bind(null, clinicId),
    {},
  );
  const [shown, setShown] = useState(account);
  const [mode, setMode] = useState<OnDemandMode>(account.onDemand);
  const [limit, setLimit] = useState(centsToField(account.spendLimitCents));
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [seenAccount, setSeenAccount] = useState(`${account.onDemand}:${account.spendLimitCents}:${account.usedTokens}:${account.usageUpdatedAt}`);
  const accountKey = `${account.onDemand}:${account.spendLimitCents}:${account.usedTokens}:${account.usageUpdatedAt}`;
  if (seenAccount !== accountKey) {
    setSeenAccount(accountKey);
    setShown(account);
    setMode(account.onDemand);
    setLimit(centsToField(account.spendLimitCents));
  }

  const planName = clinicPricingPlans.find((plan) => plan.id === shown.planId)?.name ?? shown.planId;
  const includedUsed = Math.min(shown.usedTokens, shown.includedTokens);
  const includedRatio = shown.includedTokens === 0 ? 1 : includedUsed / shown.includedTokens;
  const renews = renewalDate.format(new Date(shown.renewsAt));
  const rate = euro(shown.centsPerMillion);
  const dirty =
    mode !== shown.onDemand || (mode === "fixed" && limit !== centsToField(shown.spendLimitCents));
  const demandRatio = shown.spendLimitCents === 0 ? 1 : shown.onDemandCents / shown.spendLimitCents;
  const updatedLabel = shown.usageUpdatedAt
    ? usageUpdatedAt.format(new Date(shown.usageUpdatedAt))
    : "nessun consumo";

  return (
    <div className="rounded-2xl bg-paper px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.06em] text-muted">Uso incluso</p>
        <button
          type="button"
          onClick={() => {
            setRefreshError(null);
            startRefresh(async () => {
              const result = await loadClinicTokenAccount(clinicId);
              if (!result.account) {
                setRefreshError(result.error ?? "Non è stato possibile aggiornare l'uso.");
                return;
              }
              setShown(result.account);
              setMode(result.account.onDemand);
              setLimit(centsToField(result.account.spendLimitCents));
            });
          }}
          disabled={refreshing}
          title={shown.usageUpdatedAt ? `Ultimo aggiornamento: ${updatedLabel}` : "Nessun consumo in questo periodo"}
          aria-label={
            shown.usageUpdatedAt
              ? `Aggiorna l'uso incluso. Ultimo aggiornamento: ${updatedLabel}`
              : "Aggiorna l'uso incluso. Nessun consumo in questo periodo"
          }
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs text-muted hover:bg-background disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2} />
          {updatedLabel}
        </button>
      </div>
      {refreshError ? <p className="mt-2 text-sm text-teal">{refreshError}</p> : null}
      <p className="mt-2 text-base font-medium">
        {formatTokenCount(includedUsed) || "0"} di {formatTokenCount(shown.includedTokens) || "0"}
      </p>
      <UsageBar ratio={includedRatio} />
      <p className="mt-3 text-sm text-muted">
        Piano {planName}. Si rinnova il {renews}. Comprende le risposte, i tool e la pagina pubblica.
      </p>

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs font-medium tracking-[0.06em] text-muted">Uso su richiesta</p>
        <p className="mt-2 text-base font-medium">
          {shown.onDemand === "disabled"
            ? "Disattivato"
            : shown.onDemand === "unlimited"
              ? `${euro(shown.onDemandCents)} · senza limite`
              : `${euro(shown.onDemandCents)} di ${euro(shown.spendLimitCents)}`}
        </p>
        {shown.onDemand === "fixed" ? <UsageBar ratio={demandRatio} /> : null}
        <p className="mt-3 text-sm text-muted">
          Parte quando finiscono i token del piano. Costa {rate} per milione di token.
        </p>
      </div>

      {shown.canEdit ? (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <label className="text-sm">
            Limite mensile
            <select
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as OnDemandMode)}
              className={`mt-2 ${fieldClassName()}`}
            >
              {onDemandModes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {mode === "fixed" ? (
            <label className="text-sm">
              Importo
              <input
                name="euros"
                inputMode="decimal"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                className={`mt-2 ${fieldClassName()}`}
              />
            </label>
          ) : (
            <input type="hidden" name="euros" value="0" />
          )}
          <p className="text-sm text-muted">
            Disattivato ferma l'uso a fine piano. Un importo fisso è il massimo che questo mese può andare oltre. Senza
            limite non si ferma. Al rinnovo il consumo torna a zero e il limite resta.
          </p>
          <button
            type="submit"
            disabled={pending || !dirty}
            className="h-10 self-start rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            {pending ? "Salvataggio…" : "Salva"}
          </button>
          {state.error ? <p className="text-sm text-teal">{state.error}</p> : null}
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted">Il limite lo cambia l'admin della clinica.</p>
      )}
    </div>
  );
}

function rolePermissionSummary(role: ClinicRole) {
  if (role.admin) return "Tutti i permessi";
  if (role.permissions.length === 0) return "Nessun permesso";
  const labels = role.permissions.map((key) => permissionLabel(key));
  if (labels.length <= 2) return labels.join(" · ");
  return `${labels.slice(0, 2).join(" · ")} · +${labels.length - 2}`;
}

function RoleDialog({
  open,
  clinicId,
  draft,
  readOnly,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  draft: ClinicRole | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    draft ? updateRole.bind(null, clinicId, draft.id) : createRole.bind(null, clinicId),
    {},
  );
  const selected = new Set(draft?.admin ? permissionKeys : (draft?.permissions ?? []));
  useCloseWhenSent(open, state.sent, onClose);

  return (
    <SettingsDialog
      open={open}
      title={draft ? (readOnly ? "Ruolo admin" : "Modifica ruolo") : "Nuovo ruolo"}
      onClose={onClose}
      action={action}
      pending={pending}
      error={state.error}
      submitLabel={draft ? "Salva" : "Aggiungi"}
      allowSubmit={!readOnly}
    >
      {readOnly ? (
        <p className="text-sm text-muted">
          L’admin ha tutte le chiavi. Non si cancella e non si modifica.
        </p>
      ) : null}
      <label className="flex flex-col gap-2 text-sm">
        Nome
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={draft?.name ?? ""}
          disabled={readOnly}
          autoFocus={!readOnly}
          className={fieldClassName()}
        />
      </label>
      <fieldset className="flex flex-col gap-2" disabled={readOnly}>
        <legend className="text-sm">Permessi</legend>
        <p className="text-sm text-muted">Decidono cosa le persone di questo ruolo possono vedere e fare.</p>
        <div className="flex flex-col gap-2">
          {permissionCatalog.map((permission) => (
            <label key={permission.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="permission"
                value={permission.key}
                defaultChecked={selected.has(permission.key)}
                className="mt-1"
              />
              <span>{permission.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </SettingsDialog>
  );
}

function MemberDialog({
  open,
  clinicId,
  roles,
  draft,
  canEditRole,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  roles: ClinicRole[];
  draft: ClinicMember | null;
  canEditRole: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    draft ? updateMember.bind(null, clinicId) : addClinicMember.bind(null, clinicId),
    {},
  );
  useCloseWhenSent(open, state.sent, onClose);

  return (
    <SettingsDialog
      open={open}
      title={draft ? "Modifica utente" : "Nuovo utente"}
      onClose={onClose}
      action={action}
      pending={pending}
      error={state.error}
      submitLabel={draft ? "Salva" : "Aggiungi"}
    >
      {draft ? <input type="hidden" name="userId" value={draft.userId} /> : null}
      {draft ? (
        <p className="text-sm text-muted">{draft.email}</p>
      ) : (
        <label className="flex flex-col gap-2 text-sm">
          Email
          <input name="email" type="email" required autoFocus className={fieldClassName()} />
        </label>
      )}
      <label className="flex flex-col gap-2 text-sm">
        Nome
        <input name="name" maxLength={80} defaultValue={draft?.name ?? ""} autoFocus={Boolean(draft)} className={fieldClassName()} />
      </label>
      {canEditRole ? (
        <label className="flex flex-col gap-2 text-sm">
          Ruolo
          <select name="roleId" required defaultValue={draft?.roleId ?? roles[0]?.id} className={fieldClassName()}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
      ) : draft ? (
        <p className="text-sm text-muted">{draft.role}</p>
      ) : null}
    </SettingsDialog>
  );
}

function SpecialistDialog({
  open,
  clinicId,
  members,
  takenUserIds,
  draft,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  members: ClinicMember[];
  takenUserIds: Set<string>;
  draft: Specialist | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    draft ? updateDoctor.bind(null, clinicId, draft.id) : createDoctor.bind(null, clinicId),
    {},
  );
  useCloseWhenSent(open, state.sent, onClose);

  return (
    <SettingsDialog
      open={open}
      title={draft ? "Modifica specialista" : "Nuovo specialista"}
      onClose={onClose}
      action={action}
      pending={pending}
      error={state.error}
      submitLabel={draft ? "Salva" : "Aggiungi"}
    >
      <label className="flex flex-col gap-2 text-sm">
        Nome e cognome
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={draft ? specialistName(draft) : ""}
          autoFocus
          className={fieldClassName()}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Specializzazione
        <input
          name="specialization"
          maxLength={80}
          defaultValue={draft?.specialization ?? ""}
          className={fieldClassName()}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Utente
        <select name="userId" defaultValue={draft?.userId ?? ""} className={fieldClassName()}>
          <option value="">Nessun utente</option>
          {members.map((member) => (
            <option
              key={member.userId}
              value={member.userId}
              disabled={takenUserIds.has(member.userId) && member.userId !== draft?.userId}
            >
              {memberLabel(member)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" value="1" defaultChecked={draft?.active ?? true} />
        Attivo
      </label>
    </SettingsDialog>
  );
}

function AssetDialog({
  open,
  clinicId,
  draft,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  draft: ClinicAsset | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    draft ? updateClinicalObject.bind(null, clinicId, draft.id) : createClinicalObject.bind(null, clinicId),
    {},
  );
  useCloseWhenSent(open, state.sent, onClose);

  return (
    <SettingsDialog
      open={open}
      title={draft ? "Modifica stanza o oggetto" : "Nuova stanza o oggetto"}
      onClose={onClose}
      action={action}
      pending={pending}
      error={state.error}
      submitLabel={draft ? "Salva" : "Aggiungi"}
    >
      <label className="flex flex-col gap-2 text-sm">
        Nome
        <input name="name" required maxLength={80} defaultValue={draft?.name ?? ""} autoFocus className={fieldClassName()} />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Descrizione
        <textarea
          name="description"
          maxLength={400}
          rows={4}
          defaultValue={draft?.description ?? ""}
          className="min-h-24 w-full resize-y rounded-xl border border-line bg-background px-3 py-3 text-sm outline-none focus:border-teal"
        />
      </label>
    </SettingsDialog>
  );
}

function IntegrationDialog({
  open,
  clinicId,
  integrations,
  bots,
  onClose,
  onCreated,
  onOpenExisting,
}: {
  open: boolean;
  clinicId: string;
  integrations: ClinicIntegration[];
  bots: ClinicBot[];
  onClose: () => void;
  onCreated: (integrationId: string | undefined, provider: string, account?: string) => void;
  onOpenExisting: (integrationId: string) => void;
}) {
  const [publicStep, setPublicStep] = useState(false);
  const [botChoice, setBotChoice] = useState("new");
  const [state, action, pending] = useActionState<FormState, FormData>(createIntegration.bind(null, clinicId), {});
  const seen = useRef(state.sent);
  const chosen = useRef("whatsapp");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  useEffect(() => {
    if (!open) return;
    setPublicStep(false);
    setBotChoice("new");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        if (publicStep) setPublicStep(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, pending, publicStep]);

  useEffect(() => {
    if (!open) {
      seen.current = state.sent;
      return;
    }
    if (state.sent && state.sent !== seen.current) {
      seen.current = state.sent;
      onCloseRef.current();
      onCreatedRef.current(state.integrationId, chosen.current, state.integrationAccount);
    }
  }, [open, state.sent, state.integrationId, state.integrationAccount]);

  if (!open) return null;

  const publicPage = integrations.find((integration) => integration.provider === "public_page");

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4 sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-tool-title"
        className="flex max-h-[min(44rem,90vh)] w-full max-w-4xl flex-col gap-5 overflow-y-auto rounded-3xl border border-line bg-paper p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-tool-title" className="text-lg font-medium">
              {publicStep ? "Pagina pubblica" : "Aggiungi un tool"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {publicStep
                ? "Informazioni, scambi e criticità della pagina arrivano a un bot dello studio."
                : "Scegli cosa attivare per questo studio."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            disabled={pending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>
        {publicStep ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm text-muted">Bot di riferimento</legend>
            <input type="hidden" name="provider" value="public_page" />
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${
                botChoice === "new" ? "border-teal" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="bot"
                value="new"
                checked={botChoice === "new"}
                onChange={() => setBotChoice("new")}
                className="accent-teal"
              />
              <span>
                <span className="block text-sm font-medium">Creane uno nuovo</span>
                <span className="mt-1 block text-sm text-muted">Parte con lo stesso volto della pagina.</span>
              </span>
            </label>
            {bots.map((bot) => (
              <label
                key={bot.id}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${
                  botChoice === bot.id ? "border-teal" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="bot"
                  value={bot.id}
                  checked={botChoice === bot.id}
                  onChange={() => setBotChoice(bot.id)}
                  className="accent-teal"
                />
                <BotGlyph color={bot.color} emoji={bot.emoji} plain className="h-8 w-8" />
                <span className="min-w-0 truncate text-sm font-medium">{bot.name}</span>
              </label>
            ))}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setPublicStep(false)}
                className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50"
              >
                Indietro
              </button>
              <button
                type="submit"
                disabled={pending}
                className="h-10 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
              >
                {pending ? "Attivazione…" : "Attiva"}
              </button>
            </div>
          </fieldset>
        ) : null}
        <div className={`grid gap-3 sm:grid-cols-2 ${publicStep ? "hidden" : ""}`}>
          {toolCatalog.map((tool) => {
            const Icon = toolIcons[tool.id];
            const existing = tool.id === "public_page" ? publicPage : undefined;
            const locked = !tool.available;
            return (
              <button
                key={tool.id}
                type={locked || existing || tool.id === "public_page" ? "button" : "submit"}
                name={locked || existing || tool.id === "public_page" ? undefined : "provider"}
                value={locked || existing || tool.id === "public_page" ? undefined : tool.id}
                disabled={pending || locked || publicStep}
                onClick={() => {
                  if (existing) {
                    onOpenExisting(existing.id);
                    return;
                  }
                  if (tool.id === "public_page") {
                    chosen.current = tool.id;
                    setPublicStep(true);
                    return;
                  }
                  if (!locked) chosen.current = tool.id;
                }}
                className={`flex min-h-40 flex-col items-start gap-3 rounded-2xl border bg-background p-5 text-left disabled:opacity-60 ${
                  existing ? "border-teal" : "border-line enabled:hover:border-teal"
                }`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-paper">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="text-base font-medium">{tool.label}</span>
                <span className="text-sm leading-5 text-muted">{tool.body}</span>
                <span className={`mt-auto text-sm font-medium ${locked ? "text-muted" : "text-teal"}`}>
                  {locked ? "Presto" : existing ? "Apri" : pending && chosen.current === tool.id ? "Attivazione…" : "Attiva"}
                </span>
              </button>
            );
          })}
        </div>
        {state.error ? <p className="text-sm text-teal">{state.error}</p> : null}
      </form>
    </div>
  );
}

function DeleteClinicDialog({
  open,
  clinicId,
  clinicName,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  clinicName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const matches = confirmation.trim() === clinicName.trim() && clinicName.trim() !== "";

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, pending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-clinic-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-paper p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!matches || pending) return;
          setPending(true);
          setError(undefined);
          try {
            const result = await deleteClinic(clinicId, confirmation);
            if (result.removed) {
              router.push("/clinics");
              router.refresh();
              return;
            }
            setError(result.error ?? "Non è stato possibile eliminare la clinica.");
            setPending(false);
          } catch {
            setError("Non è stato possibile eliminare la clinica.");
            setPending(false);
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="delete-clinic-title" className="text-base font-medium">
            Eliminare la clinica?
          </h2>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            disabled={pending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-muted">
          L&apos;azione è irreversibile. Verranno persi tutti i dati di{" "}
          <span className="font-medium text-ink">{clinicName}</span>: chat, pazienti, agenda, equipe e integrazioni.
        </p>
        <label className="flex flex-col gap-2 text-sm">
          <span>
            Scrivi <span className="font-medium">{clinicName}</span> per confermare
          </span>
          <input
            name="confirmation"
            required
            autoFocus
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className={fieldClassName()}
          />
        </label>
        {error ? <p className="text-sm text-teal">{error}</p> : null}
        <button
          type="submit"
          disabled={pending || !matches}
          className="h-12 rounded-full bg-ink text-paper disabled:opacity-50"
        >
          {pending ? "Eliminazione…" : "Elimina"}
        </button>
      </form>
    </div>
  );
}

function IntegrationDetailDialog({
  open,
  clinicId,
  integration,
  canManage,
  webhookVerifyToken,
  onClose,
  onCreatedChat,
}: {
  open: boolean;
  clinicId: string;
  integration: ClinicIntegration;
  canManage: boolean;
  webhookVerifyToken: string;
  onClose: () => void;
  onCreatedChat?: (chat: CreatedChat) => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    dropIntegration.bind(null, clinicId, integration.id),
    {},
  );
  const [linkNote, setLinkNote] = useState<string>();
  useCloseWhenSent(open, state.sent, onClose);
  useEffect(() => {
    if (state.sent) clearWhatsAppSetupDraft(integration.id);
  }, [state.sent, integration.id]);
  const credit = integration.whatsapp?.creditCents ?? 0;
  const messages = integration.whatsapp?.messageCount ?? 0;
  const linked = integration.status === "connected";

  if (integration.provider === "whatsapp" && !linked) {
    return (
      <WhatsAppSetupDialog
        open={open}
        clinicId={clinicId}
        integrationId={integration.id}
        canManage={canManage}
        webhookVerifyToken={webhookVerifyToken}
        onClose={onClose}
        onLinkedNote={setLinkNote}
        onCreatedChat={onCreatedChat}
      />
    );
  }

  return (
    <SettingsDialog
      open={open}
      title={integrationLabel(integration.provider)}
      onClose={onClose}
      action={action}
      pending={pending}
      error={state.error}
      submitLabel="Chiudi"
      allowSubmit={false}
    >
      {integration.provider === "whatsapp" ? (
        <>
          <div>
            <p className="text-xs font-medium tracking-[0.06em] text-muted">Credito</p>
            <p className="mt-1 text-sm">{euro(credit)}</p>
            {credit === 0 ? <p className="mt-1 text-sm text-muted">L'invio è fermo finché non c'è credito.</p> : null}
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.06em] text-muted">Collegamento</p>
            <p className="mt-1 text-sm">{integration.account || "Numero collegato."}</p>
            <p className="mt-1 text-sm text-muted">Collegato e attivo.</p>
            {linkNote ? <p className="mt-1 text-sm text-teal">{linkNote}</p> : null}
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.06em] text-muted">Cronologia</p>
            <p className="mt-1 text-sm text-muted">
              {messages === 0 ? "Nessun messaggio archiviato." : `${messages} messaggi archiviati.`}
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">Nessun dettaglio.</p>
      )}
      {canManage ? (
        <button
          type="submit"
          disabled={pending}
          className="h-10 self-start rounded-full border border-line px-4 text-sm disabled:opacity-50"
        >
          {pending ? "Rimozione…" : "Rimuovi"}
        </button>
      ) : null}
    </SettingsDialog>
  );
}

export function SettingsView({
  clinicId,
  clinicName,
  currentUserId,
  canRename,
  canDelete,
  canManageMembers,
  canManageRoles,
  canManageAgenda,
  canManageIntegrations,
  webhookVerifyToken,
  tokenAccount = null,
  members,
  roles = [],
  specialists = [],
  assets = [],
  integrations = [],
  bots = [],
  onCreatedChat,
}: {
  clinicId: string;
  clinicName: string;
  currentUserId: string;
  canRename: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageAgenda: boolean;
  canManageIntegrations: boolean;
  webhookVerifyToken: string;
  tokenAccount?: ClinicTokenAccount | null;
  members: ClinicMember[];
  roles?: ClinicRole[];
  specialists?: Specialist[];
  assets?: ClinicAsset[];
  integrations?: ClinicIntegration[];
  bots?: ClinicBot[];
  onCreatedChat?: (chat: CreatedChat) => void;
}) {
  const router = useRouter();
  const threadRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLParagraphElement>(null);
  const [sectionLabel, setSectionLabel] = useState<string>(sections[0].label);
  const [roleDraft, setRoleDraft] = useState<ClinicRole | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [memberDraft, setMemberDraft] = useState<ClinicMember | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [specialistDraft, setSpecialistDraft] = useState<Specialist | null>(null);
  const [specialistOpen, setSpecialistOpen] = useState(false);
  const [assetDraft, setAssetDraft] = useState<ClinicAsset | null>(null);
  const [assetOpen, setAssetOpen] = useState(false);
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detailIntegrationId, setDetailIntegrationId] = useState<string | null>(null);
  const [pendingIntegration, setPendingIntegration] = useState<ClinicIntegration | null>(null);
  const shownIntegrations =
    pendingIntegration && !integrations.some((item) => item.id === pendingIntegration.id)
      ? [...integrations, pendingIntegration]
      : integrations;
  const detailIntegration =
    shownIntegrations.find((integration) => integration.id === detailIntegrationId) ?? null;
  const takenUserIds = new Set(
    specialists.flatMap((specialist) => (specialist.userId ? [specialist.userId] : [])),
  );

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    syncSectionBadge(thread, badgeRef.current, setSectionLabel);
  }, [members, roles, specialists, assets, integrations]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const sync = () => syncSectionBadge(thread, badgeRef.current, setSectionLabel);
    thread.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(thread);
    return () => {
      thread.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [members, roles, specialists, assets, integrations]);

  return (
    <>
      <p
        ref={badgeRef}
        className="pointer-events-none absolute top-3 left-1/2 z-20 flex w-fit max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium"
      >
        <Settings className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span className="truncate">{sectionLabel}</span>
      </p>

      <div ref={threadRef} className="thread-scroll flex min-h-0 flex-1 flex-col overflow-y-auto pt-14 pb-10">
        <section className="px-4 pb-6 md:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <TableHeading title="generali" pin="generali" />
            <ClinicNameForm clinicId={clinicId} clinicName={clinicName} canRename={canRename} />
            {tokenAccount ? <TokenAccountCard clinicId={clinicId} account={tokenAccount} /> : null}
            <TableHeading
              title="Ruoli"
              onAdd={() => {
                setRoleDraft(null);
                setRoleOpen(true);
              }}
              canAdd={canManageRoles}
            />
            <DataTable columns={["Nome", "Permessi", "Persone"]}>
              {roles.length === 0 ? (
                <EmptyRow columns={3}>Nessun ruolo.</EmptyRow>
              ) : (
                roles.map((role) => {
                  const people = members.filter((member) => member.roleId === role.id).length;
                  return (
                    <tr
                      key={role.id}
                      className="cursor-pointer border-t border-line hover:bg-background"
                      onClick={() => {
                        setRoleDraft(role);
                        setRoleOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 font-medium">{role.name}</td>
                      <td className="px-4 py-3 text-muted">{rolePermissionSummary(role)}</td>
                      <td className="px-4 py-3 text-muted">{people}</td>
                    </tr>
                  );
                })
              )}
            </DataTable>
            <TableHeading
              title="Utenti"
              onAdd={() => {
                setMemberDraft(null);
                setMemberOpen(true);
              }}
              canAdd={canManageMembers}
            />
            <DataTable columns={["Nome", "Email", "Ruolo"]}>
              {members.length === 0 ? (
                <EmptyRow columns={3}>Nessun utente.</EmptyRow>
              ) : (
                members.map((member) => {
                  const canEdit = canManageMembers || member.userId === currentUserId;
                  return (
                    <tr
                      key={member.id}
                      className={`border-t border-line ${canEdit ? "cursor-pointer hover:bg-background" : ""}`}
                      onClick={() => {
                        if (!canEdit) return;
                        setMemberDraft(member);
                        setMemberOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 font-medium">{member.name?.trim() || "—"}</td>
                      <td className="px-4 py-3 text-muted">{member.email}</td>
                      <td className="px-4 py-3 text-muted">{member.role}</td>
                    </tr>
                  );
                })
              )}
            </DataTable>
          </div>
        </section>

        <section className="border-t border-line px-4 py-6 md:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <TableHeading
              title="equipe"
              pin="equipe"
              onAdd={() => {
                setSpecialistDraft(null);
                setSpecialistOpen(true);
              }}
              canAdd={canManageAgenda}
            />
            <DataTable columns={["Nome", "Specializzazione", "Utente", "Stato"]}>
              {specialists.length === 0 ? (
                <EmptyRow columns={4}>Nessuno specialista.</EmptyRow>
              ) : (
                specialists.map((specialist) => {
                  const linked = members.find((member) => member.userId === specialist.userId);
                  return (
                    <tr
                      key={specialist.id}
                      className={`border-t border-line ${canManageAgenda ? "cursor-pointer hover:bg-background" : ""}`}
                      onClick={() => {
                        if (!canManageAgenda) return;
                        setSpecialistDraft(specialist);
                        setSpecialistOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 font-medium">{specialistName(specialist)}</td>
                      <td className="px-4 py-3 text-muted">{specialist.specialization?.trim() || "—"}</td>
                      <td className="px-4 py-3 text-muted">{linked ? memberLabel(linked) : "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium ${
                            specialist.active ? "bg-teal/10 text-teal" : "bg-line text-muted"
                          }`}
                        >
                          {specialist.active ? "Attivo" : "Non attivo"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </DataTable>
          </div>
        </section>

        <section className="border-t border-line px-4 pt-6 md:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <TableHeading
              title="stanze e oggetti"
              pin="stanze e oggetti"
              onAdd={() => {
                setAssetDraft(null);
                setAssetOpen(true);
              }}
              canAdd={canManageAgenda}
            />
            <DataTable columns={["Nome", "Descrizione"]}>
              {assets.length === 0 ? (
                <EmptyRow columns={2}>Nessuna stanza o oggetto.</EmptyRow>
              ) : (
                assets.map((asset) => (
                  <tr
                    key={asset.id}
                    className={`border-t border-line ${canManageAgenda ? "cursor-pointer hover:bg-background" : ""}`}
                    onClick={() => {
                      if (!canManageAgenda) return;
                      setAssetDraft(asset);
                      setAssetOpen(true);
                    }}
                  >
                    <td className="px-4 py-3 font-medium">{asset.name}</td>
                    <td className="px-4 py-3 text-muted">{asset.description?.trim() || "—"}</td>
                  </tr>
                ))
              )}
            </DataTable>
          </div>
        </section>

        <section className="border-t border-line px-4 pt-6 md:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <TableHeading
              title="integrazioni"
              pin="integrazioni"
              onAdd={() => setIntegrationOpen(true)}
              canAdd={canManageIntegrations}
            />
            <DataTable columns={["Integrazione", "Descrizione", "Stato", "Dettaglio"]}>
              {shownIntegrations.length === 0 ? (
                <EmptyRow columns={4}>Nessuna integrazione.</EmptyRow>
              ) : (
                shownIntegrations.map((integration) => (
                  <tr key={integration.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{integrationLabel(integration.provider)}</td>
                    <td className="px-4 py-3 text-muted">{integrationSummary(integration)}</td>
                    <td className="px-4 py-3 text-muted">{integrationStatus(integration)}</td>
                    <td className="px-4 py-3">
                      {integration.provider === "public_page" ? (
                        <Link
                          href={`/clinics/${clinicId}?view=public`}
                          className="inline-flex h-8 items-center rounded-full border border-line px-3 text-sm"
                        >
                          Apri
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDetailIntegrationId(integration.id)}
                          className="h-8 rounded-full border border-line px-3 text-sm"
                        >
                          Apri
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </DataTable>
          </div>
        </section>

        {canDelete ? (
          <section className="border-t border-line px-4 pt-6 md:px-8">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              <TableHeading title="elimina" pin="elimina" />
              <div className="rounded-2xl bg-paper px-4 py-4">
                <p className="text-sm text-muted">
                  Eliminare la clinica è irreversibile. Chat, pazienti, agenda e ogni altro dato vengono persi.
                </p>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="mt-4 h-10 rounded-full border border-line px-4 text-sm"
                >
                  Elimina clinica
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {roleOpen ? (
        <RoleDialog
          key={roleDraft?.id ?? "new-role"}
          open
          clinicId={clinicId}
          draft={roleDraft}
          readOnly={Boolean(roleDraft?.admin) || !canManageRoles}
          onClose={() => setRoleOpen(false)}
        />
      ) : null}
      {memberOpen ? (
        <MemberDialog
          key={memberDraft?.id ?? "new-member"}
          open
          clinicId={clinicId}
          roles={roles}
          draft={memberDraft}
          canEditRole={canManageMembers}
          onClose={() => setMemberOpen(false)}
        />
      ) : null}
      {specialistOpen ? (
        <SpecialistDialog
          key={specialistDraft?.id ?? "new-specialist"}
          open
          clinicId={clinicId}
          members={members}
          takenUserIds={takenUserIds}
          draft={specialistDraft}
          onClose={() => setSpecialistOpen(false)}
        />
      ) : null}
      {assetOpen ? (
        <AssetDialog
          key={assetDraft?.id ?? "new-asset"}
          open
          clinicId={clinicId}
          draft={assetDraft}
          onClose={() => setAssetOpen(false)}
        />
      ) : null}
      {integrationOpen ? (
        <IntegrationDialog
          open
          clinicId={clinicId}
          integrations={shownIntegrations}
          bots={bots}
          onClose={() => setIntegrationOpen(false)}
          onOpenExisting={(integrationId) => {
            setIntegrationOpen(false);
            const chosen = shownIntegrations.find((item) => item.id === integrationId);
            if (chosen?.provider === "public_page") {
              router.push(`/clinics/${clinicId}?view=public`);
              return;
            }
            setDetailIntegrationId(integrationId);
          }}
          onCreated={(integrationId, provider, account) => {
            if (!integrationId) return;
            if (provider === "public_page") {
              router.push(`/clinics/${clinicId}?view=public`);
              router.refresh();
              return;
            }
            setPendingIntegration({
              id: integrationId,
              provider,
              account: account ?? "",
              status: "pending",
              whatsapp: provider === "whatsapp" ? { creditCents: 0, messageCount: 0 } : null,
            });
            setDetailIntegrationId(integrationId);
          }}
        />
      ) : null}
      {deleteOpen ? (
        <DeleteClinicDialog
          open
          clinicId={clinicId}
          clinicName={clinicName}
          onClose={() => setDeleteOpen(false)}
        />
      ) : null}
      {detailIntegration ? (
        <IntegrationDetailDialog
          key={detailIntegration.id}
          open
          clinicId={clinicId}
          integration={detailIntegration}
          canManage={canManageIntegrations}
          webhookVerifyToken={webhookVerifyToken}
          onClose={() => setDetailIntegrationId(null)}
          onCreatedChat={onCreatedChat}
        />
      ) : null}
    </>
  );
}
