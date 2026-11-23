import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";
import { clinicRecencyFromCookie, type ClinicRecency } from "@/lib/clinic-recency";
import { messageBody } from "@/lib/chat-thread";
import { asChatUnreadState, type ChatUnreadState } from "@/lib/chat-unread";
import { markdownToPlainText } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/server";

export const clinicIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function clinicShellTag(userId: string, clinicId: string) {
  return `clinic-shell:${userId}:${clinicId}`;
}

export type ClinicFrameChat = {
  id: string;
  title: string | null;
  color: string;
  emoji: string;
  preview: string | null;
  activityAt: string;
  people: { id: string; name: string }[];
  bots: { id: string; name: string; color: string; emoji: string }[];
  directBotId: string | null;
};

export type ClinicFrame = {
  clinic: { id: string; name: string };
  clinics: { id: string; name: string }[];
  chats: ClinicFrameChat[];
  people: { id: string; name: string }[];
  myBots: { id: string; name: string; color: string; emoji: string }[];
  recency: ClinicRecency;
  publicPage: boolean;
};

type PreviewEvent = {
  seq: number | string;
  kind: string;
  payload: unknown;
  created_at: string;
};

type SeatBot = { id: string; name: string; color: string; emoji: string };

type SeatRow = {
  user_id: string | null;
  bots: SeatBot | SeatBot[] | null;
};

type ChatRow = {
  id: string;
  title: string | null;
  color: string;
  emoji: string;
  direct_bot_id: string | null;
  created_at: string;
  chat_events: PreviewEvent[] | null;
  chat_participants: SeatRow[] | null;
};

function seatBots(seats: SeatRow[] | null): SeatBot[] {
  return (seats ?? []).flatMap((seat) => {
    const bot = seat.bots;
    const row = Array.isArray(bot) ? bot[0] : bot;
    if (!row?.id || !row.name || !row.color || !row.emoji) return [];
    return [{ id: row.id, name: row.name, color: row.color, emoji: row.emoji }];
  });
}

function asChats(rows: ChatRow[], profileName: Map<string, string>): ClinicFrameChat[] {
  return rows
    .map((row) => {
      const latest = [...(row.chat_events ?? [])].sort((a, b) => Number(b.seq) - Number(a.seq))[0];
      const previewBody = latest?.kind === "message" ? messageBody(latest.payload) : null;
      const people = (row.chat_participants ?? []).flatMap((seat) =>
        seat.user_id ? [{ id: seat.user_id, name: profileName.get(seat.user_id) ?? "Qualcuno" }] : [],
      );
      return {
        id: row.id,
        title: row.title,
        color: row.color,
        emoji: row.emoji,
        preview: previewBody ? markdownToPlainText(previewBody) : null,
        activityAt: latest?.created_at ?? row.created_at,
        people,
        bots: seatBots(row.chat_participants),
        directBotId: row.direct_bot_id,
      };
    })
    .sort((a, b) => b.activityAt.localeCompare(a.activityAt));
}

