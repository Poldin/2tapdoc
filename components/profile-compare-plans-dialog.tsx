"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { PricingPlanCards } from "@/components/pricing-plans";

export function ProfileComparePlansDialog({
  clinicName,
  currentPlanId,
}: {
  clinicName: string;
  currentPlanId: string;
}) {
  const [open, setOpen] = useState(false);
  const [chosenPlanLabel, setChosenPlanLabel] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setChosenPlanLabel(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center rounded-full bg-violet px-4 text-sm font-medium text-white transition-colors hover:bg-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
      >
        Confronta piani
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex h-[95vh] max-h-[95vh] w-full min-w-[min(100%-2rem,60vw)] max-w-6xl flex-col overflow-hidden rounded-[28px] border border-line bg-white shadow-[0_24px_60px_-28px_rgba(28,25,21,0.45)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-sand/50 px-5 py-4 sm:px-7">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold tracking-[-0.03em] text-ink">
                  Confronta piani
                </h2>
                <p className="mt-1 text-sm text-muted">
                  <span className="font-medium text-ink">{clinicName}</span>
                  {" · "}
                  confronta e scegli un piano; il checkout Stripe arriverà a breve.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-paper text-muted transition-colors hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
              <PricingPlanCards
                interactive
                currentPlanId={currentPlanId}
                onSelectPlan={(_planId, planName) => setChosenPlanLabel(planName)}
              />
              {chosenPlanLabel ? (
                <p className="mt-6 rounded-2xl border border-violet/30 bg-violet-soft/60 px-4 py-3 text-sm text-ink" role="status">
                  Hai scelto il piano <span className="font-semibold">{chosenPlanLabel}</span>. Il collegamento con Stripe
                  per completare il pagamento non è ancora attivo: resta su questa schermata per la prossima versione.
                </p>
              ) : null}
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
                Prezzi IVA esclusa, fatturato mensile.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
