"use server";

import { redirect } from "next/navigation";
import { passwordError } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

export type AuthResult = { error?: string; needsCode?: boolean; email?: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function authError(message: string) {
  const text = message.toLowerCase();
  if (text.includes("email rate limit")) {
    return "Limite di email del progetto raggiunto. Il mittente di prova ne manda pochissime all'ora: riprova più tardi.";
  }
  if (text.includes("rate") || text.includes("once every") || text.includes("security purposes")) {
    return "Troppe richieste. Attendi un minuto e riprova.";
  }
  return null;
}

export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  const cleaned = cleanEmail(email);
  if (!emailPattern.test(cleaned)) return { error: "Inserisci un indirizzo email valido." };
  const weak = passwordError(password);
  if (weak) return { error: weak };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email: cleaned, password });
  if (error) {
    const limited = authError(error.message);
    if (limited) return { error: limited };
    if (error.message.toLowerCase().includes("already")) {
      return { error: "Questo indirizzo è già registrato. Accedi." };
    }
    return { error: "Non è stato possibile creare l'account." };
  }

  const identities = data.user?.identities ?? [];
  if (data.user && identities.length === 0) {
    return { error: "Questo indirizzo è già registrato. Accedi." };
  }

  if (data.session) redirect("/clinics");
  return { needsCode: true, email: cleaned };
}

export async function verifySignupCode(email: string, token: string): Promise<AuthResult> {
  const cleaned = cleanEmail(email);
  const code = token.trim();
  if (!emailPattern.test(cleaned) || code.length === 0 || code.length > 128) {
    return { error: "Codice non valido o scaduto." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: cleaned,
    token: code,
    type: "signup",
  });

  if (error) return { error: "Codice non valido o scaduto." };
  redirect("/clinics");
}

export async function resendSignupCode(email: string): Promise<AuthResult> {
  const cleaned = cleanEmail(email);
  if (!emailPattern.test(cleaned)) return { error: "Indirizzo non valido." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: cleaned });
  if (error) {
    const limited = authError(error.message);
    if (limited) return { error: limited };
    return { error: "Non è stato possibile inviare di nuovo il codice." };
  }
  return { email: cleaned };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const cleaned = cleanEmail(email);
  if (!emailPattern.test(cleaned) || !password) return { error: "Inserisci email e password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: cleaned, password });
  if (error) {
    const limited = authError(error.message);
    if (limited) return { error: limited };
    return { error: "Email o password non validi." };
  }

  redirect("/clinics");
}

export async function setPassword(password: string, confirm: string): Promise<AuthResult> {
  if (password !== confirm) return { error: "Le due password non coincidono." };
  const weak = passwordError(password);
  if (weak) return { error: weak };

  const user = await getSessionUser();
  if (!user) return { error: "La sessione è scaduta. Accedi di nuovo." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Non è stato possibile salvare la password." };
  redirect("/clinics");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
