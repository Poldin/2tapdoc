import {
  applyDemoTool,
  clinicoKnowledge,
  initialClinicState,
  mistralTools,
  type ClinicState,
} from "@/lib/demo-clinic";

const MAX_MESSAGE_CHARS = 500;
const MAX_USER_TURNS = 15;
const MAX_TOOL_ROUNDS = 4;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;

type MistralMessage = Record<string, unknown>;

type RateBucket = { count: number; resetAt: number };
const rateByIp = new Map<string, RateBucket>();

const SYSTEM_PROMPT = `Sei l'assistente demo di Clinico per lo "Studio Dentistico Demo" (dati fittizi).
Parli italiano, tono chiaro e cordiale da segreteria digitale.

Puoi:
1) Agire sull'agenda demo con i tool (sposta/prenota appuntamenti, bozze WhatsApp, lista richiami). I tool aggiornano un pannello demo: usali quando l'utente chiede di fare qualcosa sull'agenda.
2) Rispondere a domande su Clinico (prodotto, prezzi, privacy, come funziona) usando SOLO la conoscenza sotto. Non inventare certificazioni.

Regole:
- Resta in tema: Clinico, demo studio, agenda, prezzi, privacy. Se escono dal tema, richiama gentilmente.
- Non dare consigli clinici/medici. Non inventare dati pazienti oltre lo stato demo.
- Le bozze WhatsApp NON vengono inviate davvero: dillo sempre.
- Risposte brevi (poche frasi) salvo quando serve un elenco.

${clinicoKnowledge}
`;

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

async function mistralChat(body: Record<string, unknown>) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_KEY");
  }
  const model = process.env.MISTRAL_MODEL || "mistral-small-latest";
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, ...body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MISTRAL_${res.status}:${text.slice(0, 200)}`);
  }
  return res;
}

export async function POST(req: Request) {
  if (!allowRate(clientIp(req))) {
    return new Response(JSON.stringify({ error: "Troppe richieste. Riprova tra un minuto." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: {
    messages?: { role: string; content: string }[];
    clinic?: ClinicState;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Richiesta non valida." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incoming = Array.isArray(payload.messages) ? payload.messages : [];
  const userTurns = incoming.filter((item) => item.role === "user").length;
  if (userTurns > MAX_USER_TURNS) {
    return new Response(
      JSON.stringify({
        error: "Hai raggiunto il limite di messaggi per questa sessione demo. Ricarica la pagina per ricominciare.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const last = incoming[incoming.length - 1];
  if (!last || last.role !== "user" || typeof last.content !== "string") {
    return new Response(JSON.stringify({ error: "Messaggio mancante." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (last.content.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Messaggio vuoto." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (last.content.length > MAX_MESSAGE_CHARS) {
    return new Response(JSON.stringify({ error: `Messaggio troppo lungo (max ${MAX_MESSAGE_CHARS} caratteri).` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!process.env.MISTRAL_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "Demo temporaneamente non disponibile. Riprova tra poco.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let clinic: ClinicState =
    payload.clinic && Array.isArray(payload.clinic.appointments)
      ? payload.clinic
      : initialClinicState();

  const history: MistralMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...incoming
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-24)
      .map((item) => ({
      role: item.role,
      content: String(item.content ?? "").slice(0, MAX_MESSAGE_CHARS),
    })),
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const push = (data: unknown) => controller.enqueue(enc.encode(sse(data)));

      try {
        push({ type: "step", text: "Sto pensando…" });

        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const res = await mistralChat({
            messages: history,
            tools: mistralTools,
            tool_choice: "auto",
            temperature: 0.4,
            max_tokens: 700,
            stream: false,
          });
          const json = (await res.json()) as {
            choices?: {
              message?: {
                content?: string | null;
                tool_calls?: {
                  id: string;
                  type: string;
                  function: { name: string; arguments: string };
                }[];
              };
            }[];
          };
          const message = json.choices?.[0]?.message;
          if (!message) throw new Error("EMPTY_RESPONSE");

          const toolCalls = message.tool_calls ?? [];
          if (toolCalls.length === 0) {
            const text = (message.content || "").trim() || "Non ho ricevuto una risposta utile. Riprova con un'altra domanda.";
            // Stream final text in chunks for UX
            const chunkSize = 24;
            for (let i = 0; i < text.length; i += chunkSize) {
              push({ type: "delta", text: text.slice(i, i + chunkSize) });
            }
            push({ type: "done", clinic });
            controller.close();
            return;
          }

          history.push({
            role: "assistant",
            content: message.content || "",
            tool_calls: toolCalls,
          });

          for (const call of toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
            } catch {
              args = {};
            }
            const executed = applyDemoTool(clinic, call.function.name, args);
            clinic = executed.clinic;
            push({ type: "step", text: executed.step });
            push({ type: "tool", name: call.function.name, args, result: executed.result });
            push({ type: "clinic", clinic });
            history.push({
              role: "tool",
              name: call.function.name,
              tool_call_id: call.id,
              content: JSON.stringify(executed.result),
            });
          }
        }

        // Fallback after tool rounds: ask for a short wrap-up without tools
        push({ type: "step", text: "Confermato ✓" });
        const finalRes = await mistralChat({
          messages: history,
          temperature: 0.4,
          max_tokens: 500,
          stream: true,
        });
        if (!finalRes.body) throw new Error("NO_STREAM");
        const reader = finalRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() || "";
          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const piece = parsed.choices?.[0]?.delta?.content;
              if (piece) push({ type: "delta", text: piece });
            } catch {
              // ignore bad chunks
            }
          }
        }
        push({ type: "done", clinic });
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error && error.message === "MISSING_KEY"
            ? "Demo temporaneamente non disponibile. Riprova tra poco."
            : "Qualcosa non ha funzionato con la demo. Riprova tra poco.";
        push({ type: "error", message });
        controller.close();
      }
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
