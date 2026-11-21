"use client";

import { CheckCheck, MessageSquareDot, Pencil, Trash, Users } from "lucide-react";

export function ChatActions({
  onEdit,
  onPeople,
  onDelete,
  onToggleUnread,
  unread = false,
  people = true,
  menuClassName = "top-7 right-0",
}: {
  onEdit: () => void;
  onPeople: () => void;
  onDelete: () => void;
  onToggleUnread?: () => void;
  unread?: boolean;
  people?: boolean;
  menuClassName?: string;
}) {
  return (
    <div
      role="menu"
      aria-label="Chat"
      className={`absolute z-30 w-52 rounded-2xl border border-line bg-paper p-1 text-ink shadow-sm ${menuClassName}`}
    >
      {onToggleUnread ? (
        <button
          type="button"
          role="menuitem"
          onClick={onToggleUnread}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
        >
          {unread ? (
            <CheckCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
          ) : (
            <MessageSquareDot className="h-4 w-4 shrink-0" strokeWidth={2} />
          )}
          {unread ? "Segna come letta" : "Segna come da leggere"}
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={onEdit}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
      >
        <Pencil className="h-4 w-4 shrink-0" strokeWidth={2} />
        Modifica
      </button>
      {people ? (
        <button
          type="button"
          role="menuitem"
          onClick={onPeople}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
        >
          <Users className="h-4 w-4 shrink-0" strokeWidth={2} />
          Persone
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
      >
        <Trash className="h-4 w-4 shrink-0" strokeWidth={2} />
        Elimina
      </button>
    </div>
  );
}
