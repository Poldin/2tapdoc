"use client";

import { useEffect, useRef, type RefObject } from "react";

const options = [
  {
    id: "conversation",
    title: "conversazione",
    subtitle: "crea una chat con bot e colleghi",
  },
  {
    id: "bot",
    title: "bot",
    subtitle: "crea un bot",
  },
] as const;

export function CreateMenu({
  open,
  anchorRef,
  onConversation,
  onBot,
  onClose,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onConversation: () => void;
  onBot: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const actions = { conversation: onConversation, bot: onBot };

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Crea"
      className="absolute top-full right-4 z-20 w-64 max-w-[calc(100%-2rem)] rounded-2xl border border-line bg-paper p-1 shadow-sm"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitem"
          onClick={actions[option.id]}
          className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-background"
        >
          <span className="font-bold">{option.title}</span>
          <span className="text-sm text-muted">{option.subtitle}</span>
        </button>
      ))}
    </div>
  );
}
