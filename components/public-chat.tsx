"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MapPin, Phone, Send } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { BotGlyph } from "@/components/mark";
import { PublicCardDialog } from "@/components/public-card-dialog";
import type { PublicPageCard } from "@/lib/public-page-card";

type ChatRole = "user" | "assistant";
type ChatItem = { role: ChatRole; content: string };

const MAX_TURNS = 12;

function AssistantLead({ emoji, animate = false }: { emoji: string; animate?: boolean }) {
  return (
    <BotGlyph
      color="teal"
      emoji={emoji}
      animate={animate}
      plain
      className="mr-1.5 h-5 w-5 align-[-0.2em]"
    />
  );
}

export function PublicChat({
  slug,
  clinicName,
  emoji,
  card,
}: {
  slug: string;
  clinicName: string;
  emoji: string;
  card: PublicPageCard;
}) {
  const opening = `Ciao, sono l'assistente di ${clinicName}. Chiedimi degli specialisti o delle sale.`;
  const [messages, setMessages] = useState<ChatItem[]>([{ role: "assistant", content: opening }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;
  const userTurns = messages.filter((item) => item.role === "user").length;
  const capped = userTurns >= MAX_TURNS;

  useEffect(() => {
    const stored = sessionStorage.getItem(`public-chat:${slug}`);
    if (stored) setSessionId(stored);
  }, [slug]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages, busy]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || busy || capped) return;
    const history: ChatItem[] = [...messages, { role: "user", content: body }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);

    try {
      const res = await fetch("/api/public-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          sessionId: sessionRef.current,
          text: body,
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
          let event: { type?: string; text?: string; message?: string; sessionId?: string };
          try {
            event = JSON.parse(line.slice(5).trim()) as typeof event;
          } catch {
            continue;
          }
          if (event.type === "session" && event.sessionId) {
            sessionRef.current = event.sessionId;
            setSessionId(event.sessionId);
            sessionStorage.setItem(`public-chat:${slug}`, event.sessionId);
          }
          if (event.type === "error") throw new Error(event.message || "Qualcosa non ha funzionato.");
          if (event.type === "delta" && event.text) {
            assistant += event.text;
            const snapshot = assistant;
            setMessages((current) => {
              const copy = [...current];
              copy[copy.length - 1] = { role: "assistant", content: snapshot };
              return copy;
            });
          }
        }
      }
      if (!assistant.trim()) throw new Error("Non ho una risposta utile. Prova a riformulare.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Qualcosa non ha funzionato. Riprova tra poco.";
      setMessages((current) => {
        const copy = [...current];
        copy[copy.length - 1] = { role: "assistant", content: message };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <main className="relative flex h-dvh w-full flex-col">
      <div className="absolute top-3 left-1/2 z-20 flex w-fit max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1.5">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={cardOpen}
          aria-label={`Scheda di ${clinicName}`}
          onClick={() => setCardOpen(true)}
          className="flex min-w-0 items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium"
        >
          <BotGlyph color="teal" emoji={emoji} animate plain />
          <span className="truncate">{clinicName}</span>
        </button>
        {card.phones[0] ? (
          <a
            href={`tel:${card.phones[0].replace(/[^\d+]/g, "")}`}
            aria-label={`Chiama ${card.phones[0]}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-muted transition-colors hover:bg-line"
          >
            <Phone className="h-4 w-4" strokeWidth={2} />
          </a>
        ) : null}
        {card.address ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Apri l'indirizzo"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-muted transition-colors hover:bg-line"
          >
            <MapPin className="h-4 w-4" strokeWidth={2} />
          </a>
        ) : null}
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
      <div
        ref={threadRef}
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 pt-14 pb-6 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        <div className="mt-auto flex flex-col gap-3">
        {messages.map((message, index) => {
          const mine = message.role === "user";
          const live = !mine && busy && index === messages.length - 1;
          const thinking = live && !message.content;
          return (
            <div
              key={`${message.role}-${index}`}
              role={live ? "status" : undefined}
              aria-live={live ? "polite" : undefined}
              className={`flex min-w-0 flex-col gap-1 ${
                mine
                  ? "msg-enter-mine w-fit max-w-[min(36rem,100%)] items-end self-end"
                  : "msg-enter-theirs w-fit max-w-[min(36rem,100%)] items-start self-start"
              }`}
            >
              <div className="flex min-w-0 items-center">
                <div
                  className={`max-w-full min-w-0 wrap-anywhere rounded-2xl px-4 py-3 text-sm leading-6 ${
                    mine ? "bg-ink text-paper" : "bg-paper"
                  }`}
                >
                  {mine ? (
                    <Markdown source={message.content} mine />
                  ) : thinking ? (
                    <p className="text-muted">
                      <AssistantLead emoji={emoji} animate />
                      <span>
                        sto elaborando
                        <span className="elaborating-dots" aria-hidden="true" />
                      </span>
                    </p>
                  ) : (
                    <Markdown
                      source={message.content}
                      lead={<AssistantLead emoji={emoji} animate={live} />}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 px-4 pb-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Messaggio</span>
          <textarea
            value={draft}
            rows={1}
            maxLength={800}
            disabled={capped}
            placeholder={capped ? "Limite raggiunto — ricarica la pagina" : "Scrivi un messaggio…"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            className="max-h-40 min-h-12 w-full resize-none rounded-3xl border border-line bg-paper px-4 py-3 text-sm leading-5 outline-none focus:border-teal disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          aria-label="Invia"
          disabled={busy || capped || !draft.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
        >
          <Send className="h-5 w-5" strokeWidth={2} />
        </button>
      </form>
      </div>
      <PublicCardDialog
        open={cardOpen}
        clinicName={clinicName}
        emoji={emoji}
        card={card}
        onClose={() => setCardOpen(false)}
      />
    </main>
  );
}
