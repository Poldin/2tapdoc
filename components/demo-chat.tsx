"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { initialClinicState, type ClinicState } from "@/lib/demo-clinic";

type ChatRole = "user" | "assistant";
type ChatItem = { role: ChatRole; content: string };

const SUGGESTIONS = [
  "Sposta l'appuntamento di Rossi a giovedì",
  "Manda un promemoria WhatsApp ai pazienti di domani",
  "Com'è gestita la privacy?",
  "Quanto costa?",
];

const MAX_TURNS = 15;

export function DemoChat() {
  const [clinic, setClinic] = useState<ClinicState>(() => initialClinicState());
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content:
        "Ciao! Sono la demo di Clinico per lo Studio Dentistico Demo. Prova a spostare un appuntamento, preparare un promemoria WhatsApp o chiedermi prezzi e privacy. I dati sono fittizi.",
    },
  ]);
  const [input, setInput] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const userTurns = useMemo(() => messages.filter((item) => item.role === "user").length, [messages]);
  const capped = userTurns >= MAX_TURNS;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || capped) return;
    setError(null);
    setBusy(true);
    setSteps(["Invio…"]);
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
        throw new Error(data.error || "Demo non disponibile al momento.");
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
          };
          try {
            event = JSON.parse(raw) as typeof event;
          } catch {
            continue;
          }
          if (event.type === "step" && event.text) {
            setSteps((prev) => [...prev.slice(-4), event.text!]);
          } else if (event.type === "clinic" && event.clinic) {
            setClinic(event.clinic);
          } else if (event.type === "delta" && event.text) {
            assistant += event.text;
            const snapshot = assistant;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: snapshot };
              return copy;
            });
          } else if (event.type === "error") {
            throw new Error(event.message || "Errore demo.");
          } else if (event.type === "done" && event.clinic) {
            setClinic(event.clinic);
            setSteps((prev) => (prev.includes("Confermato ✓") ? prev : [...prev, "Confermato ✓"]));
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
      setError(message);
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
      <div className="overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-sand-100 px-4 py-3 sm:px-5">
          <div>
            <p className="text-sm font-semibold text-sand-950">Prova l&apos;assistente</p>
            <p className="text-xs text-sand-500">Studio Dentistico Demo · dati fittizi</p>
          </div>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
            Demo live
          </span>
        </div>

        <div ref={scroller} className="flex max-h-[420px] min-h-[280px] flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                item.role === "user"
                  ? "ml-auto bg-violet-600 text-white"
                  : "mr-auto border border-sand-100 bg-sand-50 text-sand-900"
              }`}
            >
              {item.content || (busy && index === messages.length - 1 ? "…" : "")}
            </div>
          ))}
        </div>

        {steps.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-sand-100 px-4 py-2.5 sm:px-5">
            {steps.map((step, index) => (
              <span
                key={`${step}-${index}`}
                className="rounded-full bg-sand-100 px-2.5 py-1 text-[11px] font-medium text-sand-700"
              >
                {step}
              </span>
            ))}
          </div>
        ) : null}

        <div className="border-t border-sand-100 px-4 py-3 sm:px-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={busy || capped}
                onClick={() => void send(chip)}
                className="rounded-full border border-sand-200 bg-white px-3 py-1.5 text-left text-xs text-sand-700 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={500}
              disabled={busy || capped}
              placeholder={capped ? "Limite demo raggiunto — ricarica la pagina" : "Scrivi un messaggio…"}
              className="min-w-0 flex-1 rounded-2xl border border-sand-200 bg-sand-50 px-3.5 py-2.5 text-sm text-sand-900 outline-none ring-violet-400 placeholder:text-sand-400 focus:ring-2 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || capped || !input.trim()}
              className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
            >
              Invia
            </button>
          </form>
          <p className="mt-2 text-[11px] text-sand-500">
            Demo con dati fittizi · max {MAX_TURNS} messaggi per sessione
            {error ? <span className="text-red-600"> · {error}</span> : null}
          </p>
        </div>
      </div>

      <aside className="overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-sm">
        <div className="border-b border-sand-100 px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-sand-950">Agenda demo</p>
          <p className="text-xs text-sand-500">Si aggiorna quando l&apos;assistente usa i tool</p>
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="space-y-2">
            {clinic.appointments.map((item) => (
              <div key={item.id} className="rounded-2xl border border-sand-100 bg-sand-50 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-sand-950">{item.patient}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-violet-700">
                    {item.type}
                  </span>
                </div>
                <p className="mt-1 text-xs capitalize text-sand-600">
                  {item.day} · {item.time}
                </p>
              </div>
            ))}
          </div>

          {clinic.drafts.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">Bozze WhatsApp</p>
              <div className="space-y-2">
                {clinic.drafts.map((draft) => (
                  <div key={draft.id} className="rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                    <p className="text-xs font-medium text-violet-800">A: {draft.audience}</p>
                    <p className="mt-1 text-xs text-sand-700">{draft.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {clinic.recalls.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">Richiami</p>
              <div className="space-y-2">
                {clinic.recalls.map((item) => (
                  <div key={`${item.patient}-${item.reason}`} className="rounded-2xl border border-sand-100 bg-white px-3 py-2.5">
                    <p className="text-sm font-medium text-sand-900">{item.patient}</p>
                    <p className="text-xs text-sand-600">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