export async function loadClinicFrame(userId: string, clinicId: string): Promise<ClinicFrame | null> {
  "use cache: private";
  cacheTag(clinicShellTag(userId, clinicId));
  cacheLife({ stale: 300 });

  const supabase = await createClient();
  const [clinicResult, { data: memberships }, { data: rows }, { data: memberRows }, { data: myBotRows }, { data: publicPageRow }] =
    await Promise.all([
      supabase.from("clinics").select("id, name").eq("id", clinicId).maybeSingle(),
      supabase
        .from("memberships")
        .select("clinic_id, clinics(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("chats")
        .select(
          "id, title, color, emoji, direct_bot_id, created_at, chat_events(seq, kind, payload, created_at), chat_participants(user_id, bots(id, name, color, emoji)), chat_clinics!inner(clinic_id)",
        )
        .eq("chat_clinics.clinic_id", clinicId)
        .order("seq", { referencedTable: "chat_events", ascending: false })
        .limit(1, { referencedTable: "chat_events" }),
      supabase.from("memberships").select("user_id").eq("clinic_id", clinicId),
      supabase
        .from("bots")
        .select("id, name, color, emoji, bot_clinics!inner(clinic_id)")
        .eq("owner_user_id", userId)
        .eq("bot_clinics.clinic_id", clinicId),
      supabase
        .from("integrations")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("provider", "public_page")
        .eq("status", "connected")
        .maybeSingle(),
    ]);

  if (clinicResult.error) throw new Error(clinicResult.error.message);
  const clinic = clinicResult.data;
  if (!clinic) return null;

  const clinics = (memberships ?? []).flatMap((membership) => {
    const joined = membership.clinics as { name: string } | { name: string }[] | null;
    const name = Array.isArray(joined) ? joined[0]?.name : joined?.name;
    if (!name) return [];
    return [{ id: membership.clinic_id, name }];
  });
  if (!clinics.some((item) => item.id === clinic.id)) {
    clinics.unshift({ id: clinic.id, name: clinic.name });
  }

  const chatRows = (rows ?? []) as ChatRow[];
  const memberIds = [
    ...new Set((memberRows ?? []).flatMap((row) => (typeof row.user_id === "string" ? [row.user_id] : []))),
  ];
  const seatUserIds = chatRows.flatMap((row) =>
    (row.chat_participants ?? []).flatMap((seat) => (seat.user_id ? [seat.user_id] : [])),
  );
  const profileIds = [...new Set([...memberIds, ...seatUserIds])];
  const { data: profileRows } =
    profileIds.length > 0
      ? await supabase.from("profiles").select("id, email, name").in("id", profileIds)
      : { data: [] };
  const profileName = new Map(
    ((profileRows ?? []) as { id: string; email: string | null; name: string | null }[]).map((profile) => {
      const name = profile.name?.trim();
      const email = profile.email?.trim();
      return [profile.id, name || email || "Qualcuno"] as const;
    }),
  );

  const myBots = ((myBotRows ?? []) as { id: string; name: string; color: string; emoji: string }[])
    .flatMap((bot) =>
      bot.id && bot.name && bot.color && bot.emoji
        ? [{ id: bot.id, name: bot.name, color: bot.color, emoji: bot.emoji }]
        : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

  const cookieStore = await cookies();
  return {
    clinic: { id: clinic.id, name: clinic.name },
    clinics,
    chats: asChats(chatRows, profileName),
    people: memberIds.map((id) => ({ id, name: profileName.get(id) ?? "Qualcuno" })),
    myBots,
    recency: clinicRecencyFromCookie(cookieStore.get("clinic_view")?.value, clinic.id),
    publicPage: Boolean(publicPageRow?.id),
  };
}

export async function loadClinicChatItem(clinicId: string, chatId: string): Promise<ClinicFrameChat | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chats")
    .select(
      "id, title, color, emoji, direct_bot_id, created_at, chat_events(seq, kind, payload, created_at), chat_participants(user_id, bots(id, name, color, emoji)), chat_clinics!inner(clinic_id)",
    )
    .eq("id", chatId)
    .eq("chat_clinics.clinic_id", clinicId)
    .order("seq", { referencedTable: "chat_events", ascending: false })
    .limit(1, { referencedTable: "chat_events" })
    .maybeSingle();
  if (!data) return null;
  const row = data as ChatRow;
  const seatUserIds = (row.chat_participants ?? []).flatMap((seat) => (seat.user_id ? [seat.user_id] : []));
  const { data: profileRows } =
    seatUserIds.length > 0
      ? await supabase.from("profiles").select("id, email, name").in("id", seatUserIds)
      : { data: [] };
  const profileName = new Map(
    ((profileRows ?? []) as { id: string; email: string | null; name: string | null }[]).map((profile) => {
      const name = profile.name?.trim();
      const email = profile.email?.trim();
      return [profile.id, name || email || "Qualcuno"] as const;
    }),
  );
  return asChats([row], profileName)[0] ?? null;
}

export type PendingConfirmation = { id: string; botName: string; action: string };

export async function loadUserChatStates(userId: string): Promise<ChatUnreadState[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_user_state")
    .select(
      "chat_id, clinic_id, last_read_seq, unread_count, unread_mentions_count, marked_unread, last_message_seq, last_message_at, last_message_preview",
    )
    .eq("user_id", userId);
  return (data ?? []).flatMap((row) => {
    const parsed = asChatUnreadState(row);
    return parsed ? [parsed] : [];
  });
}

export async function loadPendingConfirmations(clinicId: string): Promise<PendingConfirmation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bot_confirmations")
    .select("id, action, bots(name)")
    .eq("clinic_id", clinicId)
    .eq("status", "pending")
    .order("created_at");
  return (data ?? []).flatMap((row) => {
    const action = typeof row.action === "string" ? row.action.trim() : "";
    if (!action) return [];
    const bot = Array.isArray(row.bots) ? row.bots[0] : row.bots;
    const botName = bot && typeof bot.name === "string" && bot.name.trim() ? bot.name.trim() : "Un agente";
    return [{ id: row.id, botName, action }];
  });
}
