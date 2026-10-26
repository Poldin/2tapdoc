"use client";

import { useActionState, useEffect, useRef } from "react";
import { decidePatientDeletion, type FormState } from "@/app/clinics/actions";

export type PatientDeletionRequest = {
  id: string;
  patients: { id: string; fullName: string }[];
};

export function PatientDeletionDialog({
  open,
  clinicId,
  request,
  onDecided,
}: {
  open: boolean;
  clinicId: string;
  request: PatientDeletionRequest | null;
  onDecided: (requestId: string) => void;
}) {
  const requestId = request?.id ?? "none";
  const [state, action, pending] = useActionState<FormState, FormData>(
    decidePatientDeletion.bind(null, clinicId, requestId),
    {},
  );
  const onDecidedRef = useRef(onDecided);
  onDecidedRef.current = onDecided;

  useEffect(() => {
    if (!state.decided) return;
    onDecidedRef.current(state.decided);
  }, [state.decided]);

  if (!open || !request) return null;
  const names = request.patients.map((patient) => patient.fullName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-deletion-title"
        className="w-full max-w-sm rounded-3xl border border-line bg-paper p-5"
      >
        <h2 id="patient-deletion-title" className="text-base font-medium">
          {names.length === 1 ? "Eliminare questo paziente?" : "Eliminare questi pazienti?"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          L&apos;agente ha chiesto di eliminare{" "}
          {names.length === 1 ? (
            <span className="font-medium text-ink">{names[0]}</span>
          ) : (
            "questi profili"
          )}
          . Il profilo viene rimosso. Gli appuntamenti restano, senza quel paziente.
        </p>
        {names.length > 1 ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {request.patients.map((patient) => (
              <li key={patient.id} className="font-medium">
                {patient.fullName}
              </li>
            ))}
          </ul>
        ) : null}
        {state.error ? <p className="mt-3 text-sm text-teal">{state.error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="submit"
            name="decision"
            value="cancelled"
            disabled={pending}
            className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            name="decision"
            value="confirmed"
            disabled={pending}
            className="h-10 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            {pending ? "Attendere…" : "Elimina"}
          </button>
        </div>
      </form>
    </div>
  );
}
