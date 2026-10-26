"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { botGreeting } from "@/lib/bot-greeting";
import { botFaceIds, channelSymbolIds, isListed, markColorIds } from "@/lib/marks";
import { listedPermissions, roleSlug } from "@/lib/permissions";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FormState = { error?: string; sent?: number };

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function createClinic(_state: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) {
    return { error: "Dai un nome alla clinica, entro 80 caratteri." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .insert({ name })
    .select("id")
    .single();

  if (error || !data) return { error: "Non è stato possibile creare la clinica." };
  redirect(`/clinics/${data.id}`);
}

export async function updateClinic(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) {
    return { error: "Dai un nome alla clinica, entro 80 caratteri." };
  }
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .update({ name })
    .eq("id", clinicId)
    .select("id");

  if (error || !data?.length) return { error: "Non è stato possibile aggiornare la clinica." };
  revalidatePath(`/clinics/${clinicId}`);
  redirect(`/clinics/${clinicId}?view=settings`);
}

export async function createChat(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };

  const title = String(formData.get("title") ?? "").trim();
  const color = String(formData.get("color") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  if (title.length > 80) return { error: "Il titolo sta entro 80 caratteri." };
  if (!isListed(markColorIds, color) || !isListed(channelSymbolIds, emoji)) {
    return { error: "Scegli un colore e un simbolo." };
  }

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "Non fai parte di questo studio." };

  const { data, error } = await supabase
    .from("chats")
    .insert({ title: title || null, color, shape: "circle", emoji })
    .select("id")
    .single();

  if (error || !data) return { error: "Non è stato possibile aprire la chat." };

  const { error: placeError } = await supabase
    .from("chat_clinics")
    .insert({ chat_id: data.id, clinic_id: clinicId });
  if (placeError) {
    await supabase.from("chats").delete().eq("id", data.id);
    return { error: "Non è stato possibile aprire la chat." };
  }
  redirect(`/clinics/${clinicId}?chat=${data.id}`);
}

