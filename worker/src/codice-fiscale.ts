import catastaliJson from "./data/codici-catastali.json" with { type: "json" };

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

export type Sex = "M" | "F";

export type CodiceFiscaleInput = {
  cognome: string;
  nome: string;
  sesso: Sex;
  /** ISO date YYYY-MM-DD or Italian DD/MM/YYYY */
  dataNascita: string;
  /** Comune name, foreign state name, or Belfiore/cadastral code (e.g. H501) */
  luogoNascita: string;
};

export type CodiceFiscaleResult = {
  codice: string;
  cognome: string;
  nome: string;
  sesso: Sex;
  dataNascita: string;
  luogoNascita: string;
  codiceCatastale: string;
};

let catastaliCache: Map<string, string> | null = null;

function normalizePlaceKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lazy-load the comuni / foreign-state cadastral map (server-side). */
export function getCodiciCatastali(): Map<string, string> {
  if (catastaliCache) return catastaliCache;
  const map = new Map<string, string>();
  const raw = catastaliJson as Record<string, string>;
  for (const [key, code] of Object.entries(raw)) {
    map.set(key, code);
  }
  catastaliCache = map;
  return map;
}

export function onlyLetters(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function consonants(value: string) {
  return onlyLetters(value).replace(/[AEIOU]/g, "");
}

export function vowels(value: string) {
  return onlyLetters(value).replace(/[^AEIOU]/g, "");
}

/** Surname: consonants then vowels, pad with X to 3. */
export function encodeCognome(cognome: string) {
  return (consonants(cognome) + vowels(cognome) + "XXX").slice(0, 3);
}

/**
 * Name: if 4+ consonants take 1st, 3rd, 4th; else consonants then vowels, pad with X.
 */
export function encodeNome(nome: string) {
  const cons = consonants(nome);
  const raw = cons.length >= 4 ? `${cons[0]}${cons[2]}${cons[3]}` : cons + vowels(nome) + "XXX";
  return raw.slice(0, 3);
}

export function checkChar(partial: string) {
  let sum = 0;
  for (let i = 0; i < partial.length; i += 1) {
    const ch = partial[i];
    sum += i % 2 === 0 ? ODD_MAP[ch] ?? 0 : EVEN_MAP[ch] ?? 0;
  }
  return CHECK_CHARS[sum % 26];
}

export function parseDataNascita(value: string): { day: number; month: number; year: number } {
  const trimmed = value.trim();
  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
  m = trimmed.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) {
    return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
  }
  throw new Error(`Data di nascita non valida: ${value}. Usa YYYY-MM-DD o DD/MM/YYYY.`);
}

export function resolveCodiceCatastale(luogoNascita: string): { code: string; matchedAs: string } {
  const raw = luogoNascita.trim();
  if (!raw) throw new Error("Luogo di nascita mancante.");

  // Already a Belfiore code (letter + 3 digits), e.g. H501 or Z110
  const codeCandidate = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]\d{3}$/.test(codeCandidate)) {
    return { code: codeCandidate, matchedAs: codeCandidate };
  }

  const key = normalizePlaceKey(raw);
  const map = getCodiciCatastali();
  const direct = map.get(key);
  if (direct) return { code: direct, matchedAs: key };

  // Try without common prefixes
  for (const prefix of ["COMUNE DI ", "CITTA DI ", "CITTA' DI "]) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length).trim();
      const hit = map.get(rest);
      if (hit) return { code: hit, matchedAs: rest };
    }
  }

  throw new Error(
    `Comune o stato non trovato per "${luogoNascita}". Indica il nome del comune (es. Roma) o il codice catastale (es. H501).`,
  );
}

export function computeCodiceFiscale(input: CodiceFiscaleInput): CodiceFiscaleResult {
  const cognome = input.cognome?.trim();
  const nome = input.nome?.trim();
  const sesso = (input.sesso || "").toUpperCase() as Sex;
  if (!cognome) throw new Error("Cognome mancante.");
  if (!nome) throw new Error("Nome mancante.");
  if (sesso !== "M" && sesso !== "F") throw new Error("Sesso non valido: usa M o F.");

  const { day, month, year } = parseDataNascita(input.dataNascita);
  if (month < 1 || month > 12) throw new Error("Mese di nascita non valido.");
  if (day < 1 || day > 31) throw new Error("Giorno di nascita non valido.");
  if (year < 1900 || year > 2100) throw new Error("Anno di nascita non valido.");

  const place = resolveCodiceCatastale(input.luogoNascita);
  const yy = String(year).slice(-2).padStart(2, "0");
  const mm = MONTH_CODES[month - 1];
  let ddNum = day;
  if (sesso === "F") ddNum += 40;
  const dd = String(ddNum).padStart(2, "0");

  const partial = `${encodeCognome(cognome)}${encodeNome(nome)}${yy}${mm}${dd}${place.code}`;
  const codice = partial + checkChar(partial);

  return {
    codice,
    cognome,
    nome,
    sesso,
    dataNascita: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    luogoNascita: input.luogoNascita.trim(),
    codiceCatastale: place.code,
  };
}

/** Mistral function-tool schema shared by agents. */
export const calcolaCodiceFiscaleTool = {
  type: "function" as const,
  function: {
    name: "calcola_codice_fiscale",
    description:
      "Calcola il codice fiscale italiano con l'algoritmo ufficiale. Obbligatorio quando serve un CF: non inventare mai il codice. Se manca cognome, nome, sesso, data o luogo di nascita, chiedili all'utente prima di chiamare il tool.",
    parameters: {
      type: "object",
      properties: {
        cognome: { type: "string", description: "Cognome" },
        nome: { type: "string", description: "Nome" },
        sesso: { type: "string", enum: ["M", "F"], description: "Sesso anagrafico M o F" },
        data_nascita: {
          type: "string",
          description: "Data di nascita YYYY-MM-DD oppure DD/MM/YYYY",
        },
        luogo_nascita: {
          type: "string",
          description: "Comune o stato di nascita (es. Roma) oppure codice catastale (es. H501)",
        },
      },
      required: ["cognome", "nome", "sesso", "data_nascita", "luogo_nascita"],
      additionalProperties: false,
    },
  },
};

export function executeCalcolaCodiceFiscale(args: Record<string, unknown>) {
  const cognome = typeof args.cognome === "string" ? args.cognome : "";
  const nome = typeof args.nome === "string" ? args.nome : "";
  const sesso = typeof args.sesso === "string" ? args.sesso.toUpperCase() : "";
  const dataNascita =
    typeof args.data_nascita === "string"
      ? args.data_nascita
      : typeof args.dataNascita === "string"
        ? args.dataNascita
        : "";
  const luogoNascita =
    typeof args.luogo_nascita === "string"
      ? args.luogo_nascita
      : typeof args.luogoNascita === "string"
        ? args.luogoNascita
        : "";

  try {
    const result = computeCodiceFiscale({
      cognome,
      nome,
      sesso: sesso as Sex,
      dataNascita,
      luogoNascita,
    });
    return { ok: true as const, ...result };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Calcolo codice fiscale non riuscito.",
    };
  }
}