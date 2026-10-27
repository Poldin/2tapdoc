import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ status: "expired" }, { status: 401 });
  const state = new URL(request.url).searchParams.get("state") ?? "";
  if (!uuidPattern.test(state)) return NextResponse.json({ status: "expired" });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("whatsapp_pair_status", { p_state: state });
  if (error || !data || typeof data !== "object") return NextResponse.json({ status: "expired" });
  return NextResponse.json(data);
}
