export type Appointment = {
  id: string;
  patient: string;
  day: string;
  time: string;
  type: string;
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
};

export const initialClinicState = (): ClinicState => ({
  appointments: [
    { id: "a1", patient: "Rossi Mario", day: "mercoledì", time: "10:00", type: "Controllo" },
    { id: "a2", patient: "Bianchi Laura", day: "giovedì", time: "16:00", type: "Igiene" },
    { id: "a3", patient: "Verdi Sara", day: "venerdì", time: "09:30", type: "Prima visita" },
    { id: "a4", patient: "Neri Paolo", day: "domani", time: "11:00", type: "Controllo" },
    { id: "a5", patient: "Galli Elena", day: "domani", time: "15:30", type: "Igiene" },
  ],
  drafts: [],
  recalls: [],
});

export const mistralTools = [
  {
    type: "function",
    function: {
      name: "list_appointments",
      description: "Elenca gli appuntamenti dell'agenda demo dello Studio Dentistico Demo.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "move_appointment",
      description: "Sposta un appuntamento esistente a un altro giorno/orario. Cerca per paziente se non hai l'id.",
      parameters: {
        type: "object",
        properties: {
          patient: { type: "string", description: "Cognome o nome del paziente" },
          appointment_id: { type: "string" },
          new_day: { type: "string", description: "es. giovedì, venerdì, domani" },
          new_time: { type: "string", description: "es. 09:30" },
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
      description: "Prenota un nuovo appuntamento nell'agenda demo.",
      parameters: {
        type: "object",
        properties: {
          patient: { type: "string" },
          day: { type: "string" },
          time: { type: "string" },
          type: { type: "string", description: "Controllo, Igiene, Prima visita, ..." },
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
      description: "Prepara una bozza di promemoria WhatsApp (non invia messaggi reali). Per i pazienti di un giorno o un paziente.",
      parameters: {
        type: "object",
        properties: {
          audience: { type: "string", description: "es. pazienti di domani, Rossi Mario" },
          text: { type: "string", description: "Testo della bozza" },
        },
        required: ["audience", "text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_recall_list",
      description: "Costruisce una lista di richiami demo (pazienti da ricontattare).",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "Eventuale nota sulla lista" },
        },
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
    return state.appointments.find(
      (item) => item.patient.toLowerCase().includes(needle) || needle.includes(item.patient.toLowerCase().split(" ")[0]),
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
  };

  if (name === "list_appointments") {
    return {
      step: "Controllo agenda…",
      result: { appointments: clinic.appointments },
      clinic,
    };
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
        result: { ok: false, error: "Nessun appuntamento corrispondente nell'agenda demo." },
        clinic,
      };
    }
    appt.day = newDay;
    appt.time = newTime;
    return {
      step: `Slot trovato… Spostato ${appt.patient} → ${newDay} ${newTime}`,
      result: { ok: true, appointment: appt },
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
    return {
      step: `Confermato ✓ Prenotato ${next.patient}`,
      result: { ok: true, appointment: next },
      clinic,
    };
  }

  if (name === "draft_whatsapp_reminder") {
    const draft: WhatsAppDraft = {
      id: `d${clinic.drafts.length + 1}`,
      audience: String(args.audience ?? ""),
      text: String(args.text ?? ""),
    };
    clinic.drafts = [draft, ...clinic.drafts].slice(0, 5);
    return {
      step: "Bozza WhatsApp pronta (non inviata)",
      result: { ok: true, draft, note: "Nessun messaggio reale è stato inviato." },
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
