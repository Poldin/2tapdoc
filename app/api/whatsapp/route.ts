import { createHmac, timingSafeEqual } from "crypto";
import { withDatabase } from "@/lib/postgres";
import { messagesFromWebhook } from "@/lib/whatsapp-archive";

function signaturesMatch(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ?? "";
  if (mode !== "subscribe" || !expected || token !== expected || !challenge || challenge.length > 200) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET?.trim() ?? "";
  const raw = await request.text();
  if (!secret || !signaturesMatch(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("OK", { status: 200 });
  }

  const grouped = messagesFromWebhook(payload);
  if (grouped.size === 0) return new Response("OK", { status: 200 });

  try {
    await withDatabase(async (client) => {
      for (const [phoneNumberId, messages] of grouped) {
        for (let index = 0; index < messages.length; index += 500) {
          const chunk = messages.slice(index, index + 500);
          await client.query("select private.archive_whatsapp_messages($1, $2::jsonb)", [
            phoneNumberId,
            JSON.stringify(chunk),
          ]);
        }
      }
    });
  } catch (error) {
    console.error("whatsapp archive failed", error instanceof Error ? error.message : "unknown");
    return new Response("Unavailable", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
