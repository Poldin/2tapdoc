export type PatientRecord = {
  id: string;
  givenName: string;
  familyName: string;
  dateOfBirth: string | null;
  fiscalCode: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
};

export function patientName(patient: Pick<PatientRecord, "givenName" | "familyName">) {
  return `${patient.givenName} ${patient.familyName}`.replace(/\s+/g, " ").trim();
}

export function birthLabel(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

export function patientContacts(patient: Pick<PatientRecord, "phone" | "email">) {
  const facts = [patient.phone?.trim(), patient.email?.trim()].filter((fact): fact is string => Boolean(fact));
  return facts.length > 0 ? facts.join(" · ") : null;
}

export function asPatient(row: {
  id: string;
  given_name: string;
  family_name: string;
  date_of_birth: string | null;
  fiscal_code: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
}): PatientRecord {
  return {
    id: row.id,
    givenName: row.given_name,
    familyName: row.family_name,
    dateOfBirth: row.date_of_birth,
    fiscalCode: row.fiscal_code,
    phone: row.phone,
    email: row.email,
    note: row.note,
  };
}
