"use client";

import { useEffect, useRef, useState } from "react";
import { CharacterEmoji } from "@/components/character-emoji";

type Skin = "light" | "medium-light" | "medium" | "medium-dark" | "dark";

const assistants = [
  { id: "ginevra", name: "Ginevra", emoji: "smilewoman", skinTone: undefined, active: true },
  { id: "franco", name: "Franco", emoji: "smileman", skinTone: "light" as Skin, active: false },
  { id: "roberta", name: "Roberta", emoji: "womanraisinghand", skinTone: "light" as Skin, active: false },
  { id: "sofia", name: "Sofia", emoji: "womancurlyhair", skinTone: "dark" as Skin, active: false },
  { id: "marco", name: "Marco", emoji: "manbeard", skinTone: "medium-light" as Skin, active: false },
];

type ScriptItem =
  | { kind: "system"; text: string }
  | { kind: "chip"; text: string }
  | { kind: "status"; text: string }
  | { kind: "bubble"; from: "ginevra" | "segreteria"; text: string; reaction?: string };

const script: ScriptItem[] = [
  { kind: "system", text: "Messaggi da 🟣 Franco e 🟢 Sofia" },
  {
    kind: "bubble",
    from: "ginevra",
    text: "Franco mi ha passato 6 richieste di agenda. Due le tengo ferme: lo spostamento di giovedì della sig.ra Bianchi e il dente scheggiato di stamattina. Non scrivo al paziente finché non confermi.",
  },
  { kind: "status", text: "✓ Agenda → 6 richieste gestite · 2 in attesa di conferma" },
  {
    kind: "bubble",
    from: "ginevra",
    text: "Sofia ha i richiami della settimana in bozza. Restano qui, non partono da soli.",
  },
  { kind: "chip", text: "⏱ Promemoria creato: Richiami settimanali" },
  {
    kind: "bubble",
    from: "segreteria",
    text: "Conferma lo spostamento a venerdì alle 9:30. Per il dente scheggiato niente WhatsApp: lo chiamo io.",
    reaction: "👍",
  },
  {
    kind: "bubble",
    from: "ginevra",
    text: "Nessun messaggio è partito. Il testo resta in questa chat: lo invii tu.",
  },
];

type LiveTurn = { from: "ginevra" | "segreteria"; text: string };

const maxUserTurns = 8;

export function DemoChat() {
  const [live, setLive] = useState<LiveTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const userTurns = live.filter((turn) => turn.from === "segreteria").length;
  const closed = userTurns >= maxUserTurns;

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [live, pending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending || closed) return;
    const history = [...live, { from: "segreteria" as const, text: content }];
    setLive(history);
    setDraft("");
    setPending(true);
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((turn) => ({
            role: turn.from === "segreteria" ? "user" : "assistant",
            content: turn.text,
          })),
        }),
      });
      const data = (await response.json().catch(() => null)) as { reply?: unknown } | null;
      const answer = typeof data?.reply === "string" && data.reply.trim() ? data.reply.trim() : null;
      setLive((current) => [
        ...current,
        {
          from: "ginevra",
          text: answer ?? "In questo momento non riesco a rispondere. Riprova tra poco.",
        },
      ]);
    } catch {
      setLive((current) => [
        ...current,
        { from: "ginevra", text: "In questo momento non riesco a rispondere. Riprova tra poco." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[28px] bg-[#16141c] text-[#f6f3ee] shadow-[0_30px_80px_-36px_rgba(40,20,60,0.55)]">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>
      <div className="flex h-[34rem] border-t border-white/10 sm:h-[36rem]">
        <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-white/10 py-3 sm:w-[4.5rem]">
          {assistants.map((person) => (
            <span
              key={person.id}
              className={`grid h-11 w-11 place-items-center rounded-2xl ${person.active ? "bg-violet/30" : ""}`}
              title={person.name}
            >
              <CharacterEmoji id={person.emoji} skinTone={person.skinTone} size={30} />
            </span>
          ))}
          <div className="mt-auto flex flex-col items-center gap-2 pb-1">
            <button
              type="button"
              aria-label="Nuova chat"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-lg text-white/70"
            >
              +
            </button>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-violet text-[11px] font-semibold text-white">
              SM
            </span>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <CharacterEmoji id="smilewoman" size={28} />
              <p className="truncate text-sm font-medium">Ginevra</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0 text-white/70">
              <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="9" cy="6.2" r="0.8" fill="currentColor" />
              <path d="M9 8.2v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
            {script.map((item, index) => (
              <ScriptRow key={`${item.kind}-${index}`} item={item} />
            ))}
            {live.map((turn, index) => (
              <Bubble key={`live-${index}`} from={turn.from} text={turn.text} />
            ))}
            {pending ? <p className="text-xs text-white/45">Ginevra sta scrivendo…</p> : null}
          </div>
          <form
            className="flex items-center gap-2 border-t border-white/10 px-3 py-3 sm:px-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <button
              type="button"
              aria-label="Allega"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg text-white/70"
            >
              +
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Messaggio per Ginevra</span>
              <input
                value={draft}
                maxLength={500}
                disabled={pending || closed}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={closed ? "Demo conclusa" : "Scrivi a Ginevra"}
                className="h-10 w-full rounded-full bg-white/10 px-4 text-sm text-[#f6f3ee] outline-none placeholder:text-white/40 focus:bg-white/15 disabled:opacity-60"
              />
            </label>
            {draft.trim() ? (
              <button
                type="submit"
                disabled={pending || closed}
                aria-label="Invia"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet text-white disabled:opacity-50"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2 8h12M9 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <button type="button" aria-label="Microfono" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/70">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="6" y="1.5" width="4" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M4 7.5a4 4 0 0 0 8 0M8 11.5V14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function ScriptRow({ item }: { item: ScriptItem }) {
  if (item.kind === "system") {
    return <p className="text-center text-xs text-white/50">{item.text}</p>;
  }
  if (item.kind === "chip") {
    return (
      <p className="mx-auto w-fit rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">{item.text}</p>
    );
  }
  if (item.kind === "status") {
    return <p className="text-xs leading-5 text-violet">{item.text}</p>;
  }
  return <Bubble from={item.from} text={item.text} reaction={item.reaction} />;
}

function Bubble({
  from,
  text,
  reaction,
}: {
  from: "ginevra" | "segreteria";
  text: string;
  reaction?: string;
}) {
  const mine = from === "segreteria";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[85%] ${reaction ? "mb-2" : ""}`}>
        <p
          className={`rounded-2xl px-3 py-2 text-sm leading-6 ${
            mine ? "rounded-br-md bg-[#f7f4f1] text-[#1c1915]" : "rounded-bl-md bg-[#322e3a] text-[#f6f3ee]"
          }`}
        >
          {text}
        </p>
        {reaction ? (
          <span className="absolute -bottom-2.5 right-3 rounded-full bg-[#3a3544] px-1.5 py-0.5 text-xs shadow">{reaction}</span>
        ) : null}
      </div>
    </div>
  );
}
