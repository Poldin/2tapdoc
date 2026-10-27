import { redirect } from "next/navigation";
import { WhatsAppPair } from "@/components/whatsapp-pair";
import { getSessionUser } from "@/lib/auth/session";

export const instant = false;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function WhatsAppPairPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { state } = await searchParams;
  if (!state || !uuidPattern.test(state)) redirect("/clinics");
  return <WhatsAppPair state={state} />;
}
