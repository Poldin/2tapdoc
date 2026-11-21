import { redirect } from "next/navigation";
import { type AgendaEditPatient } from "@/components/agenda-edit-dialog";
import { AgendaView, type AgendaAppointment, type AgendaBlock, type AgendaLane } from "@/components/agenda-view";
import { ChatThread } from "@/components/chat-thread-panel";
import { PatientPage } from "@/components/patient-page";
import { PatientsView } from "@/components/patients-view";
import { SettingsPanel } from "@/components/settings-panel";
import {
  type ClinicAsset,
  type ClinicIntegration,
  type ClinicMember,
  type ClinicRole,
  type Specialist,
} from "@/components/settings-view";
import { getSessionUser } from "@/lib/auth/session";
import { leadingPlace } from "@/lib/clinic-recency";
import { clinicIdPattern, loadClinicFrame } from "@/lib/clinic-frame";
import { loadChatThread } from "@/lib/chat-thread";
import { asPatient, type PatientRecord } from "@/lib/patients";
import { createClient } from "@/lib/supabase/server";

type SeatBot = { id: string; name: string; color: string; emoji: string };
type SeatRow = { user_id: string | null; bots: SeatBot | SeatBot[] | null };

function seatBots(seats: SeatRow[] | null): SeatBot[] {
  return (seats ?? []).flatMap((seat) => {
    const bot = seat.bots;
    const row = Array.isArray(bot) ? bot[0] : bot;
    if (!row?.id || !row.name || !row.color || !row.emoji) return [];
    return [{ id: row.id, name: row.name, color: row.color, emoji: row.emoji }];
  });
}

async function landingPath(userId: string, clinicId: string) {
  const frame = await loadClinicFrame(userId, clinicId);
  if (!frame) return "/clinics";
  const lead = leadingPlace(frame.recency, frame.chats[0]?.activityAt ?? null);
  if (lead) return `/clinics/${clinicId}?view=${lead}`;
  if (frame.chats[0]) return `/clinics/${clinicId}?chat=${frame.chats[0].id}`;
  return null;
}

