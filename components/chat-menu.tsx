"use client";

import { useEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import { ChatActions } from "@/components/chat-actions";
import { DeleteChatDialog } from "@/components/delete-chat-dialog";

export function ChatMenu({
  selected,
  clinicId,
  chatId,
  name,
  stayOn,
  onEdit,
}: {
  selected: boolean;
  clinicId: string;
  chatId: string;
  name: string;
  stayOn: string | null;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Apri il menu della chat"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-6 w-6 items-center justify-center rounded-full ${
          selected ? "text-paper hover:bg-white/15" : "text-muted hover:bg-background"
        }`}
      >
        <Ellipsis className="h-4 w-4" strokeWidth={2} />
      </button>
      {open ? (
        <ChatActions
          onEdit={() => {
            setOpen(false);
            onEdit();
          }}
          onDelete={() => {
            setOpen(false);
            setConfirming(true);
          }}
        />
      ) : null}
      {confirming ? (
        <DeleteChatDialog
          open
          clinicId={clinicId}
          chatId={chatId}
          name={name}
          stayOn={stayOn}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
