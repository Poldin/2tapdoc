import { botFaceIds, isListed } from "@/lib/marks";
import { parsePublicPageCard, type PublicPageCard } from "@/lib/public-page-card";

export type PublicPagePerson = {
  name: string;
  specialization: string | null;
};

export type PublicPagePlace = {
  name: string;
  kind: string;
};

export type PublicPageSession = {
  id: string;
  lastAt: string;
  visitorMessages: number;
  replies: number;
  preview: string;
};

export type PublicPageBot = {
  id: string;
  name: string;
  color: string;
  emoji: string;
};

export type PublicPageDesk = PublicPageCard & {
  slug: string;
  emoji: string;
  bot: PublicPageBot | null;
  specialists: PublicPagePerson[];
  places: PublicPagePlace[];
  sessions: PublicPageSession[];
  tokens: { input: number; output: number };
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function count(value: unknown) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isInteger(numeric) || numeric < 0 || numeric > 2_000_000_000) {
    return null;
  }
  return numeric;
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function parsePublicPageBot(value: unknown): PublicPageBot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  const name = text(row.name, 40);
  const color = text(row.color, 40);
  const emoji = text(row.emoji, 80);
  if (!uuidPattern.test(id) || !name || !isListed(botFaceIds, emoji)) return null;
  return { id, name, color, emoji };
}

export function parseClinicBots(value: unknown): PublicPageBot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const bot = parsePublicPageBot(item);
    return bot ? [bot] : [];
  });
}

export function parsePublicPageDesk(value: unknown): PublicPageDesk | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const slug = text(row.slug, 80);
  if (!slugPattern.test(slug)) return null;

  const specialists = Array.isArray(row.specialists)
    ? row.specialists.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const doctor = item as Record<string, unknown>;
        const name = text(doctor.name, 160);
        if (!name) return [];
        const specialization = text(doctor.specialization, 160);
        return [{ name, specialization: specialization || null }];
      })
    : [];

  const places = Array.isArray(row.places)
    ? row.places.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const place = item as Record<string, unknown>;
        const name = text(place.name, 120);
        if (!name) return [];
        const kind = place.kind === "room" ? "room" : "object";
        return [{ name, kind }];
      })
    : [];

  const sessions = Array.isArray(row.sessions)
    ? row.sessions.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const session = item as Record<string, unknown>;
        const id = typeof session.id === "string" ? session.id : "";
        const lastAt = typeof session.lastAt === "string" ? session.lastAt : "";
        const visitorMessages = count(session.visitorMessages);
        const replies = count(session.replies);
        if (!uuidPattern.test(id) || Number.isNaN(Date.parse(lastAt)) || visitorMessages == null || replies == null) {
          return [];
        }
        return [
          {
            id,
            lastAt,
            visitorMessages,
            replies,
            preview: text(session.preview, 160),
          },
        ];
      })
    : [];

  const tokens = row.tokens && typeof row.tokens === "object" ? (row.tokens as Record<string, unknown>) : {};
  const input = count(tokens.input) ?? 0;
  const output = count(tokens.output) ?? 0;

  const face = text(row.emoji, 80);
  return {
    slug,
    emoji: isListed(botFaceIds, face) ? face : "smile",
    bot: null,
    ...parsePublicPageCard(row),
    specialists,
    places,
    sessions,
    tokens: { input, output },
  };
}
