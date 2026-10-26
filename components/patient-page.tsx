import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { birthLabel, patientName, type PatientRecord } from "@/lib/patients";

function Field({ label, value }: { label: string; value: string | null }) {
  const text = value?.trim() || null;
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-medium tracking-[0.06em] text-muted">{label}</p>
      {text ? (
        <p className="mt-1 whitespace-pre-line text-sm">{text}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">—</p>
      )}
    </div>
  );
}

export function PatientPage({ clinicId, patient }: { clinicId: string; patient: PatientRecord }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 pl-14 md:pl-3">
        <Link
          href={`/clinics/${clinicId}?view=patients`}
          aria-label="Torna ai pazienti"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-paper"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        </Link>
        <h1 className="min-w-0 truncate text-sm font-medium">{patientName(patient)}</h1>
      </div>
      <div className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="w-full max-w-[36rem] divide-y divide-line overflow-hidden rounded-2xl bg-paper">
          <Field label="Nome e cognome" value={patientName(patient)} />
          <Field label="Data di nascita" value={birthLabel(patient.dateOfBirth)} />
          <Field label="Codice fiscale" value={patient.fiscalCode} />
          <Field label="Telefono" value={patient.phone} />
          <Field label="Email" value={patient.email} />
          <Field label="Note" value={patient.note} />
        </div>
      </div>
    </div>
  );
}
