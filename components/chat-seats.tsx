"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBot, addChatPerson, leaveChat, removeChatBot } from "@/app/clinics/actions";
import { BotGlyph } from "@/components/mark";

type ChatPerson = { id: string; name: string };
type BotMark = { id: string; name: string; color: string; emoji: string };

export function ChatSeats({
  clinicId,
  chatId,
  people,
  bots,
  colleagues,
  myBots,
  currentUserId,
  onEditBot,
  onLeft,
  onClose,
}: {
  clinicId: string;
  chatId: string;
  people: ChatPerson[];
  bots: BotMark[];
  colleagues: ChatPerson[];
  myBots: BotMark[];
  currentUserId: string;
  onEditBot: (bot: BotMark) => void;
  onLeft: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const owned = new Set(myBots.map((bot) => bot.id));
  const availableBots = myBots.filter((bot) => !bots.some((seat) => seat.id === bot.id));
  const seated = people.some((person) => person.id === currentUserId);

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (after) after();
      else router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-seats-title"
        className="flex max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-md flex-col rounded-3xl border border-line bg-paper p-5"
      >
        <h2 id="chat-seats-title" className="text-base font-medium">
          Persone e bot
        </h2>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {people.map((person) => (
              <li key={person.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-sm">
                  {(person.name.trim()[0] || "?").toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {person.name}
                  {person.id === currentUserId ? <span className="text-muted"> · tu</span> : null}
                </span>
              </li>
            ))}
            {bots.map((bot) => (
              <li key={bot.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                <BotGlyph color={bot.color} emoji={bot.emoji} plain className="h-9 w-9" />
                <span className="min-w-0 flex-1 truncate text-sm">{bot.name}</span>
                {owned.has(bot.id) ? (
                  <span className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onEditBot(bot)}
                      className="text-sm text-muted hover:text-ink disabled:opacity-40"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => removeChatBot(clinicId, chatId, bot.id))}
                      className="text-sm text-muted hover:text-ink disabled:opacity-40"
                    >
                      Togli
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {colleagues.length > 0 || availableBots.length > 0 ? (
            <div className="mt-4 border-t border-line pt-4">
              <p className="px-2 text-xs text-muted">Aggiungi</p>
              <ul className="mt-2 flex flex-col gap-1">
                {colleagues.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => addChatPerson(clinicId, chatId, person.id))}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm hover:bg-background disabled:opacity-40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-sm">
                        {(person.name.trim()[0] || "?").toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{person.name}</span>
                    </button>
                  </li>
                ))}
                {availableBots.map((bot) => (
                  <li key={bot.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const form = new FormData();
                          form.set("botId", bot.id);
                          return addBot(clinicId, chatId, {}, form);
                        })
                      }
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm hover:bg-background disabled:opacity-40"
                    >
                      <BotGlyph color={bot.color} emoji={bot.emoji} plain className="h-9 w-9" />
                      <span className="min-w-0 flex-1 truncate">{bot.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-teal">{error}</p> : null}
        <div className="mt-5 flex items-center justify-between gap-2">
          {seated && people.length > 1 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => leaveChat(clinicId, chatId), onLeft)}
              className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-40"
            >
              Esci
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="h-10 rounded-full bg-ink px-4 text-sm text-paper">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