export async function ClinicPanel({
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
  if (!clinicIdPattern.test(id)) redirect("/clinics");

  const agendaOpen = view === "agenda";
  const patientsOpen = view === "patients";
  const settingsOpen = view === "settings";
  const chatId = !agendaOpen && !patientsOpen && !settingsOpen && chat && clinicIdPattern.test(chat) ? chat : null;

  if (!agendaOpen && !patientsOpen && !settingsOpen && !chatId) {
    const path = await landingPath(user.id, id);
    if (path) redirect(path);
    return null;
  }

  const supabase = await createClient();

  if (chatId) {
    const [{ data: row }, thread, { count }] = await Promise.all([
      supabase
        .from("chats")
        .select(
          "id, color, emoji, chat_participants(user_id, bots(id, name, color, emoji)), chat_clinics!inner(clinic_id)",
        )
        .eq("id", chatId)
        .eq("chat_clinics.clinic_id", id)
        .maybeSingle(),
      loadChatThread(supabase, user.id, chatId, null),
      supabase.from("chat_events").select("id", { count: "exact", head: true }).eq("chat_id", chatId),
    ]);
    if (!row) {
      const path = await landingPath(user.id, id);
      if (path && path !== `/clinics/${id}?chat=${chatId}`) redirect(path);
      return null;
    }
    const seats = (row.chat_participants ?? []) as SeatRow[];
    const userIds = [...new Set(seats.flatMap((seat) => (seat.user_id ? [seat.user_id] : [])))];
    const { data: profileRows } =
      userIds.length > 0
        ? await supabase.from("profiles").select("id, name, email").in("id", userIds)
        : { data: [] };
    const profileName = new Map(
      ((profileRows ?? []) as { id: string; name: string | null; email: string | null }[]).map((profile) => [
        profile.id,
        profile.name?.trim() || profile.email?.trim() || "Qualcuno",
      ]),
    );
    return (
      <ChatThread
        key={chatId}
        clinicId={id}
        chat={{
          id: chatId,
          color: row.color,
          emoji: row.emoji,
          people: seats.flatMap((seat) =>
            seat.user_id ? [{ id: seat.user_id, name: profileName.get(seat.user_id) ?? "Qualcuno" }] : [],
          ),
          bots: seatBots(seats),
          hasEvents: (count ?? 0) > 0,
        }}
        messages={thread.messages}
        hasOlder={thread.hasOlder}
        olderCursor={thread.nextCursor}
      />
    );
  }

  if (patientsOpen) {
    const selectedPatientId = patientParam && clinicIdPattern.test(patientParam) ? patientParam : null;
    if (selectedPatientId) {
      const { data } = await supabase
        .from("patients")
        .select("id, given_name, family_name, date_of_birth, fiscal_code, phone, email, note")
        .eq("clinic_id", id)
        .eq("id", selectedPatientId)
        .maybeSingle();
      if (!data) redirect(`/clinics/${id}?view=patients`);
      return (
        <PatientPage
          clinicId={id}
          patient={asPatient(
            data as {
              id: string;
              given_name: string;
              family_name: string;
              date_of_birth: string | null;
              fiscal_code: string | null;
              phone: string | null;
              email: string | null;
              note: string | null;
            },
          )}
        />
      );
    }

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
    const patients: PatientRecord[] = (
      (data ?? []) as {
        id: string;
        given_name: string;
        family_name: string;
        date_of_birth: string | null;
        fiscal_code: string | null;
        phone: string | null;
        email: string | null;
        note: string | null;
      }[]
    ).map(asPatient);
    const mineRole = mine?.clinic_roles as { is_admin: boolean } | { is_admin: boolean }[] | null;
    const admin = Boolean((Array.isArray(mineRole) ? mineRole[0] : mineRole)?.is_admin);
    let canWritePatients = false;
    if (admin) canWritePatients = true;
    else if (mine?.clinic_role_id) {
      const { data: perms } = await supabase
        .from("clinic_role_permissions")
        .select("permission_key")
        .eq("clinic_role_id", mine.clinic_role_id)
        .eq("permission_key", "patients.write");
      canWritePatients = Boolean(perms?.length);
    }
    return <PatientsView clinicId={id} patients={patients} canWrite={canWritePatients} />;
  }

  if (settingsOpen) {
    const settings = await loadSettings(id, user.id);
    return (
      <SettingsPanel
        clinicId={id}
        clinicName={settings.clinicName}
        canRename={settings.canRenameClinic}
        canDelete={settings.canDeleteClinic}
        canManageMembers={settings.canManageMembers}
        canManageRoles={settings.canManageRoles}
        canManageAgenda={settings.canManageAgenda}
        currentUserId={user.id}
        members={settings.members}
        roles={settings.roles}
        specialists={settings.specialists}
        assets={settings.assets}
        integrations={settings.integrations}
        canManageIntegrations={settings.canManageIntegrations}
        webhookVerifyToken={process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? ""}
      />
    );
  }

  const agenda = await loadAgenda(id, user.id);
  return (
    <AgendaView
      clinicId={id}
      lanes={agenda.lanes}
      appointments={agenda.appointments}
      blocks={agenda.blocks}
      patients={agenda.patients}
      canMove={agenda.canManage}
    />
  );
}

async function loadSettings(clinicId: string, userId: string) {
  const supabase = await createClient();
  const { data: clinic } = await supabase.from("clinics").select("name").eq("id", clinicId).maybeSingle();
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
      .eq("clinic_id", clinicId)
      .order("created_at"),
    supabase
      .from("clinic_roles")
      .select("id, name, is_admin, clinic_role_permissions(permission_key)")
      .eq("clinic_id", clinicId)
      .order("name"),
    supabase
      .from("memberships")
      .select("clinic_role_id, clinic_roles(is_admin)")
      .eq("clinic_id", clinicId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("doctors")
      .select("id, given_name, family_name, specialization, active, user_id")
      .eq("clinic_id", clinicId)
      .order("family_name")
      .order("given_name"),
    supabase.from("clinical_objects").select("id, name, description").eq("clinic_id", clinicId).order("name"),
    supabase
      .from("integrations")
      .select("id, provider, account, status, whatsapp_channels(credit_cents), whatsapp_messages(count)")
      .eq("clinic_id", clinicId)
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
      { email: profile.email?.trim() || "Senza email", name: profile.name?.trim() || null },
    ]),
  );
  const members: ClinicMember[] = (
    (memberRows ?? []) as {
      id: string;
      user_id: string;
      clinic_role_id: string;
      clinic_roles: { name: string; is_admin: boolean } | { name: string; is_admin: boolean }[] | null;
    }[]
  ).map((row) => {
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
  const roles: ClinicRole[] = (
    (roleRows ?? []) as {
      id: string;
      name: string;
      is_admin: boolean;
      clinic_role_permissions: { permission_key: string }[] | null;
    }[]
  ).map((role) => ({
    id: role.id,
    name: role.name,
    admin: role.is_admin,
    permissions: (role.clinic_role_permissions ?? []).map((item) => item.permission_key),
  }));
  const specialists: Specialist[] = (
    (doctorRows ?? []) as {
      id: string;
      given_name: string;
      family_name: string;
      specialization: string | null;
      active: boolean;
      user_id: string | null;
    }[]
  ).map((doctor) => ({
    id: doctor.id,
    givenName: doctor.given_name,
    familyName: doctor.family_name,
    specialization: doctor.specialization,
    userId: doctor.user_id,
    active: doctor.active,
  }));
  const assets: ClinicAsset[] = ((objectRows ?? []) as { id: string; name: string; description: string | null }[]).map(
    (object) => ({ id: object.id, name: object.name, description: object.description }),
  );
  const integrations: ClinicIntegration[] = (
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
    return {
      id: row.id,
      provider: row.provider,
      account: row.account,
      status: row.status,
      whatsapp:
        row.provider === "whatsapp"
          ? { creditCents: channel?.credit_cents ?? 0, messageCount: Number.isFinite(messageCount) ? messageCount : 0 }
          : null,
    };
  });
  const mineRole = mine?.clinic_roles as { is_admin: boolean } | { is_admin: boolean }[] | null;
  const admin = Boolean((Array.isArray(mineRole) ? mineRole[0] : mineRole)?.is_admin);
  const flags = {
    canRenameClinic: false,
    canDeleteClinic: false,
    canManageMembers: false,
    canManageRoles: false,
    canManageAgenda: false,
    canManageIntegrations: false,
  };
  if (admin) {
    flags.canRenameClinic = true;
    flags.canDeleteClinic = true;
    flags.canManageMembers = true;
    flags.canManageRoles = true;
    flags.canManageAgenda = true;
    flags.canManageIntegrations = true;
  } else if (mine?.clinic_role_id) {
    const { data: perms } = await supabase
      .from("clinic_role_permissions")
      .select("permission_key")
      .eq("clinic_role_id", mine.clinic_role_id)
      .in("permission_key", [
        "clinic.update",
        "clinic.delete",
        "members.manage",
        "roles.manage",
        "agenda.write",
        "integrations.manage",
      ]);
    const keys = new Set((perms ?? []).map((row) => row.permission_key));
    flags.canRenameClinic = keys.has("clinic.update");
    flags.canDeleteClinic = keys.has("clinic.delete");
    flags.canManageMembers = keys.has("members.manage");
    flags.canManageRoles = keys.has("roles.manage");
    flags.canManageAgenda = keys.has("agenda.write");
    flags.canManageIntegrations = keys.has("integrations.manage");
  }
  return { clinicName: clinic?.name ?? "", members, roles, specialists, assets, integrations, ...flags };
}

