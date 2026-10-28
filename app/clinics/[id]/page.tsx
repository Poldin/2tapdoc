import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { type AgendaEditPatient } from "@/components/agenda-edit-dialog";
import { type AgendaAppointment, type AgendaBlock, type AgendaLane } from "@/components/agenda-view";
import { ClinicShell, type BotMark, type ChatListItem, type ChatMessage } from "@/components/clinic-shell";
import { type BotActionRequest } from "@/components/bot-action-dialog";
import { asPatient, type PatientRecord } from "@/lib/patients";
import {
  type ClinicAsset,
  type ClinicIntegration,
  type ClinicMember,
  type ClinicRole,
  type Specialist,
} from "@/components/settings-view";
import { type ClinicOption } from "@/components/clinic-switcher";
import { getSessionUser } from "@/lib/auth/session";
import { clinicRecencyFromCookie, leadingPlace } from "@/lib/clinic-recency";
import { createClient } from "@/lib/supabase/server";
import { markdownToPlainText } from "@/lib/markdown";

export const instant = false;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EventRow = {
  id: string;
  seq: number;
  kind: string;
  payload: unknown;
  created_at: string;
  user_id: string | null;
  bot_id: string | null;
  preferred_at: string | null;
};

function messageBody(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = (payload as { body?: unknown }).body;
  return typeof body === "string" && body.trim() !== "" ? body : null;
}

type SeatRow = {
  bots: BotMark | BotMark[] | null;
};

type ChatRow = {
  id: string;
  title: string | null;
  color: string;
  emoji: string;
  created_at: string;
  chat_events: EventRow[] | null;
  chat_participants: SeatRow[] | null;
};

function soleBot(seats: SeatRow[] | null) {
  const bots = (seats ?? []).flatMap((seat) => {
    const bot = seat.bots;
    const row = Array.isArray(bot) ? bot[0] : bot;
    return row ? [row] : [];
  });
  return bots.length === 1 ? bots[0] : null;
}

