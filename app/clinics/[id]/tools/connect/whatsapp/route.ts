import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const back = new URL(`/clinics/${id}`, request.url);
  back.searchParams.set("view", "settings");
  if (!uuidPattern.test(id)) return NextResponse.redirect(back);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_tool_link", {
    p_clinic_id: id,
    p_provider: "whatsapp",
  });
  if (error || typeof data !== "string") return NextResponse.redirect(back);
  return NextResponse.redirect(back);
}
