"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Markdown } from "@/components/markdown";

type ChatRole = "user" | "assistant";
type ChatItem = { role: ChatRole; content: string };

const MAX_TURNS = 12;

export function PublicChat({ slug, clinicName }: { slug: string; clinicName: string }) {
  const opening = `Ciao, sono l'assistente di ${clinicName}. Chiedimi degli specialisti o delle sale.`;
  const [messages, setMessages] = useState<ChatItem[]>([{ role: "assistant", content: opening }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
      <p className="pointer-events-none absolute top-3 left-1/2 z-20 flex w-fit max-w-[calc(100%-6rem)] -translate-x-1/2 items-center rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium">
        <span className="truncate">{clinicName}</span>
      </p>

      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
      <div
        ref={threadRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-14 pb-6 [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        <div className="mt-auto flex flex-col gap-3">
        {messages.map((message, index) =>
          message.role === "user" ? (
            <p
              key={`user-${index}`}
              className="msg-enter-mine w-fit max-w-[min(36rem,100%)] self-end rounded-2xl bg-ink px-4 py-3 text-sm leading-6 wrap-anywhere text-paper"
            >
              {message.content}
            </p>
          ) : (
            <article
              key={`assistant-${index}`}
              className="msg-enter-theirs flex w-fit max-w-[min(36rem,100%)] flex-col items-start gap-1 self-start"
            >
              <p className="px-1 text-xs text-muted">{clinicName}</p>
              <div className="w-full rounded-2xl bg-paper px-4 py-3 text-sm leading-6 wrap-anywhere">
                {message.content ? (
                  <Markdown source={message.content} />
                ) : (
                  <span className="text-muted">…</span>
                )}
              </div>
            </article>
          ),
        )}
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
    </main>
  );
}
