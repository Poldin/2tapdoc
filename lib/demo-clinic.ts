import {
  calcolaCodiceFiscaleTool,
  computeCodiceFiscale,
  executeCalcolaCodiceFiscale,
} from "@/lib/codice-fiscale";

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

/** Fictional defaults for the landing "Mario" suggestion when anagrafica is incomplete. */
export const MARIO_DEFAULTS = {
  cognome: "Rossi",
  nome: "Mario",
  sesso: "M" as const,
  dataNascita: "1985-03-15",
  luogoNascita: "Roma",
};

export { computeCodiceFiscale };

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
        "Sposta un appuntamento. Per il figlio di Elena usa patient='Galli Luca' oppure 'figlio di Elena'. Se l'utente non indica giorno/ora, proponi giovedì 16:30 e chiama subito questo tool con quei valori (la UI chiederà conferma).",
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
  calcolaCodiceFiscaleTool,
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
    return { step: `Confermato — Prenotato ${next.patient}`, result: { ok: true, appointment: next }, clinic };
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

  if (name === "calcola_codice_fiscale" || name === "calculate_codice_fiscale") {
    const assumptions: string[] = [];
    const looksLikeMario =
      (typeof args.nome === "string" && /^mario$/i.test(args.nome.trim()) && !args.cognome) ||
      (typeof args.first_name === "string" && /^mario$/i.test(args.first_name.trim())) ||
      args.use_mario_defaults === true;

    let cognome =
      (typeof args.cognome === "string" && args.cognome) ||
      (typeof args.last_name === "string" && args.last_name) ||
      "";
    let nome =
      (typeof args.nome === "string" && args.nome) ||
      (typeof args.first_name === "string" && args.first_name) ||
      "";
    let sesso =
      (typeof args.sesso === "string" && args.sesso) ||
      (typeof args.sex === "string" && args.sex) ||
      "";
    let dataNascita =
      (typeof args.data_nascita === "string" && args.data_nascita) ||
      (typeof args.dataNascita === "string" && args.dataNascita) ||
      "";
    let luogoNascita =
      (typeof args.luogo_nascita === "string" && args.luogo_nascita) ||
      (typeof args.luogoNascita === "string" && args.luogoNascita) ||
      (typeof args.birth_place === "string" && args.birth_place) ||
      (typeof args.cadastral_code === "string" && args.cadastral_code) ||
      "";

    // Legacy numeric birth fields from older tool schema
    if (!dataNascita && (args.birth_year != null || args.birth_month != null || args.birth_day != null)) {
      const y = Number(args.birth_year);
      const m = Number(args.birth_month);
      const d = Number(args.birth_day);
      if (y && m && d) {
        dataNascita = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    const missing =
      !cognome.trim() || !nome.trim() || !sesso.trim() || !dataNascita.trim() || !luogoNascita.trim();

    if (missing && looksLikeMario) {
      if (!cognome.trim()) {
        cognome = MARIO_DEFAULTS.cognome;
        assumptions.push("Cognome: Rossi (esempio)");
      }
      if (!nome.trim()) {
        nome = MARIO_DEFAULTS.nome;
        assumptions.push("Nome: Mario (esempio)");
      }
      if (!sesso.trim()) {
        sesso = MARIO_DEFAULTS.sesso;
        assumptions.push("Sesso: M (esempio)");
      }
      if (!dataNascita.trim()) {
        dataNascita = MARIO_DEFAULTS.dataNascita;
        assumptions.push("Data di nascita: 15/03/1985 (esempio)");
      }
      if (!luogoNascita.trim()) {
        luogoNascita = MARIO_DEFAULTS.luogoNascita;
        assumptions.push("Luogo di nascita: Roma / H501 (esempio)");
      }
    }

    const executed = executeCalcolaCodiceFiscale({
      cognome,
      nome,
      sesso,
      data_nascita: dataNascita,
      luogo_nascita: luogoNascita,
    });

    if (!executed.ok) {
      return {
        step: "Codice fiscale: dati incompleti",
        result: executed,
        clinic,
      };
    }

    clinic.lastCodiceFiscale = {
      fullName: `${executed.cognome} ${executed.nome}`,
      code: executed.codice,
      assumptions,
    };

    return {
      step: "Codice fiscale calcolato",
      result: {
        ok: true,
        codice: executed.codice,
        code: executed.codice,
        fullName: `${executed.cognome} ${executed.nome}`,
        sesso: executed.sesso,
        dataNascita: executed.dataNascita,
        luogoNascita: executed.luogoNascita,
        codiceCatastale: executed.codiceCatastale,
        assumptions,
        note: "Calcolato con algoritmo ufficiale. Non inventare mai il CF: usa sempre questo tool.",
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