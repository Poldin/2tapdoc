"use client";

import { Pencil, Trash } from "lucide-react";

export function ChatActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      role="menu"
      aria-label="Chat"
      className="absolute top-7 right-0 z-30 w-40 rounded-2xl border border-line bg-paper p-1 text-ink shadow-sm"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onEdit}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
      >
        <Pencil className="h-4 w-4" strokeWidth={2} />
        Modifica
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
      >
        <Trash className="h-4 w-4" strokeWidth={2} />
        Elimina
      </button>
    </div>
  );
}
