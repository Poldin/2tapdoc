"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createPatient, type FormState } from "@/app/clinics/actions";
import { birthLabel, patientContacts, patientName, type PatientRecord } from "@/lib/patients";

export type { PatientRecord };

const suggestionLimit = 8;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compact(value: string) {
  return fold(value).replace(/[\s.'/-]/g, "");
}

function matchesPatient(patient: PatientRecord, query: string) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const parts = [
    patient.givenName,
    patient.familyName,
    `${patient.givenName} ${patient.familyName}`,
    `${patient.familyName} ${patient.givenName}`,
    patient.fiscalCode,
    patient.phone,
    patient.email,
    birthLabel(patient.dateOfBirth),
    patient.note,
  ].filter((part): part is string => Boolean(part));
  const full = fold(parts.join(" "));
  const tight = compact(parts.join(" "));
  return tokens.every((token) => full.includes(token) || tight.includes(compact(token)));
}

function fieldClassName() {
  return "h-12 w-full min-w-0 rounded-xl border border-line bg-background px-3 text-sm outline-none focus:border-teal";
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

function PatientDialog({
  open,
  clinicId,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createPatient.bind(null, clinicId),
    {},
  );
  useCloseWhenSent(open, state.sent, onClose);

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
        aria-labelledby="patient-dialog-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-paper p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="patient-dialog-title" className="text-base font-medium">
            Nuovo paziente
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
        <label className="flex flex-col gap-2 text-sm">
          Nome e cognome
          <input name="name" required maxLength={160} autoFocus className={fieldClassName()} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Data di nascita
          <input name="dateOfBirth" type="date" className={fieldClassName()} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Codice fiscale
          <input name="fiscalCode" maxLength={16} className={fieldClassName()} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Telefono
          <input name="phone" maxLength={40} className={fieldClassName()} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Email
          <input name="email" type="email" maxLength={120} className={fieldClassName()} />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Note
          <textarea name="note" rows={3} maxLength={2000} className={`${fieldClassName()} h-auto py-3`} />
        </label>
        {state.error ? <p className="text-sm text-teal">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-full bg-teal text-teal-ink disabled:opacity-50"
        >
          {pending ? "Salvataggio…" : "Aggiungi"}
        </button>
      </form>
    </div>
  );
}

function PatientCard({ clinicId, patient }: { clinicId: string; patient: PatientRecord }) {
  const contacts = patientContacts(patient);
  return (
    <li>
      <Link
        href={`/clinics/${clinicId}?view=patients&patient=${patient.id}`}
        className="block rounded-2xl bg-paper px-4 py-3 hover:bg-line"
      >
        <p className="text-sm font-medium">{patientName(patient)}</p>
        {contacts ? <p className="mt-1 truncate text-sm text-muted">{contacts}</p> : null}
      </Link>
    </li>
  );
}

export function PatientsView({
  clinicId,
  patients,
  canWrite,
}: {
  clinicId: string;
  patients: PatientRecord[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? patients.filter((patient) => matchesPatient(patient, query)) : patients),
    [patients, query, searching],
  );
  const suggestions = results.slice(0, suggestionLimit);
  const showMenu = open && searching;

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!showMenu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showMenu]);

  function openPatient(id: string) {
    setOpen(false);
    router.push(`/clinics/${clinicId}?view=patients&patient=${id}`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 pl-14 md:pl-3">
        <div ref={rootRef} className="relative min-w-0 w-full max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                return;
              }
              if (!showMenu || suggestions.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => (index + 1) % suggestions.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const choice = suggestions[active];
                if (choice) openPatient(choice.id);
              }
            }}
            placeholder="Cerca pazienti"
            aria-label="Cerca pazienti"
            aria-expanded={showMenu}
            aria-controls="patient-suggestions"
            role="combobox"
            autoComplete="off"
            className="h-10 w-full rounded-full border border-line bg-paper pr-4 pl-10 text-sm outline-none focus:border-teal"
          />
          {showMenu ? (
            <div
              id="patient-suggestions"
              role="listbox"
              className="absolute top-12 left-0 z-30 w-full overflow-hidden rounded-2xl border border-line bg-paper shadow-sm"
            >
              {suggestions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted">Nessun risultato.</p>
              ) : (
                suggestions.map((patient, index) => {
                  const contacts = patientContacts(patient);
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => openPatient(patient.id)}
                      className={`flex w-full flex-col px-4 py-2 text-left ${
                        index === active ? "bg-background" : ""
                      }`}
                    >
                      <span className="truncate text-sm font-medium">{patientName(patient)}</span>
                      {contacts ? <span className="truncate text-xs text-muted">{contacts}</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
            className="h-10 shrink-0 rounded-full border border-line bg-paper px-4 text-sm"
          >
            Aggiungi
          </button>
        ) : null}
      </div>
      {createOpen ? (
        <PatientDialog clinicId={clinicId} open={createOpen} onClose={() => setCreateOpen(false)} />
      ) : null}

      <div className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {results.length === 0 ? (
          <p className="pt-6 text-center text-sm text-muted">
            {patients.length === 0 ? "Nessun paziente." : "Nessun risultato."}
          </p>
        ) : (
          <ul className="flex w-full max-w-[36rem] flex-col gap-3">
            {results.map((patient) => (
              <PatientCard key={patient.id} clinicId={clinicId} patient={patient} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
