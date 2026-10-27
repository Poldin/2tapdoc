import { NextResponse } from "next/server";
import { exchangeGmailCode, gmailOAuthConfigured } from "@/lib/gmail-link";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function settingsUrl(request: Request, clinicId: string, toolError?: string) {
  const url = new URL(clinicId ? `/clinics/${clinicId}` : "/clinics", request.url);
  if (clinicId) url.searchParams.set("view", "settings");
  if (toolError) url.searchParams.set("toolError", toolError);
  return url;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  const incoming = new URL(request.url);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = incoming.searchParams.get("state") ?? "";
  const supabase = await createClient();
  if (!uuidPattern.test(state)) {
    return NextResponse.redirect(settingsUrl(request, ""));
  }

  const { data: clinicId } = await supabase.rpc("tool_link_clinic", { p_state: state });
  const clinic = typeof clinicId === "string" ? clinicId : "";

  if (incoming.searchParams.get("error")) {
    await supabase.rpc("cancel_tool_link", { p_state: state });
    return NextResponse.redirect(settingsUrl(request, clinic, "denied"));
  }
  if (!gmailOAuthConfigured()) {
    return NextResponse.redirect(settingsUrl(request, clinic));
  }

  const code = incoming.searchParams.get("code") ?? "";
  if (!code || !clinic) {
    return NextResponse.redirect(settingsUrl(request, clinic, "expired"));
  }

  try {
    const tokens = await exchangeGmailCode(incoming.origin, code);
    const { error } = await supabase.rpc("finish_tool_link", {
      p_state: state,
      p_account: tokens.account,
      p_refresh_token: tokens.refreshToken,
      p_access_token: tokens.accessToken,
      p_access_expires_at: tokens.expiresAt,
    });
    if (error) {
      return NextResponse.redirect(settingsUrl(request, clinic, "failed"));
    }
    return NextResponse.redirect(settingsUrl(request, clinic));
  } catch {
    return NextResponse.redirect(settingsUrl(request, clinic, "failed"));
  }
}
