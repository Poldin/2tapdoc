"use client";

import { useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

const greeting: Turn = {
  role: "assistant",
  content:
    "Buongiorno, sono l’assistente AI dello Studio Dentistico Demo. Non sono una persona della segreteria. Come posso aiutarla?",
};

const suggestions = ["Avete posto martedì pomeriggio?", "Sei un’intelligenza artificiale?", "Vorrei un controllo."];
const maxUserTurns = 8;

export function DemoChat() {
  const [turns, setTurns] = useState<Turn[]>([greeting]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const userTurns = turns.filter((turn) => turn.role === "user").length;
  const closed = userTurns >= maxUserTurns;

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending || closed) return;
    const history = [...turns, { role: "user" as const, content }];
    setTurns(history);
    setDraft("");
    setPending(true);
    setNote(null);
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
        }),
      });
      const data = (await response.json().catch(() => null)) as { reply?: unknown } | null;
      const answer = typeof data?.reply === "string" && data.reply.trim() ? data.reply.trim() : null;
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          content: answer ?? "In questo momento non riesco a rispondere. Riprova tra poco.",
        },
      ]);
      if (!response.ok && response.status !== 200) {
        setNote(response.status === 429 ? "Troppe richieste. Attendi un momento." : null);
      }
    } catch {
      setTurns((current) => [
        ...current,
        { role: "assistant", content: "In questo momento non riesco a rispondere. Riprova tra poco." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_24px_60px_-32px_rgba(60,40,20,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <p className="text-sm font-medium">Studio Dentistico Demo</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-violet" />
            Assistente AI · studio di esempio
          </p>
        </div>
        <p className="text-[11px] text-muted">Non prenota davvero</p>
      </div>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto bg-sand px-4 py-4" aria-live="polite">
        {turns.map((turn, index) => (
          <div key={`${turn.role}-${index}`} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                turn.role === "user" ? "rounded-br-md bg-violet text-white" : "rounded-bl-md bg-white text-ink"
              }`}
            >
              {turn.role === "assistant" ? <p className="mb-0.5 text-[10px] font-semibold text-violet">AI</p> : null}
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          </div>
        ))}
        {pending ? <p className="text-xs text-muted">Sta scrivendo…</p> : null}
      </div>
      {userTurns === 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => send(suggestion)}
              className="rounded-full border border-line bg-sand px-3 py-1.5 text-left text-xs hover:bg-sand-deep"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Messaggio per lo Studio Dentistico Demo</span>
          <textarea
            value={draft}
            maxLength={500}
            rows={2}
            disabled={pending || closed}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder={closed ? "Demo conclusa" : "Scrivi allo studio di esempio"}
            className="w-full resize-none rounded-2xl border border-line bg-sand px-3 py-2 text-sm outline-none focus:border-violet disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={pending || closed || !draft.trim()}
          className="inline-flex h-11 items-center justify-center rounded-full bg-violet px-4 text-sm font-medium text-white transition-colors hover:bg-violet-deep disabled:opacity-50"
        >
          Invia
        </button>
      </form>
      <p className="px-4 pb-3 text-xs leading-5 text-muted">
        {note ??
          (closed
            ? "Hai raggiunto gli scambi della demo."
            : "Stai parlando con un’intelligenza artificiale. Lo studio è finto: nessuna visita viene scritta in agenda.")}
      </p>
    </div>
  );
}
