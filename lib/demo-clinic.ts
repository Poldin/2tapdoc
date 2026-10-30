export type Appointment = {
  id: string;
  patient: string;
  day: string;
  time: string;
  type: string;
  relation?: string;
};

export type WhatsAppDraft = {
  id: string;
  audience: string;
  text: string;
};

export type RecallItem = {
  patient: string;
  reason: string;
};

export type ClinicState = {
  appointments: Appointment[];
  drafts: WhatsAppDraft[];
  recalls: RecallItem[];
  lastCodiceFiscale?: { fullName: string; code: string; assumptions: string[] };
};

export const initialClinicState = (): ClinicState => ({
  appointments: [
    { id: "a1", patient: "Rossi Mario", day: "mercoledì", time: "10:00", type: "Controllo" },
    { id: "a2", patient: "Bianchi Laura", day: "giovedì", time: "16:00", type: "Igiene" },
    { id: "a3", patient: "Verdi Sara", day: "venerdì", time: "09:30", type: "Prima visita" },
    { id: "a4", patient: "Neri Paolo", day: "domani", time: "11:00", type: "Controllo" },
    { id: "a5", patient: "Galli Elena", day: "domani", time: "15:30", type: "Igiene" },
    {
      id: "a6",
      patient: "Galli Luca",
      day: "martedì",
      time: "17:00",
      type: "Controllo",
      relation: "figlio di Elena Galli",
    },
    { id: "a7", patient: "Conti Rosanna", day: "domani", time: "10:30", type: "Igiene" },
  ],
  drafts: [],
  recalls: [],
});

const MONTH_CODES = ["A", "B", "C", "D", "E", "H", "L", "M", "P", "R", "S", "T"] as const;

const ODD_MAP: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const EVEN_MAP: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
  N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};