export default async function ClinicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chat?: string; view?: string; patient?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { chat, view, patient: patientParam } = await searchParams;
  if (!uuidPattern.test(id)) notFound();
  const agendaOpen = view === "agenda";
  const patientsOpen = view === "patients";
  const settingsOpen = view === "settings";
  const selectedPatientId =
    patientsOpen && patientParam && uuidPattern.test(patientParam) ? patientParam : null;

  const supabase = await createClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!clinic) redirect("/clinics");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("clinic_id, clinics(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const clinics: ClinicOption[] = (memberships ?? []).flatMap((membership) => {
    const joined = membership.clinics as { name: string } | { name: string }[] | null;
    const name = Array.isArray(joined) ? joined[0]?.name : joined?.name;
    if (!name) return [];
    return [{ id: membership.clinic_id, name }];
  });
  if (!clinics.some((item) => item.id === clinic.id)) {
    clinics.unshift({ id: clinic.id, name: clinic.name });
  }

  const { data: rows } = await supabase
    .from("chats")
    .select(
      "id, title, color, emoji, created_at, chat_events(id, seq, kind, payload, created_at, user_id, bot_id, preferred_at), chat_participants(bots(id, name, color, emoji)), chat_clinics!inner(clinic_id)",
    )
    .eq("chat_clinics.clinic_id", id);

  const chats = ((rows ?? []) as ChatRow[])
    .map((row) => {
      const events = [...(row.chat_events ?? [])].sort((a, b) => a.seq - b.seq);
      const messages = events.flatMap((event) => {
        if (event.kind !== "message") return [];
        const body = messageBody(event.payload);
        return body ? [{ ...event, body }] : [];
      });
      const last = events.at(-1);
      return {
        id: row.id,
        title: row.title,
        color: row.color,
        emoji: row.emoji,
        preview: messages.length > 0 ? markdownToPlainText(messages[messages.length - 1].body) : null,
        activityAt: last?.created_at ?? row.created_at,
        bot: soleBot(row.chat_participants),
        hasEvents: events.length > 0,
        messages,
      };
    })
    .sort((a, b) => b.activityAt.localeCompare(a.activityAt));

  const cookieStore = await cookies();
  const recency = clinicRecencyFromCookie(cookieStore.get("clinic_view")?.value, clinic.id);
  const active =
    agendaOpen || patientsOpen || settingsOpen || !uuidPattern.test(chat ?? "")
      ? undefined
      : chats.find((item) => item.id === chat);
  if (!agendaOpen && !patientsOpen && !settingsOpen && !active) {
    const lead = leadingPlace(recency, chats[0]?.activityAt ?? null);
    if (lead === "agenda") redirect(`/clinics/${clinic.id}?view=agenda`);
    else if (lead === "patients") redirect(`/clinics/${clinic.id}?view=patients`);
    else if (lead === "settings") redirect(`/clinics/${clinic.id}?view=settings`);
    else if (chats[0]) redirect(`/clinics/${clinic.id}?chat=${chats[0].id}`);
  }

  let patients: PatientRecord[] = [];
  let selectedPatient: PatientRecord | null = null;
  let canWritePatients = false;
  if (patientsOpen && selectedPatientId) {
    const { data } = await supabase
      .from("patients")
      .select("id, given_name, family_name, date_of_birth, fiscal_code, phone, email, note")
      .eq("clinic_id", id)
      .eq("id", selectedPatientId)
      .maybeSingle();
    if (!data) redirect(`/clinics/${id}?view=patients`);
    selectedPatient = asPatient(data as {
      id: string;
      given_name: string;
      family_name: string;
      date_of_birth: string | null;
      fiscal_code: string | null;
      phone: string | null;
      email: string | null;
      note: string | null;
    });
  } else if (patientsOpen) {
    const [{ data }, { data: mine }] = await Promise.all([
      supabase
        .from("patients")
        .select("id, given_name, family_name, date_of_birth, fiscal_code, phone, email, note")
        .eq("clinic_id", id)
        .order("family_name")
        .order("given_name"),
      supabase
        .from("memberships")
        .select("clinic_role_id, clinic_roles(is_admin)")
        .eq("clinic_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    patients = ((data ?? []) as {
      id: string;
      given_name: string;
      family_name: string;
      date_of_birth: string | null;
      fiscal_code: string | null;
      phone: string | null;
      email: string | null;
      note: string | null;
    }[]).map(asPatient);
    const mineRole = mine?.clinic_roles as { is_admin: boolean } | { is_admin: boolean }[] | null;
    const admin = Boolean((Array.isArray(mineRole) ? mineRole[0] : mineRole)?.is_admin);
    if (admin) {
      canWritePatients = true;
    } else if (mine?.clinic_role_id) {
      const { data: perms } = await supabase
        .from("clinic_role_permissions")
        .select("permission_key")
        .eq("clinic_role_id", mine.clinic_role_id)
        .eq("permission_key", "patients.write");
      canWritePatients = Boolean(perms?.length);
    }
  }
  let settingsMembers: ClinicMember[] = [];
  let settingsRoles: ClinicRole[] = [];
  let specialists: Specialist[] = [];
  let assets: ClinicAsset[] = [];
  let integrations: ClinicIntegration[] = [];
  let canRenameClinic = false;
  let canManageMembers = false;
  let canManageRoles = false;
  let canManageAgenda = false;
  let canManageIntegrations = false;
  if (settingsOpen) {
    const [
      { data: memberRows },
      { data: roleRows },
      { data: mine },
      { data: doctorRows },
      { data: objectRows },
      { data: integrationRows },
    ] = await Promise.all([
        supabase
          .from("memberships")
          .select("id, user_id, clinic_role_id, clinic_roles(name, is_admin)")
          .eq("clinic_id", id)
          .order("created_at"),
        supabase
          .from("clinic_roles")
          .select("id, name, is_admin, clinic_role_permissions(permission_key)")
          .eq("clinic_id", id)
          .order("name"),
        supabase
          .from("memberships")
          .select("clinic_role_id, clinic_roles(is_admin)")
          .eq("clinic_id", id)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("doctors")
          .select("id, given_name, family_name, specialization, active, user_id")
          .eq("clinic_id", id)
          .order("family_name")
          .order("given_name"),
        supabase.from("clinical_objects").select("id, name, description").eq("clinic_id", id).order("name"),
        supabase
          .from("integrations")
          .select("id, provider, account, status, whatsapp_channels(credit_cents), whatsapp_messages(count)")
          .eq("clinic_id", id)
          .order("created_at"),
      ]);
    const userIds = [...new Set((memberRows ?? []).map((row) => row.user_id as string))];
    const { data: profileRows } =
      userIds.length > 0
        ? await supabase.from("profiles").select("id, email, name").in("id", userIds)
        : { data: [] };
    const profiles = new Map(
      ((profileRows ?? []) as { id: string; email: string | null; name: string | null }[]).map((profile) => [
        profile.id,
        {
          email: profile.email?.trim() || "Senza email",
          name: profile.name?.trim() || null,
        },
      ]),
    );
    settingsMembers = ((memberRows ?? []) as {
      id: string;
      user_id: string;
      clinic_role_id: string;
      clinic_roles: { name: string; is_admin: boolean } | { name: string; is_admin: boolean }[] | null;
    }[]).map((row) => {
      const joined = Array.isArray(row.clinic_roles) ? row.clinic_roles[0] : row.clinic_roles;
      const profile = profiles.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        name: profile?.name ?? null,
        email: profile?.email ?? "Senza email",
        roleId: row.clinic_role_id,
        role: joined?.name ?? "Senza ruolo",
      };
    });
    settingsRoles = ((roleRows ?? []) as {
      id: string;
      name: string;
      is_admin: boolean;
      clinic_role_permissions: { permission_key: string }[] | null;
    }[]).map((role) => ({
      id: role.id,
      name: role.name,
      admin: role.is_admin,
      permissions: (role.clinic_role_permissions ?? []).map((item) => item.permission_key),
    }));
    specialists = ((doctorRows ?? []) as {
      id: string;
      given_name: string;
      family_name: string;
      specialization: string | null;
      active: boolean;
      user_id: string | null;
    }[]).map((doctor) => ({
      id: doctor.id,
      givenName: doctor.given_name,
      familyName: doctor.family_name,
      specialization: doctor.specialization,
      userId: doctor.user_id,
      active: doctor.active,
    }));
    assets = ((objectRows ?? []) as { id: string; name: string; description: string | null }[]).map((object) => ({
      id: object.id,
      name: object.name,
      description: object.description,
    }));
    integrations = (
      (integrationRows ?? []) as {
        id: string;
        provider: string;
        account: string;
        status: string;
        whatsapp_channels: { credit_cents: number } | { credit_cents: number }[] | null;
        whatsapp_messages: { count: number }[];
      }[]
    ).map((row) => {
      const channel = Array.isArray(row.whatsapp_channels) ? row.whatsapp_channels[0] : row.whatsapp_channels;
      const counted = Array.isArray(row.whatsapp_messages) ? row.whatsapp_messages[0]?.count : 0;
      const messageCount = typeof counted === "number" ? counted : Number(counted);
      const messages = Number.isFinite(messageCount) ? messageCount : 0;
      return {
        id: row.id,
        provider: row.provider,
        account: row.account,
        status: row.status,
        whatsapp:
          row.provider === "whatsapp"
            ? { creditCents: channel?.credit_cents ?? 0, messageCount: messages }
            : null,
      };
    });
    const mineRole = mine?.clinic_roles as { is_admin: boolean } | { is_admin: boolean }[] | null;
    const admin = Boolean((Array.isArray(mineRole) ? mineRole[0] : mineRole)?.is_admin);
    if (admin) {
      canRenameClinic = true;
      canManageMembers = true;
      canManageRoles = true;
      canManageAgenda = true;
      canManageIntegrations = true;
    } else if (mine?.clinic_role_id) {
      const { data: perms } = await supabase
        .from("clinic_role_permissions")
        .select("permission_key")
        .eq("clinic_role_id", mine.clinic_role_id)
        .in("permission_key", ["clinic.update", "members.manage", "roles.manage", "agenda.write", "integrations.manage"]);
      const keys = new Set((perms ?? []).map((row) => row.permission_key));
      canRenameClinic = keys.has("clinic.update");
      canManageMembers = keys.has("members.manage");
      canManageRoles = keys.has("roles.manage");
      canManageAgenda = keys.has("agenda.write");
      canManageIntegrations = keys.has("integrations.manage");
    }
  }
  let lanes: AgendaLane[] = [];
  let agendaAppointments: AgendaAppointment[] = [];
  let agendaBlocks: AgendaBlock[] = [];
  let agendaPatients: AgendaEditPatient[] = [];
  if (agendaOpen) {
    const [
      { data: doctors },
      { data: objects },
      { data: appointmentRows },
      { data: blockRows },
      { data: mine },
      { data: patientRows },
    ] = await Promise.all([
      supabase
        .from("doctors")
        .select("id, given_name, family_name")
        .eq("clinic_id", id)
        .eq("active", true)
        .order("family_name")
        .order("given_name"),
      supabase.from("clinical_objects").select("id, name").eq("clinic_id", id).order("name"),
      supabase
        .from("appointments")
        .select(
          "id, title, note, starts_at, ends_at, appointment_doctors(doctor_id), appointment_objects(clinical_object_id), appointment_patients(patient_id, patients(given_name, family_name))",
        )
        .eq("clinic_id", id)
        .order("starts_at"),
      supabase
        .from("agenda_blocks")
        .select(
          "id, title, description, starts_at, ends_at, agenda_block_doctors(doctor_id), agenda_block_objects(clinical_object_id)",
        )
        .eq("clinic_id", id)
        .order("starts_at"),
      supabase
        .from("memberships")
        .select("clinic_role_id, clinic_roles(is_admin)")
        .eq("clinic_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("patients")
        .select("id, given_name, family_name")
        .eq("clinic_id", id)
        .order("family_name")
        .order("given_name"),
    ]);
    const mineRole = mine?.clinic_roles as { is_admin: boolean } | { is_admin: boolean }[] | null;
    const admin = Boolean((Array.isArray(mineRole) ? mineRole[0] : mineRole)?.is_admin);
    if (admin) {
      canManageAgenda = true;
    } else if (mine?.clinic_role_id) {
      const { data: perms } = await supabase
        .from("clinic_role_permissions")
        .select("permission_key")
        .eq("clinic_role_id", mine.clinic_role_id)
        .eq("permission_key", "agenda.write");
      canManageAgenda = Boolean(perms?.length);
    }
    lanes = [
      ...((doctors ?? []) as { id: string; given_name: string; family_name: string }[]).map((doctor) => ({
        id: doctor.id,
        kind: "specialist" as const,
        name: `${doctor.given_name} ${doctor.family_name}`.replace(/\s+/g, " ").trim(),
      })),
      ...((objects ?? []) as { id: string; name: string }[]).map((object) => ({
        id: object.id,
        kind: "asset" as const,
        name: object.name.trim(),
      })),
    ];
    agendaAppointments = (
      (appointmentRows ?? []) as {
        id: string;
        title: string | null;
        note: string | null;
        starts_at: string;
        ends_at: string;
        appointment_doctors: { doctor_id: string }[] | null;
        appointment_objects: { clinical_object_id: string }[] | null;
        appointment_patients:
          | {
              patient_id: string;
              patients:
                | { given_name: string; family_name: string }
                | { given_name: string; family_name: string }[]
                | null;
            }[]
          | null;
      }[]
    ).map((row) => ({
      id: row.id,
      title: row.title,
      note: row.note,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      doctorIds: (row.appointment_doctors ?? []).map((item) => item.doctor_id),
      objectIds: (row.appointment_objects ?? []).map((item) => item.clinical_object_id),
      patientIds: (row.appointment_patients ?? []).map((item) => item.patient_id),
      patientNames: (row.appointment_patients ?? []).flatMap((item) => {
        const patient = Array.isArray(item.patients) ? item.patients[0] : item.patients;
        if (!patient) return [];
        const full = `${patient.given_name} ${patient.family_name}`.replace(/\s+/g, " ").trim();
        return full ? [full] : [];
      }),
    }));
    agendaBlocks = (
      (blockRows ?? []) as {
        id: string;
        title: string;
        description: string | null;
        starts_at: string;
        ends_at: string;
        agenda_block_doctors: { doctor_id: string }[] | null;
        agenda_block_objects: { clinical_object_id: string }[] | null;
      }[]
    ).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      doctorIds: (row.agenda_block_doctors ?? []).map((item) => item.doctor_id),
      objectIds: (row.agenda_block_objects ?? []).map((item) => item.clinical_object_id),
    }));
    agendaPatients = ((patientRows ?? []) as { id: string; given_name: string; family_name: string }[]).flatMap(
      (patient) => {
        const name = `${patient.given_name} ${patient.family_name}`.replace(/\s+/g, " ").trim();
        return name ? [{ id: patient.id, name }] : [];
      },
    );
  }

  const list: ChatListItem[] = chats.map(({ id: chatId, title, color, emoji, preview, activityAt, bot }) => ({
    id: chatId,
    title,
    color,
    emoji,
    preview,
    activityAt,
    bot,
  }));
  const messages: ChatMessage[] = (active?.messages ?? []).map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.created_at,
    mine: message.user_id === user.id,
    botId: message.bot_id,
    preferredAt: message.preferred_at,
  }));

  const { data: confirmationRows } = await supabase
    .from("bot_confirmations")
    .select("id, action, bots(name)")
    .eq("clinic_id", clinic.id)
    .eq("status", "pending")
    .order("created_at");
  const confirmations: BotActionRequest[] = (confirmationRows ?? []).flatMap((row) => {
    const action = typeof row.action === "string" ? row.action.trim() : "";
    if (!action) return [];
    const bot = Array.isArray(row.bots) ? row.bots[0] : row.bots;
    const botName = bot && typeof bot.name === "string" && bot.name.trim() ? bot.name.trim() : "Un agente";
    return [{ id: row.id, botName, action }];
  });

  return (
    <ClinicShell
      clinicId={clinic.id}
      clinicName={clinic.name}
      clinics={clinics}
      email={user.email}
      chats={list}
      activeChatId={active?.id ?? null}
      messages={messages}
      hasEvents={active?.hasEvents ?? false}
      agendaOpen={agendaOpen}
      lanes={lanes}
      appointments={agendaAppointments}
      blocks={agendaBlocks}
      agendaPatients={agendaPatients}
      patientsOpen={patientsOpen}
      patients={patients}
      selectedPatient={selectedPatient}
      canWritePatients={canWritePatients}
      settingsOpen={settingsOpen}
      settingsMembers={settingsMembers}
      settingsRoles={settingsRoles}
      specialists={specialists}
      assets={assets}
      integrations={integrations}
      metaAppId={process.env.META_APP_ID?.trim() ?? ""}
      metaConfigId={process.env.META_CONFIG_ID?.trim() ?? ""}
      metaGraphVersion={process.env.META_GRAPH_VERSION?.trim() || "v26.0"}
      canRenameClinic={canRenameClinic}
      canManageMembers={canManageMembers}
      canManageRoles={canManageRoles}
      canManageAgenda={canManageAgenda}
      canManageIntegrations={canManageIntegrations}
      currentUserId={user.id}
      recency={recency}
      confirmations={confirmations}
    />
  );
}
