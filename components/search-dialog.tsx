"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex bg-paper md:items-center md:justify-center md:bg-ink/40 md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cerca"
        className="flex h-full w-full flex-col bg-paper md:h-auto md:max-w-lg md:rounded-3xl md:border md:border-line"
      >
        <div className="flex items-center gap-2 p-4">
          <input
            ref={inputRef}
            autoFocus
            placeholder="Cerca"
            aria-label="Cerca"
            enterKeyHint="search"
            className="h-12 min-w-0 flex-1 rounded-full border border-line bg-background px-4 text-sm outline-none focus:border-teal"
          />
          <button
            type="button"
            onClick={onClose}
            className="h-12 shrink-0 rounded-full border border-line px-4 text-sm"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