async function clinicMember(clinicId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

async function chatInClinic(clinicId: string, chatId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_clinics")
    .select("chat_id")
    .eq("clinic_id", clinicId)
    .eq("chat_id", chatId)
    .maybeSingle();
  return Boolean(data);
}

async function botInClinic(clinicId: string, botId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bot_clinics")
    .select("bot_id")
    .eq("clinic_id", clinicId)
    .eq("bot_id", botId)
    .maybeSingle();
  return Boolean(data);
}

export async function createBot(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  if (!name || name.length > 40) return { error: "Dai un nome al bot, entro 40 caratteri." };
  if (!isListed(markColorIds, color) || !isListed(botFaceIds, emoji)) {
    return { error: "Scegli un colore e una faccia." };
  }

  const supabase = await createClient();
  const { data: bot, error } = await supabase
    .from("bots")
    .insert({ owner_user_id: user.id, name, color, shape: "rounded", emoji })
    .select("id")
    .single();

  if (error || !bot) return { error: "Non è stato possibile creare il bot." };

  const { error: placeBotError } = await supabase
    .from("bot_clinics")
    .insert({ bot_id: bot.id, clinic_id: clinicId });
  if (placeBotError) {
    await supabase.from("bots").delete().eq("id", bot.id);
    return { error: "Non è stato possibile creare il bot." };
  }

  const { data: chat, error: chatError } = await supabase
    .from("chats")
    .insert({ title: name, color, shape: "circle", emoji: "speechbubble" })
    .select("id")
    .single();

  if (chatError || !chat) return { error: "Il bot è stato creato, ma la conversazione no." };

  const { error: placeChatError } = await supabase
    .from("chat_clinics")
    .insert({ chat_id: chat.id, clinic_id: clinicId });
  if (placeChatError) {
    await supabase.from("chats").delete().eq("id", chat.id);
    return { error: "Il bot è stato creato, ma la conversazione no." };
  }

  const { error: seatError } = await supabase
    .from("chat_participants")
    .insert({ chat_id: chat.id, bot_id: bot.id });

  if (seatError) return { error: "Il bot è stato creato, ma non è entrato nella conversazione." };

  const { error: greetError } = await supabase.from("chat_events").insert({
    chat_id: chat.id,
    bot_id: bot.id,
    kind: "message",
    payload: { body: botGreeting },
  });
  if (greetError) return { error: "Il bot è entrato, ma il saluto no." };

  redirect(`/clinics/${clinicId}?chat=${chat.id}`);
}

export async function updateChat(
  clinicId: string,
  chatId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(chatId)) return { error: "Chat non valida." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };
  if (!(await chatInClinic(clinicId, chatId))) return { error: "Questa chat non è in questa clinica." };

  const title = String(formData.get("title") ?? "").trim();
  const color = String(formData.get("color") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  if (title.length > 80) return { error: "Il titolo sta entro 80 caratteri." };
  if (!isListed(markColorIds, color) || !isListed(channelSymbolIds, emoji)) {
    return { error: "Scegli un colore e un simbolo." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chats")
    .update({ title: title || null, color, emoji })
    .eq("id", chatId)
    .select("id");

  if (error || !data?.length) return { error: "Non è stato possibile modificare la chat." };
  revalidatePath(`/clinics/${clinicId}`);
  redirect(`/clinics/${clinicId}?chat=${chatId}`);
}

export async function updateBot(
  clinicId: string,
  chatId: string,
  botId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(chatId) || !uuidPattern.test(botId)) {
    return { error: "Bot non valido." };
  }
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };
  if (!(await chatInClinic(clinicId, chatId))) return { error: "Questa chat non è in questa clinica." };
  if (!(await botInClinic(clinicId, botId))) return { error: "Questo bot non è in questa clinica." };

  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  if (!name || name.length > 40) return { error: "Dai un nome al bot, entro 40 caratteri." };
  if (!isListed(markColorIds, color) || !isListed(botFaceIds, emoji)) {
    return { error: "Scegli un colore e una faccia." };
  }

  const supabase = await createClient();
  const { data: seat } = await supabase
    .from("chat_participants")
    .select("bot_id")
    .eq("chat_id", chatId)
    .eq("bot_id", botId)
    .maybeSingle();
  if (!seat) return { error: "Questo bot non è in questa chat." };

  const { data, error } = await supabase
    .from("bots")
    .update({ name, color, emoji })
    .eq("id", botId)
    .select("id");
  if (error || !data?.length) return { error: "Non è stato possibile modificare il bot." };

  const { error: titleError } = await supabase.from("chats").update({ title: name }).eq("id", chatId);
  if (titleError) return { error: "Il bot è stato modificato, ma il titolo della chat no." };

  revalidatePath(`/clinics/${clinicId}`);
  redirect(`/clinics/${clinicId}?chat=${chatId}`);
}

export async function addBot(
  clinicId: string,
  chatId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const botId = String(formData.get("botId") ?? "");
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(chatId) || !uuidPattern.test(botId)) {
    return { error: "Bot non valido." };
  }
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };
  if (!(await chatInClinic(clinicId, chatId))) return { error: "Questa chat non è in questa clinica." };
  if (!(await botInClinic(clinicId, botId))) return { error: "Questo bot non è in questa clinica." };

  const supabase = await createClient();
  const { error } = await supabase.from("chat_participants").insert({ chat_id: chatId, bot_id: botId });
  if (error) {
    if (error.code === "23505") return { error: "Questo bot è già nella chat." };
    return { error: "Non è stato possibile aggiungere il bot." };
  }
  redirect(`/clinics/${clinicId}?chat=${chatId}`);
}

export async function deleteChat(
  clinicId: string,
  chatId: string,
  stayOn: string | null,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(chatId)) return { error: "Chat non valida." };
  if (stayOn && !uuidPattern.test(stayOn)) return { error: "Chat non valida." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };
  if (!(await chatInClinic(clinicId, chatId))) return { error: "Questa chat non è in questa clinica." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("chats").delete().eq("id", chatId).select("id");
  if (error || !data?.length) return { error: "Non è stato possibile eliminare la chat." };

  if (stayOn && stayOn !== chatId) redirect(`/clinics/${clinicId}?chat=${stayOn}`);
  redirect(`/clinics/${clinicId}`);
}

export async function sendMessage(
  clinicId: string,
  chatId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(chatId)) return { error: "Chat non valida." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };
  if (!(await chatInClinic(clinicId, chatId))) return { error: "Questa chat non è in questa clinica." };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Scrivi un messaggio." };
  if (body.length > 4000) return { error: "Il messaggio sta entro 4000 caratteri." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("chat_events")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId);

  if (!count) {
    const { data: seats } = await supabase
      .from("chat_participants")
      .select("bot_id")
      .eq("chat_id", chatId)
      .not("bot_id", "is", null);
    const botId = seats?.length === 1 ? seats[0]?.bot_id : null;
    if (botId) {
      await supabase.from("chat_events").insert({
        chat_id: chatId,
        bot_id: botId,
        kind: "message",
        payload: { body: botGreeting },
      });
    }
  }

  const { error } = await supabase.from("chat_events").insert({
    chat_id: chatId,
    user_id: user.id,
    kind: "message",
    payload: { body },
  });

  if (error) return { error: "Non è stato possibile inviare il messaggio." };
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

function splitPersonName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { givenName: parts[0], familyName: parts.slice(1).join(" ") };
}

