"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, CalendarOff, Pencil, Stethoscope, Trash, Users, type LucideIcon } from "lucide-react";
import { createAgendaEntry, updateAgendaEntry } from "@/app/clinics/actions";
import type { AgendaLane } from "@/components/agenda-view";

export type AgendaEditTarget = {
  kind: "appointment" | "block";
  id: string | null;
  title: string | null;
  body: string | null;
  startsAt: string;
  endsAt: string;
  doctorIds: string[];
  objectIds: string[];
  patientIds: string[];
};

export type AgendaEditPatient = {
  id: string;
  name: string;
};

function dateInput(value: string) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function timeInput(value: string) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function combine(date: string, time: string) {
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

function SearchPicker({
  label,
  icon: Icon,
  placeholder,
  options,
  selected,
  locked,
  onChange,
}: {
  label?: string;
  icon?: LucideIcon;
  placeholder: string;
  options: { id: string; name: string }[];
  selected: string[];
  locked: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => !selected.includes(option.id) && option.name.toLowerCase().includes(needle))
    : [];
  const chosen = selected.flatMap((id) => {
    const option = options.find((item) => item.id === id);
    return option ? [option] : [];
  });

  if (locked && chosen.length === 0) return null;

  return (
    <div>
      {label ? (
        <p className="mb-2 flex items-center gap-2 text-sm text-ink">
          {Icon ? <Icon className="h-4 w-4 text-muted" strokeWidth={2} /> : null}
          {label}
        </p>
      ) : null}
      {locked ? null : (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full border-0 border-b border-line bg-transparent py-1.5 text-sm outline-none focus:border-ink"
        />
      )}
      {!locked && needle ? (
        <ul className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-line bg-paper">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Nessun risultato.</li>
          ) : (
            matches.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange([...selected, option.id]);
                    setQuery("");
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-background"
                >
                  {option.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {chosen.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chosen.map((option) => (
            <span key={option.id} className="flex max-w-full items-center gap-1 rounded-full bg-background py-1 pr-1 pl-2.5 text-sm">
              <span className="truncate">{option.name}</span>
              {locked ? null : (
                <button
                  type="button"
                  aria-label={`Rimuovi ${option.name}`}
                  onClick={() => onChange(selected.filter((id) => id !== option.id))}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line hover:text-ink"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const timeClass = "h-9 min-w-0 rounded-lg border border-line bg-background px-2 text-sm outline-none focus:border-ink disabled:opacity-70";

function DeleteAgendaButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const [lit, setLit] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!armed) return;
    setLit(true);
    const blink = window.setInterval(() => setLit((value) => !value), 450);
    const stop = window.setTimeout(() => {
      setArmed(false);
      setLit(false);
    }, 5000);
    return () => {
      window.clearInterval(blink);
      window.clearTimeout(stop);
    };
  }, [armed]);

  return (
    <button
      type="button"
      aria-label={armed ? "Conferma eliminazione" : "Elimina"}
      disabled={pending}
      onClick={() => {
        if (pending) return;
        if (!armed) {
          setArmed(true);
          return;
        }
        setPending(true);
        onConfirm();
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        armed
          ? lit
            ? "bg-[#b42318] text-[#fbf8f3]"
            : "bg-transparent text-[#b42318]"
          : "text-muted hover:bg-background hover:text-ink"
      }`}
    >
      <Trash className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

export function AgendaEditDialog({
  target,
  clinicId,
  lanes,
  patients,
  canChange,
  onClose,
  onDelete,
  onSaved,
}: {
  target: AgendaEditTarget | null;
  clinicId: string;
  lanes: AgendaLane[];
  patients: AgendaEditPatient[];
  canChange: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"appointment" | "block">("appointment");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [doctorIds, setDoctorIds] = useState<string[]>([]);
  const [objectIds, setObjectIds] = useState<string[]>([]);
  const [patientIds, setPatientIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    setKind(target.kind);
    setTitle(target.title ?? "");
    setBody(target.body ?? "");
    setNotesOpen(Boolean(target.body));
    setStartDate(dateInput(target.startsAt));
    setStartTime(timeInput(target.startsAt));
    setEndDate(dateInput(target.endsAt));
    setEndTime(timeInput(target.endsAt));
    setDoctorIds(target.doctorIds);
    setObjectIds(target.objectIds);
    setPatientIds(target.patientIds);
    setEditing(target.id === null);
    setError(null);
    setPending(false);
  }, [target]);

  useEffect(() => {
    if (!editing) return;
    titleRef.current?.focus();
  }, [editing, target]);

  useEffect(() => {
    if (!target) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [target, onClose]);

  if (!target) return null;

  const creating = target.id === null;
  const specialists = lanes.filter((lane) => lane.kind === "specialist");
  const assets = lanes.filter((lane) => lane.kind === "asset");
  const locked = !canChange || !editing;
  const notes = notesOpen ? body.trim() : "";
  const dirty =
    kind !== target.kind ||
    title.trim() !== (target.title ?? "").trim() ||
    notes !== (target.body ?? "").trim() ||
    startDate !== dateInput(target.startsAt) ||
    startTime !== timeInput(target.startsAt) ||
    endDate !== dateInput(target.endsAt) ||
    endTime !== timeInput(target.endsAt) ||
    !sameIds(doctorIds, target.doctorIds) ||
    !sameIds(objectIds, target.objectIds) ||
    (kind === "appointment" && !sameIds(patientIds, target.patientIds));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={creating ? (kind === "block" ? "Nuovo blocco" : "Nuovo appuntamento") : kind === "block" ? "Modifica blocco" : "Modifica appuntamento"}
        className="flex max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-xl flex-col gap-5 overflow-y-auto rounded-3xl border border-line bg-paper p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!editing || pending) return;
          const startsAt = combine(startDate, startTime);
          const endsAt = combine(endDate, endTime);
          if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
            setError("La fine deve essere dopo l'inizio.");
            return;
          }
          if (kind === "block" && !title.trim()) {
            setError("Il blocco ha bisogno di un titolo.");
            return;
          }
          if (doctorIds.length === 0 && objectIds.length === 0) {
            setError("Serve almeno uno specialista o un oggetto.");
            return;
          }
          setPending(true);
          setError(null);
          const payload = {
            clinicId,
            kind,
            title: title.trim() || null,
            body: notesOpen ? body.trim() || null : null,
            startsAt,
            endsAt,
            doctorIds,
            objectIds,
            patientIds: kind === "block" ? [] : patientIds,
          };
          void (creating
            ? createAgendaEntry(payload)
            : updateAgendaEntry({ ...payload, fromKind: target.kind, id: target.id ?? "" })
          ).then((result) => {
            setPending(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            onSaved();
          });
        }}
      >
        <div className="flex items-start gap-3">
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            readOnly={locked}
            placeholder="Aggiungi titolo"
            aria-label="Titolo"
            className="min-w-0 flex-1 border-0 border-b border-line bg-transparent pb-1 text-2xl outline-none focus:border-ink read-only:focus:border-line"
          />
          {canChange && !creating ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-pressed={editing}
                onClick={() => setEditing(true)}
                className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs ${
                  editing ? "bg-ink text-paper" : "border border-line text-ink"
                }`}
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                Modifica
              </button>
              <DeleteAgendaButton key={target.id} onConfirm={onDelete} />
            </div>
          ) : (
            <button
              type="button"
              aria-label="Chiudi"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>

        {locked ? (
          <p className="flex items-center gap-2 text-sm text-ink">
            {kind === "appointment" ? (
              <CalendarClock className="h-4 w-4 text-muted" strokeWidth={2} />
            ) : (
              <CalendarOff className="h-4 w-4 text-muted" strokeWidth={2} />
            )}
            {kind === "appointment" ? "Appuntamento" : "Blocco"}
          </p>
        ) : (
          <div className="flex gap-2">
            {(["appointment", "block"] as const).map((value) => {
              const selected = kind === value;
              const Icon = value === "appointment" ? CalendarClock : CalendarOff;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setKind(value)}
                  className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-sm ${
                    selected ? "bg-ink text-paper" : "border border-line text-muted"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${selected ? "text-paper" : "text-muted"}`} strokeWidth={2} />
                  {value === "appointment" ? "Appuntamento" : "Blocco"}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            required
            aria-label="Data di inizio"
            disabled={locked}
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={`${timeClass} w-[9.2rem] shrink-0`}
          />
          <input
            type="time"
            required
            aria-label="Ora di inizio"
            disabled={locked}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className={`${timeClass} w-[5.6rem] shrink-0`}
          />
          <span className="text-sm text-muted">–</span>
          <input
            type="date"
            required
            aria-label="Data di fine"
            disabled={locked}
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={`${timeClass} w-[9.2rem] shrink-0`}
          />
          <input
            type="time"
            required
            aria-label="Ora di fine"
            disabled={locked}
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className={`${timeClass} w-[5.6rem] shrink-0`}
          />
        </div>

        {kind === "appointment" ? (
          <SearchPicker
            label="Pazienti"
            icon={Users}
            placeholder="Cerca paziente"
            options={patients}
            selected={patientIds}
            locked={locked}
            onChange={setPatientIds}
          />
        ) : null}
        <SearchPicker
          label="Specialisti"
          icon={Stethoscope}
          placeholder="Cerca specialista"
          options={specialists}
          selected={doctorIds}
          locked={locked}
          onChange={setDoctorIds}
        />
        <SearchPicker
          placeholder="Cerca oggetto"
          options={assets}
          selected={objectIds}
          locked={locked}
          onChange={setObjectIds}
        />

        <div>
          {locked ? (
            notes ? <p className="text-sm font-bold whitespace-pre-wrap">{notes}</p> : null
          ) : (
          <button
            type="button"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((open) => !open)}
            className="text-sm text-muted hover:text-ink"
          >
            {notesOpen ? "Note" : "Aggiungi note"}
          </button>
          )}
          {!locked && notesOpen ? (
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Note"
              aria-label="Note"
              className="mt-2 w-full resize-none border-0 border-b border-line bg-transparent py-1 text-sm outline-none focus:border-ink"
            />
          ) : null}
        </div>

        {error ? <p className="text-sm text-teal">{error}</p> : null}
        {creating || (editing && dirty) ? (
          <div className="flex w-fit gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-10 w-fit rounded-full bg-teal px-4 text-sm text-teal-ink disabled:opacity-50"
            >
              {pending ? "Salvataggio…" : "Salva"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="h-10 w-fit rounded-full border border-line px-4 text-sm disabled:opacity-50"
            >
              Annulla
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
