"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { CharacterEmoji } from "@/components/character-emoji";
import { Markdown } from "@/components/markdown";
import { initialClinicState, type ClinicState } from "@/lib/demo-clinic";

type ChatRole = "user" | "assistant";
type ChatItem = { role: ChatRole; content: string };

type PendingAction = {
  name: string;
  label: string;
  clinic: ClinicState;
};

const OPENING = "Ciao, sono Ginevra. Come posso aiutarti?";

const SUGGESTIONS = [
  "Calcola codice fiscale di Mario",
  "Sposta appuntamento del figlio di Elena",
  "Scrivi alla signora Rosanna per ricordarle l'appuntamento di domani",
];

const MAX_TURNS = 15;

const IMPORTANT_TOOLS = new Set(["move_appointment", "book_appointment", "draft_whatsapp_reminder"]);

function actionLabel(name: string, args?: Record<string, unknown>) {
  if (name === "move_appointment") {
    const patient = typeof args?.patient === "string" ? args.patient : "il paziente";
    const day = typeof args?.new_day === "string" ? args.new_day : "";
    const time = typeof args?.new_time === "string" ? args.new_time : "";
    return `Ginevra vuole spostare l'appuntamento di ${patient}${day ? ` a ${day}` : ""}${time ? ` ${time}` : ""}.`;
  }
  if (name === "book_appointment") {
    const patient = typeof args?.patient === "string" ? args.patient : "un paziente";
    return `Ginevra vuole prenotare un appuntamento per ${patient}.`;
  }
  if (name === "draft_whatsapp_reminder") {
    const audience = typeof args?.audience === "string" ? args.audience : "il paziente";
    return `Ginevra vuole preparare un messaggio WhatsApp per ${audience}.`;
  }
  return "Ginevra chiede conferma per un'azione.";
}

export function DemoChat() {
  const [clinic, setClinic] = useState<ClinicState>(() => initialClinicState());
  const [messages, setMessages] = useState<ChatItem[]>([{ role: "assistant", content: OPENING }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const clinicRef = useRef(clinic);
  clinicRef.current = clinic;
  const pendingRef = useRef<PendingAction | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const userTurns = useMemo(() => messages.filter((item) => item.role === "user").length, [messages]);
  const capped = userTurns >= MAX_TURNS;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || capped) return;
    setBusy(true);
    setShowSuggestions(false);
    const nextMessages: ChatItem[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          clinic,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Non riesco a rispondere in questo momento. Riprova tra poco.");
      }
      if (!res.body) throw new Error("Risposta vuota dal server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let event: {
            type?: string;
            text?: string;
            message?: string;
            clinic?: ClinicState;
            name?: string;
            args?: Record<string, unknown>;
          };
          try {
            event = JSON.parse(raw) as typeof event;
          } catch {
            continue;
          }
          if (event.type === "tool" && event.name && IMPORTANT_TOOLS.has(event.name)) {
            const action: PendingAction = {
              name: event.name,
              label: actionLabel(event.name, event.args),
              clinic: clinicRef.current,
            };
            pendingRef.current = action;
            setPending(action);
          } else if (event.type === "clinic" && event.clinic) {
            const nextClinic = event.clinic;
            if (pendingRef.current && IMPORTANT_TOOLS.has(pendingRef.current.name)) {
              const updated = { ...pendingRef.current, clinic: nextClinic };
              pendingRef.current = updated;
              setPending(updated);
            } else {
              setClinic(nextClinic);
            }
          } else if (event.type === "delta" && event.text) {
            assistant += event.text;
            const snapshot = assistant;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: snapshot };
              return copy;
            });
          } else if (event.type === "error") {
            throw new Error(event.message || "Qualcosa non ha funzionato. Riprova tra poco.");
          } else if (event.type === "done" && event.clinic) {
            if (pendingRef.current && IMPORTANT_TOOLS.has(pendingRef.current.name)) {
              const updated = { ...pendingRef.current, clinic: event.clinic };
              pendingRef.current = updated;
              setPending(updated);
            } else {
              setClinic(event.clinic);
            }
          }
        }
      }

      if (!assistant.trim()) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "Non sono riuscita a rispondere. Riprova con una domanda più semplice.",
          };
          return copy;
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Qualcosa non ha funzionato. Riprova tra poco.";
      setMessages((prev) => {
        const copy = [...prev];
        if (copy[copy.length - 1]?.role === "assistant" && !copy[copy.length - 1]?.content) {
          copy[copy.length - 1] = { role: "assistant", content: message };
        } else {
          copy.push({ role: "assistant", content: message });
        }
        return copy;
      });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
      });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function confirmPending() {
    const action = pendingRef.current || pending;
    if (!action) return;
    setClinic(action.clinic);
    pendingRef.current = null;
    setPending(null);
  }

  function cancelPending() {
    if (!pendingRef.current && !pending) return;
    pendingRef.current = null;
    setPending(null);
  }

  return (
    <div className="relative mx-auto max-w-2xl">
      <div ref={scroller} className="flex max-h-[520px] min-h-[220px] flex-col gap-4 overflow-y-auto py-1">
        {messages.map((item, index) => {
          if (item.role === "assistant") {
            return (
              <div key={`a-${index}`} className="flex items-start gap-3">
                <CharacterEmoji id="smilewoman" size={36} animated={false} />
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-sand-100/90 px-3.5 py-2.5 text-sm leading-relaxed text-sand-900">
                  {item.content ? <Markdown source={item.content} /> : busy && index === messages.length - 1 ? "…" : null}
                </div>
              </div>
            );
          }
          return (
            <div
              key={`u-${index}`}
              className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-violet-600 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm"
            >
              {item.content}
            </div>
          );
        })}

        {showSuggestions && userTurns === 0 ? (
          <div className="ml-auto flex w-full max-w-[92%] flex-col items-end gap-2 sm:max-w-[85%]">
            {SUGGESTIONS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy || capped}
                onClick={() => void send(chip)}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-violet-300 bg-transparent px-3.5 py-2 text-left text-sm font-medium text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">{chip}</span>
                <span aria-hidden className="shrink-0 text-violet-500">
                  →
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={500}
            disabled={busy || capped}
            placeholder={capped ? "Limite raggiunto — ricarica la pagina" : "Scrivi un messaggio…"}
            className="min-w-0 flex-1 rounded-2xl border border-violet-200/70 bg-white/60 px-3.5 py-2.5 text-sm text-sand-900 shadow-none outline-none ring-violet-300 placeholder:text-sand-400 focus:border-violet-300 focus:ring-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || capped || !input.trim()}
            className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            Invia
          </button>
        </form>
      </div>

      {pending ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-sand-950/20 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg ring-1 ring-violet-100">
            <p className="text-sm font-semibold text-sand-950">Conferma richiesta</p>
            <p className="mt-1.5 text-sm leading-relaxed text-sand-700">{pending.label}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPending}
                className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-sand-700 hover:bg-violet-50"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={confirmPending}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
