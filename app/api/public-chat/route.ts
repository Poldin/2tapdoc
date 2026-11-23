import { withDatabase } from "@/lib/postgres";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const WAIT_MS = 50_000;

type RateBucket = { count: number; resetAt: number };
const rateByIp = new Map<string, RateBucket>();

function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function allowRate(ip: string) {
  const now = Date.now();
  const bucket = rateByIp.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_MAX) return false;
  bucket.count += 1;
  return true;
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function visitorMessage(message: string) {
  if (message.includes("unknown page")) return "Pagina non disponibile.";
  if (message.includes("turn limit")) return "Hai raggiunto il limite di messaggi per questa sessione. Ricarica la pagina per ricominciare.";
  if (message.includes("busy")) return "Sto ancora rispondendo. Attendi un momento.";
  if (message.includes("empty message")) return "Messaggio mancante.";
  return "Al momento non riesco a rispondere. Riprova tra poco.";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  if (!allowRate(clientIp(req))) {
    return jsonError("Troppe richieste. Riprova tra un minuto.", 429);
  }

  let payload: { slug?: unknown; sessionId?: unknown; text?: unknown };
  try {
    payload = await req.json();
  } catch {
    return jsonError("Richiesta non valida.", 400);
  }

  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) return jsonError("Messaggio mancante.", 400);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const push = (data: unknown) => controller.enqueue(enc.encode(sse(data)));
      try {
        await withDatabase(async (client) => {
          const posted = await client.query<{ result: { sessionId?: string; jobId?: string } }>(
            "select private.post_public_message($1, $2, $3) as result",
            [slug, sessionId, text],
          );
          const row = posted.rows[0]?.result;
          if (!row?.sessionId || !row.jobId) throw new Error("missing job");
          push({ type: "session", sessionId: row.sessionId });

          let sent = "";
          const started = Date.now();
          while (Date.now() - started < WAIT_MS) {
            const current = await client.query<{ job: { status?: string; draft?: string } | null }>(
              "select private.read_public_job($1::uuid, $2::uuid) as job",
              [row.sessionId, row.jobId],
            );
            const job = current.rows[0]?.job;
            const draft = typeof job?.draft === "string" ? job.draft : "";
            if (draft.startsWith(sent) && draft.length > sent.length) {
              push({ type: "delta", text: draft.slice(sent.length) });
              sent = draft;
            }
            if (job?.status === "done") {
              if (!sent.trim()) push({ type: "error", message: "Non ho una risposta utile. Prova a riformulare." });
              else push({ type: "done" });
              return;
            }
            if (!job || job.status === "failed") {
              push({ type: "error", message: "Al momento non riesco a rispondere. Riprova tra poco." });
              return;
            }
            await sleep(200);
          }
          push({ type: "error", message: "Al momento non riesco a rispondere. Riprova tra poco." });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        push({ type: "error", message: visitorMessage(message) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