async function optionalMemberId(clinicId: string, raw: string) {
  const userId = raw.trim();
  if (!userId) return { userId: null as string | null };
  if (!uuidPattern.test(userId)) return { error: "Utente non valido." };
  if (!(await clinicMember(clinicId, userId))) return { error: "Questo utente non è in questa clinica." };
  return { userId };
}

async function uniqueRoleSlug(clinicId: string, name: string) {
  const supabase = await createClient();
  const base = roleSlug(name);
  for (let index = 1; index < 50; index += 1) {
    const slug = index === 1 ? base : `${base.slice(0, 38)}_${index}`;
    const { data } = await supabase
      .from("clinic_roles")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
  }
  return `${base.slice(0, 32)}_${Date.now().toString(36)}`.slice(0, 41);
}

export async function createRole(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: "Dai un nome al ruolo, entro 80 caratteri." };
  const keys = listedPermissions(formData.getAll("permission"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinic_roles")
    .insert({ clinic_id: clinicId, name, slug: await uniqueRoleSlug(clinicId, name), is_admin: false })
    .select("id")
    .single();

  if (error || !data) return { error: "Non è stato possibile creare il ruolo." };
  if (keys.length > 0) {
    const { error: permError } = await supabase.from("clinic_role_permissions").insert(
      keys.map((permission_key) => ({ clinic_role_id: data.id, permission_key })),
    );
    if (permError) return { error: "Il ruolo è stato creato, ma i permessi no." };
  }
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

export async function updateRole(
  clinicId: string,
  roleId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(roleId)) return { error: "Ruolo non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 80) return { error: "Dai un nome al ruolo, entro 80 caratteri." };
  const keys = listedPermissions(formData.getAll("permission"));

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("clinic_roles")
    .select("id, is_admin")
    .eq("id", roleId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (!role) return { error: "Ruolo non valido." };
  if (role.is_admin) return { error: "Il ruolo admin non si modifica." };

  const { data, error } = await supabase
    .from("clinic_roles")
    .update({ name })
    .eq("id", roleId)
    .eq("clinic_id", clinicId)
    .select("id");
  if (error || !data?.length) return { error: "Non è stato possibile aggiornare il ruolo." };

  const { error: clearError } = await supabase.from("clinic_role_permissions").delete().eq("clinic_role_id", roleId);
  if (clearError) return { error: "Il nome è stato aggiornato, ma i permessi no." };
  if (keys.length > 0) {
    const { error: permError } = await supabase.from("clinic_role_permissions").insert(
      keys.map((permission_key) => ({ clinic_role_id: roleId, permission_key })),
    );
    if (permError) return { error: "Il nome è stato aggiornato, ma i permessi no." };
  }
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

export async function addClinicMember(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "");
  if (!email || !email.includes("@")) return { error: "Inserisci un'email valida." };
  if (name.length > 80) return { error: "Il nome sta entro 80 caratteri." };
  if (!uuidPattern.test(roleId)) return { error: "Scegli un ruolo." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_clinic_member", {
    target_clinic_id: clinicId,
    target_email: email,
    target_name: name || null,
    target_role_id: roleId,
  });

  if (error) {
    if (error.message.includes("no_account")) return { error: "Questa email non ha ancora un account." };
    if (error.message.includes("missing_permission")) return { error: "Non puoi aggiungere persone." };
    if (error.message.includes("invalid_role")) return { error: "Ruolo non valido." };
    if (error.code === "23505") return { error: "Questa persona è già in clinica." };
    return { error: "Non è stato possibile aggiungere l'utente." };
  }
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

export async function updateMember(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const userId = String(formData.get("userId") ?? "");
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(userId)) return { error: "Utente non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };
  if (!(await clinicMember(clinicId, userId))) return { error: "Questa persona non è in questa clinica." };

  const name = String(formData.get("name") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "");
  if (name.length > 80) return { error: "Il nome sta entro 80 caratteri." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ name: name || null })
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) return { error: "Non è stato possibile aggiornare il nome." };

  if (uuidPattern.test(roleId)) {
    const { error: roleError } = await supabase
      .from("memberships")
      .update({ clinic_role_id: roleId })
      .eq("clinic_id", clinicId)
      .eq("user_id", userId);
    if (roleError) return { error: "Il nome è stato aggiornato, ma il ruolo no." };
  }

  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

export async function createDoctor(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const parsed = splitPersonName(String(formData.get("name") ?? ""));
  if (!parsed) return { error: "Scrivi nome e cognome." };
  if (parsed.givenName.length > 80 || parsed.familyName.length > 80) {
    return { error: "Nome e cognome stanno entro 80 caratteri ciascuno." };
  }
  const specialization = String(formData.get("specialization") ?? "").trim();
  if (specialization.length > 80) return { error: "La specializzazione sta entro 80 caratteri." };
  const linked = await optionalMemberId(clinicId, String(formData.get("userId") ?? ""));
  if (linked.error) return { error: linked.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .insert({
      clinic_id: clinicId,
      given_name: parsed.givenName,
      family_name: parsed.familyName,
      specialization: specialization || null,
      user_id: linked.userId,
      active: String(formData.get("active") ?? "") === "1",
    })
    .select("id");

  if (error?.code === "23505") return { error: "Questo utente è già associato a un medico." };
  if (error || !data?.length) return { error: "Non è stato possibile aggiungere lo specialista." };
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

export async function updateDoctor(
  clinicId: string,
  doctorId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(doctorId)) return { error: "Specialista non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const parsed = splitPersonName(String(formData.get("name") ?? ""));
  if (!parsed) return { error: "Scrivi nome e cognome." };
  if (parsed.givenName.length > 80 || parsed.familyName.length > 80) {
    return { error: "Nome e cognome stanno entro 80 caratteri ciascuno." };
  }
  const specialization = String(formData.get("specialization") ?? "").trim();
  if (specialization.length > 80) return { error: "La specializzazione sta entro 80 caratteri." };
  const linked = await optionalMemberId(clinicId, String(formData.get("userId") ?? ""));
  if (linked.error) return { error: linked.error };
  const active = String(formData.get("active") ?? "") === "1";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .update({
      given_name: parsed.givenName,
      family_name: parsed.familyName,
      specialization: specialization || null,
      user_id: linked.userId,
      active,
    })
    .eq("id", doctorId)
    .eq("clinic_id", clinicId)
    .select("id");

  if (error?.code === "23505") return { error: "Questo utente è già associato a un medico." };
  if (error || !data?.length) return { error: "Non è stato possibile aggiornare lo specialista." };
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

export async function createClinicalObject(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || name.length > 80) return { error: "Dai un nome, entro 80 caratteri." };
  if (description.length > 400) return { error: "La descrizione sta entro 400 caratteri." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinical_objects")
    .insert({ clinic_id: clinicId, name, description: description || null })
    .select("id");

  if (error || !data?.length) return { error: "Non è stato possibile creare la stanza o l'oggetto." };
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

export async function updateClinicalObject(
  clinicId: string,
  objectId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId) || !uuidPattern.test(objectId)) return { error: "Oggetto non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || name.length > 80) return { error: "Dai un nome, entro 80 caratteri." };
  if (description.length > 400) return { error: "La descrizione sta entro 400 caratteri." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinical_objects")
    .update({ name, description: description || null })
    .eq("id", objectId)
    .eq("clinic_id", clinicId)
    .select("id");

  if (error || !data?.length) return { error: "Non è stato possibile aggiornare la stanza o l'oggetto." };
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}

function optionalText(value: string, limit: number, emptyError?: string) {
  const text = value.trim();
  if (!text) return { value: null as string | null };
  if (text.length > limit) return { error: emptyError };
  return { value: text };
}

export async function createPatient(
  clinicId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!uuidPattern.test(clinicId)) return { error: "Studio non valido." };
  if (!(await clinicMember(clinicId, user.id))) return { error: "Non fai parte di questo studio." };

  const parsed = splitPersonName(String(formData.get("name") ?? ""));
  if (!parsed) return { error: "Scrivi nome e cognome." };
  if (parsed.givenName.length > 80 || parsed.familyName.length > 80) {
    return { error: "Nome e cognome stanno entro 80 caratteri ciascuno." };
  }

  const birth = String(formData.get("dateOfBirth") ?? "").trim();
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
    return { error: "La data di nascita non è valida." };
  }

  const fiscal = optionalText(String(formData.get("fiscalCode") ?? ""), 16, "Il codice fiscale sta entro 16 caratteri.");
  if (fiscal.error) return { error: fiscal.error };
  const phone = optionalText(String(formData.get("phone") ?? ""), 40, "Il telefono sta entro 40 caratteri.");
  if (phone.error) return { error: phone.error };
  const email = optionalText(String(formData.get("email") ?? ""), 120, "L'email sta entro 120 caratteri.");
  if (email.error) return { error: email.error };
  if (email.value && !email.value.includes("@")) return { error: "L'email non è valida." };
  const note = optionalText(String(formData.get("note") ?? ""), 2000, "La nota sta entro 2000 caratteri.");
  if (note.error) return { error: note.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      given_name: parsed.givenName,
      family_name: parsed.familyName,
      date_of_birth: birth || null,
      fiscal_code: fiscal.value,
      phone: phone.value,
      email: email.value,
      note: note.value,
    })
    .select("id");

  if (error || !data?.length) return { error: "Non è stato possibile aggiungere il paziente." };
  revalidatePath(`/clinics/${clinicId}`);
  return { sent: Date.now() };
}