async function loadAgenda(clinicId: string, userId: string) {
  const supabase = await createClient();
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
      .eq("clinic_id", clinicId)
      .eq("active", true)
      .order("family_name")
      .order("given_name"),
    supabase.from("clinical_objects").select("id, name").eq("clinic_id", clinicId).order("name"),
    supabase
      .from("appointments")
      .select(
        "id, title, note, starts_at, ends_at, appointment_doctors(doctor_id), appointment_objects(clinical_object_id), appointment_patients(patient_id, patients(given_name, family_name))",
      )
      .eq("clinic_id", clinicId)
      .order("starts_at"),
    supabase
      .from("agenda_blocks")
      .select(
        "id, title, description, starts_at, ends_at, agenda_block_doctors(doctor_id), agenda_block_objects(clinical_object_id)",
      )
      .eq("clinic_id", clinicId)
      .order("starts_at"),
    supabase
      .from("memberships")
      .select("clinic_role_id, clinic_roles(is_admin)")
      .eq("clinic_id", clinicId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("patients")
      .select("id, given_name, family_name")
      .eq("clinic_id", clinicId)
      .order("family_name")
      .order("given_name"),
  ]);
  const mineRole = mine?.clinic_roles as { is_admin: boolean } | { is_admin: boolean }[] | null;
  const admin = Boolean((Array.isArray(mineRole) ? mineRole[0] : mineRole)?.is_admin);
  let canManage = admin;
  if (!admin && mine?.clinic_role_id) {
    const { data: perms } = await supabase
      .from("clinic_role_permissions")
      .select("permission_key")
      .eq("clinic_role_id", mine.clinic_role_id)
      .eq("permission_key", "agenda.write");
    canManage = Boolean(perms?.length);
  }
  const lanes: AgendaLane[] = [
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
  const appointments: AgendaAppointment[] = (
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
  const blocks: AgendaBlock[] = (
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
  const patients: AgendaEditPatient[] = (
    (patientRows ?? []) as { id: string; given_name: string; family_name: string }[]
  ).flatMap((patient) => {
    const name = `${patient.given_name} ${patient.family_name}`.replace(/\s+/g, " ").trim();
    return name ? [{ id: patient.id, name }] : [];
  });
  return { lanes, appointments, blocks, patients, canManage };
}