const CHECK_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function onlyLetters(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function consonants(value: string) {
  return onlyLetters(value).replace(/[AEIOU]/g, "");
}

function vowels(value: string) {
  return onlyLetters(value).replace(/[^AEIOU]/g, "");
}

function encodeSurname(surname: string) {
  return (consonants(surname) + vowels(surname) + "XXX").slice(0, 3);
}

function encodeName(name: string) {
  const cons = consonants(name);
  const raw = cons.length >= 4 ? cons[0] + cons[2] + cons[3] : cons + vowels(name) + "XXX";
  return raw.slice(0, 3);
}

function checkChar(partial: string) {
  let sum = 0;
  for (let i = 0; i < partial.length; i += 1) {
    const ch = partial[i];
    sum += i % 2 === 0 ? ODD_MAP[ch] ?? 0 : EVEN_MAP[ch] ?? 0;
  }
  return CHECK_CHARS[sum % 26];
}

/** Fictional defaults for "Mario" when the user doesn't supply full anagrafica. */
export const MARIO_DEFAULTS = {
  firstName: "Mario",
  lastName: "Rossi",
  sex: "M" as const,
  birthDay: 15,
  birthMonth: 3,
  birthYear: 1985,
  birthPlace: "Roma",
  cadastralCode: "H501",
};

export function computeCodiceFiscale(input: {
  firstName: string;
  lastName: string;
  sex: "M" | "F";
  birthDay: number;
  birthMonth: number;
  birthYear: number;
  cadastralCode: string;
}) {
  const surname = encodeSurname(input.lastName);
  const name = encodeName(input.firstName);
  const yy = String(input.birthYear).slice(-2).padStart(2, "0");
  const mm = MONTH_CODES[input.birthMonth - 1] ?? "A";
  let day = input.birthDay;
  if (input.sex === "F") day += 40;
  const dd = String(day).padStart(2, "0");
  const place = onlyLetters(input.cadastralCode).slice(0, 4).padEnd(4, "X");
  const partial = `${surname}${name}${yy}${mm}${dd}${place}`;
  return partial + checkChar(partial);
}

export const mistralTools = [
  {
    type: "function",
    function: {
      name: "list_appointments",
      description: "Elenca gli appuntamenti dell'agenda dello studio (dati di esempio).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "move_appointment",
      description:
        "Sposta un appuntamento. Per il figlio di Elena usa patient='Galli Luca' oppure 'figlio di Elena'.",
      parameters: {
        type: "object",
        properties: {
          patient: { type: "string", description: "Nome paziente o 'figlio di Elena'" },
          appointment_id: { type: "string" },
          new_day: { type: "string" },
          new_time: { type: "string" },
        },
        required: ["new_day", "new_time"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Prenota un nuovo appuntamento.",
      parameters: {
        type: "object",
        properties: {
          patient: { type: "string" },
          day: { type: "string" },
          time: { type: "string" },
          type: { type: "string" },
        },
        required: ["patient", "day", "time", "type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_whatsapp_reminder",
      description:
        "Prepara una bozza WhatsApp di promemoria (non invia). Per la signora Rosanna usa audience='Conti Rosanna' o 'signora Rosanna'.",
      parameters: {
        type: "object",
        properties: {
          audience: { type: "string" },
          text: { type: "string" },
        },
        required: ["audience", "text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_codice_fiscale",
      description:
        "Calcola un codice fiscale italiano. Se mancano dati per Mario, usa i default fittizi (Rossi Mario, M, 15/03/1985, Roma H501) e segnala le assunzioni.",
      parameters: {
        type: "object",
        properties: {
          first_name: { type: "string" },
          last_name: { type: "string" },
          sex: { type: "string", description: "M o F" },
          birth_day: { type: "number" },
          birth_month: { type: "number" },
          birth_year: { type: "number" },
          birth_place: { type: "string" },
          cadastral_code: { type: "string", description: "Codice catastale comune, es. H501 Roma" },
          use_mario_defaults: {
            type: "boolean",
            description: "true se l'utente chiede il CF di Mario senza altri dati",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_recall_list",
      description: "Costruisce una lista di richiami.",
      parameters: {
        type: "object",
        properties: { note: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
] as const;

function findAppointment(state: ClinicState, patient?: string, id?: string) {
  if (id) {
    const byId = state.appointments.find((item) => item.id === id);
    if (byId) return byId;
  }
  if (patient) {
    const needle = patient.toLowerCase();
    if (needle.includes("figlio") && needle.includes("elena")) {
      return state.appointments.find((item) => item.relation?.toLowerCase().includes("figlio di elena"));
    }
    if (needle.includes("rosanna")) {
      return state.appointments.find((item) => item.patient.toLowerCase().includes("rosanna"));
    }
    return state.appointments.find(
      (item) =>
        item.patient.toLowerCase().includes(needle) ||
        needle.includes(item.patient.toLowerCase().split(" ")[0]) ||
        (item.relation && item.relation.toLowerCase().includes(needle)),
    );
  }
  return undefined;
}

export type ToolExecution = {
  step: string;
  result: unknown;
  clinic: ClinicState;
};

export function applyDemoTool(
  state: ClinicState,
  name: string,
  args: Record<string, unknown>,
): ToolExecution {
  const clinic: ClinicState = {
    appointments: state.appointments.map((item) => ({ ...item })),
    drafts: state.drafts.map((item) => ({ ...item })),
    recalls: state.recalls.map((item) => ({ ...item })),
    lastCodiceFiscale: state.lastCodiceFiscale,
  };

  if (name === "list_appointments") {
    return { step: "Controllo agenda…", result: { appointments: clinic.appointments }, clinic };
  }

  if (name === "move_appointment") {
    const patient = typeof args.patient === "string" ? args.patient : undefined;
    const appointmentId = typeof args.appointment_id === "string" ? args.appointment_id : undefined;
    const newDay = String(args.new_day ?? "");
    const newTime = String(args.new_time ?? "");
    const appt = findAppointment(clinic, patient, appointmentId);
    if (!appt) {
      return {
        step: "Appuntamento non trovato",
        result: { ok: false, error: "Nessun appuntamento corrispondente." },
        clinic,
      };
    }
    appt.day = newDay;
    appt.time = newTime;
    return {
      step: `Slot trovato… Spostato ${appt.patient} → ${newDay} ${newTime}`,
      result: { ok: true, appointment: appt, relation: appt.relation },
      clinic,
    };
  }

  if (name === "book_appointment") {
    const next: Appointment = {
      id: `a${clinic.appointments.length + 1}`,
      patient: String(args.patient ?? "Paziente"),
      day: String(args.day ?? ""),
      time: String(args.time ?? ""),
      type: String(args.type ?? "Visita"),
    };
    clinic.appointments.push(next);
    return { step: `Confermato ✓ Prenotato ${next.patient}`, result: { ok: true, appointment: next }, clinic };
  }

  if (name === "draft_whatsapp_reminder") {
    let audience = String(args.audience ?? "");
    let text = String(args.text ?? "");
    if (/rosanna/i.test(audience) || /rosanna/i.test(text)) {
      const rosanna = clinic.appointments.find((item) => item.patient.toLowerCase().includes("rosanna"));
      if (!audience || /pazienti/i.test(audience)) audience = "Conti Rosanna";
      if (!text.trim()) {
        text = rosanna
          ? `Buongiorno signora Rosanna, le ricordiamo l'appuntamento di ${rosanna.day} alle ${rosanna.time} per ${rosanna.type.toLowerCase()}. Cordiali saluti, Studio Dentistico.`
          : "Buongiorno signora Rosanna, le ricordiamo l'appuntamento di domani. Cordiali saluti, Studio Dentistico.";
      }
    }
    const draft: WhatsAppDraft = {
      id: `d${clinic.drafts.length + 1}`,
      audience,
      text,
    };
    clinic.drafts = [draft, ...clinic.drafts].slice(0, 5);
    return {
      step: "Bozza WhatsApp pronta",
      result: { ok: true, draft, note: "Messaggio non inviato: serve conferma della segreteria." },
      clinic,
    };
  }

  if (name === "calculate_codice_fiscale") {
    const assumptions: string[] = [];
    const useDefaults = args.use_mario_defaults === true || (!args.last_name && !args.first_name);
    const firstName = String(args.first_name ?? (useDefaults ? MARIO_DEFAULTS.firstName : "")).trim() || MARIO_DEFAULTS.firstName;
    const lastName = String(args.last_name ?? (useDefaults ? MARIO_DEFAULTS.lastName : "")).trim() || MARIO_DEFAULTS.lastName;
    if (!args.first_name || !args.last_name || useDefaults) {
      assumptions.push("Nome e cognome: Mario Rossi (esempio)");
    }
    const sexRaw = String(args.sex ?? MARIO_DEFAULTS.sex).toUpperCase();
    const sex = sexRaw.startsWith("F") ? "F" : "M";
    if (!args.sex) assumptions.push("Sesso: M");
    const birthDay = Number(args.birth_day ?? MARIO_DEFAULTS.birthDay);
    const birthMonth = Number(args.birth_month ?? MARIO_DEFAULTS.birthMonth);
    const birthYear = Number(args.birth_year ?? MARIO_DEFAULTS.birthYear);
    if (args.birth_day == null || args.birth_month == null || args.birth_year == null) {
      assumptions.push("Data di nascita: 15/03/1985");
    }
    const birthPlace = String(args.birth_place ?? MARIO_DEFAULTS.birthPlace);
    const cadastralCode = String(args.cadastral_code ?? MARIO_DEFAULTS.cadastralCode);
    if (!args.cadastral_code) assumptions.push("Luogo di nascita: Roma (H501)");
    const code = computeCodiceFiscale({
      firstName,
      lastName,
      sex,
      birthDay,
      birthMonth,
      birthYear,
      cadastralCode,
    });
    clinic.lastCodiceFiscale = {
      fullName: `${lastName} ${firstName}`,
      code,
      assumptions,
    };
    return {
      step: "Codice fiscale calcolato",
      result: {
        ok: true,
        code,
        fullName: `${lastName} ${firstName}`,
        sex,
        birthDate: `${String(birthDay).padStart(2, "0")}/${String(birthMonth).padStart(2, "0")}/${birthYear}`,
        birthPlace,
        cadastralCode,
        assumptions,
        note: "Calcolo di esempio su dati fittizi o dichiarati dall'utente.",
      },
      clinic,
    };
  }

  if (name === "build_recall_list") {
    clinic.recalls = [
      { patient: "Conti Anna", reason: "Richiamo igiene a 6 mesi" },
      { patient: "Bruno Luca", reason: "Controllo post-cura" },
      { patient: "Ferrari Mia", reason: "Prima visita non completata" },
    ];
    return {
      step: "Lista richiami aggiornata",
      result: { ok: true, recalls: clinic.recalls, note: typeof args.note === "string" ? args.note : undefined },
      clinic,
    };
  }

  return {
    step: "Azione non disponibile",
    result: { ok: false, error: `Tool sconosciuto: ${name}` },
    clinic,
  };
}

export const clinicoKnowledge = `
Conoscenza Clinico (prodotto reale, da usare quando chiedono info su Clinico, prezzi, privacy, funzioni):
- Clinico è l'assistente AI per studi dentistici e medici. Canale principale: WhatsApp (integrazione ufficiale in arrivo). Altri canali arriveranno.
- Colleghi AI: Ginevra (richieste pazienti), Franco (agenda), Roberta (email/WhatsApp), Sofia (promemoria/richiami), Marco (memoria paziente). La segreteria decide regole e conferma: nulla parte senza di lei.
- Piani (IVA esclusa, fatturato mensilmente, disdici quando vuoi): Free €0/mese (uso AI e funzionalità limitate, gratis per sempre); Studio €29/mese (€14,50 AI, €5 WhatsApp); Clinica €79/mese (€39,50 AI, €10 WhatsApp, assistenza prioritaria); Gruppo €149/mese (€74,50 AI, €20 WhatsApp, assistenza prioritaria, più sedi).
- Compliance: orientato a GDPR e AI Act; dati ospitati in Europa; modelli Mistral in UE; i dati pazienti non servono ad addestrare modelli pubblici; l'assistente si presenta come AI e non dà pareri clinici. Non inventare certificazioni o audit: se chiedono dettagli formali, dì che sono disponibili su richiesta e rimanda a Privacy sul sito.
- Non inventare prezzi diversi da quelli sopra. Non promettere integrazioni già live se non lo sono.
`;
