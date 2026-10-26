"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import {
  addClinicMember,
  createClinicalObject,
  createDoctor,
  createRole,
  updateClinicalObject,
  updateClinic,
  updateDoctor,
  updateMember,
  updateRole,
  type FormState,
} from "@/app/clinics/actions";
import { permissionCatalog, permissionKeys, permissionLabel } from "@/lib/permissions";

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
] as const;

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
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-paper p-5"
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

export function SettingsView({
  clinicId,
  clinicName,
  currentUserId,
  canRename,
  canManageMembers,
  canManageRoles,
  canManageAgenda,
  members,
  roles = [],
  specialists = [],
  assets = [],
}: {
  clinicId: string;
  clinicName: string;
  currentUserId: string;
  canRename: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageAgenda: boolean;
  members: ClinicMember[];
  roles?: ClinicRole[];
  specialists?: Specialist[];
  assets?: ClinicAsset[];
}) {
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
  const takenUserIds = new Set(
    specialists.flatMap((specialist) => (specialist.userId ? [specialist.userId] : [])),
  );

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    syncSectionBadge(thread, badgeRef.current, setSectionLabel);
  }, [members, roles, specialists, assets]);

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
  }, [members, roles, specialists, assets]);

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
    </>
  );
}
