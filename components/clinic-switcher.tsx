"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus } from "lucide-react";
import { ClinicDialog } from "@/components/clinic-dialog";

export type ClinicOption = {
  id: string;
  name: string;
};

export function ClinicSwitcher({
  clinics,
  currentId,
  name,
  open,
  onOpenChange,
}: {
  clinics: ClinicOption[];
  currentId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      onOpenChange(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Clinica ${name}`}
        onClick={() => onOpenChange(!open)}
        className="flex h-10 max-w-full items-center gap-1 rounded-full text-left text-sm text-muted"
      >
        <span className="truncate">{name}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Cliniche"
          className="absolute top-12 left-0 z-20 flex max-h-80 w-64 flex-col overflow-hidden rounded-2xl border border-line bg-paper text-ink shadow-sm"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {clinics.map((clinic) => {
              const selected = clinic.id === currentId;
              return (
                <Link
                  key={clinic.id}
                  href={`/clinics/${clinic.id}`}
                  role="menuitem"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-background"
                >
                  <span className={`min-w-0 flex-1 truncate ${selected ? "font-medium" : ""}`}>
                    {clinic.name}
                  </span>
                  {selected ? <Check className="h-4 w-4 shrink-0" strokeWidth={2} /> : null}
                </Link>
              );
            })}
          </div>
          <div className="border-t border-line p-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenChange(false);
                setCreateOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} />
              Nuova clinica
            </button>
          </div>
        </div>
      ) : null}
      <ClinicDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
