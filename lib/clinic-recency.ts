export type ClinicRecency = {
  agendaAt: string | null;
  patientsAt: string | null;
  settingsAt: string | null;
};

const cookieName = "clinic_view";

export const emptyClinicRecency: ClinicRecency = {
  agendaAt: null,
  patientsAt: null,
  settingsAt: null,
};

type Entry = { a?: unknown; p?: unknown; s?: unknown };

function asIso(value: unknown) {
  return typeof value === "string" && value.length >= 20 ? value : null;
}

function fromEntry(entry: Entry | undefined): ClinicRecency {
  if (!entry || typeof entry !== "object") return emptyClinicRecency;
  return { agendaAt: asIso(entry.a), patientsAt: asIso(entry.p), settingsAt: asIso(entry.s) };
}

export function clinicRecencyFromCookie(raw: string | undefined, clinicId: string): ClinicRecency {
  if (!raw) return emptyClinicRecency;
  try {
    const text = raw.startsWith("%") ? decodeURIComponent(raw) : raw;
    const store = JSON.parse(text) as Record<string, Entry>;
    return fromEntry(store?.[clinicId]);
  } catch {
    return emptyClinicRecency;
  }
}

function readStore(): Record<string, Entry> {
  const match = document.cookie.match(/(?:^|; )clinic_view=([^;]*)/);
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1])) as Record<string, Entry>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, Entry>) {
  document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(store))}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function toEntry(recency: ClinicRecency): Entry {
  return {
    ...(recency.agendaAt ? { a: recency.agendaAt } : {}),
    ...(recency.patientsAt ? { p: recency.patientsAt } : {}),
    ...(recency.settingsAt ? { s: recency.settingsAt } : {}),
  };
}

function remember(clinicId: string, key: keyof ClinicRecency): ClinicRecency {
  const now = new Date().toISOString();
  const store = readStore();
  const current = fromEntry(store[clinicId]);
  const next = { ...current, [key]: now };
  store[clinicId] = toEntry(next);
  writeStore(store);
  return next;
}

export function rememberAgenda(clinicId: string): ClinicRecency {
  return remember(clinicId, "agendaAt");
}

export function rememberPatients(clinicId: string): ClinicRecency {
  return remember(clinicId, "patientsAt");
}

export function rememberSettings(clinicId: string): ClinicRecency {
  return remember(clinicId, "settingsAt");
}

export function leadingPlace(recency: ClinicRecency, newestChatAt: string | null) {
  const floor = newestChatAt ?? "";
  const ranked = [
    recency.agendaAt && recency.agendaAt > floor ? { view: "agenda" as const, at: recency.agendaAt } : null,
    recency.patientsAt && recency.patientsAt > floor ? { view: "patients" as const, at: recency.patientsAt } : null,
    recency.settingsAt && recency.settingsAt > floor ? { view: "settings" as const, at: recency.settingsAt } : null,
  ].filter((item): item is { view: "agenda" | "patients" | "settings"; at: string } => item !== null);
  ranked.sort((a, b) => b.at.localeCompare(a.at));
  return ranked[0]?.view ?? null;
}

export function placeByRecency<T extends { activityAt: string }>(
  chats: T[],
  pins: { id: string; at: string | null }[],
) {
  const timed = [
    ...chats.map((chat) => ({ kind: "chat" as const, chat, at: chat.activityAt })),
    ...pins.flatMap((pin) => (pin.at ? [{ kind: "pin" as const, id: pin.id, at: pin.at }] : [])),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const resting = pins.filter((pin) => !pin.at);
  return [
    ...timed.map((item) =>
      item.kind === "chat" ? { kind: "chat" as const, chat: item.chat } : { kind: "pin" as const, id: item.id },
    ),
    ...resting.map((pin) => ({ kind: "pin" as const, id: pin.id })),
  ];
}
