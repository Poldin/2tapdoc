import type { ReactNode } from "react";
import Link from "next/link";

/** Piani pubblici (landing); usati anche in profilo finché Stripe non legge lo stato reale. */
export const clinicPricingPlans = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    popular: false,
    billing: "Gratis, per sempre",
    cta: "Inizia gratis",
    points: [
      "utenti limitati",
      "uso dell’AI e funzionalità limitate",
      "ideale per conoscere Clinico",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    price: "€28",
    popular: true,
    billing: "+IVA, fatturato mensilmente",
    cta: "Inizia con Studio",
    points: [
      "utenti illimitati",
      "10 MLN di token AI inclusi",
      "ricarica l'AI senza passare al piano successivo",
    ],
  },
  {
    id: "clinica",
    name: "Clinica",
    price: "€78",
    popular: false,
    billing: "+IVA, fatturato mensilmente",
    cta: "Inizia con Clinica",
    points: [
      "utenti illimitati",
      "35 MLN di token AI inclusi",
      "€10 al mese di messaggi WhatsApp inclusi",
      "ricarica l'AI senza passare al piano successivo",
    ],
  },
  {
    id: "gruppo",
    name: "Gruppo",
    price: "€148",
    popular: false,
    billing: "+IVA, fatturato mensilmente",
    cta: "Inizia con Gruppo",
    points: [
      "utenti illimitati",
      "71,5 MLN di token AI inclusi",
      "€20 al mese di messaggi WhatsApp inclusi",
      "Assistenza prioritaria",
      "ricarica AI scontata",
    ],
  },
] as const;

export type ClinicPricingPlanId = (typeof clinicPricingPlans)[number]["id"];

/** Tier index for upgrade path; unknown ids treated as Free. */
export function planTierIndex(planId: string) {
  const idx = clinicPricingPlans.findIndex((p) => p.id === planId);
  return idx === -1 ? 0 : idx;
}

type PricingPlanCardsProps = {
  /** When true, show current plan badge and choosable actions (profile dialog). */
  interactive?: boolean;
  currentPlanId?: string;
  /** Called when user picks another plan (Stripe non ancora collegato: solo feedback UI). */
  onSelectPlan?: (planId: string, planName: string) => void;
};

export function PricingPlanCards({
  interactive = false,
  currentPlanId = "free",
  onSelectPlan,
}: PricingPlanCardsProps) {
  const currentTier = planTierIndex(currentPlanId);

  return (
    <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {clinicPricingPlans.map((plan) => {
        const tier = clinicPricingPlans.findIndex((p) => p.id === plan.id);
        const isCurrent = interactive && tier === currentTier;
        const isUpgrade = interactive && tier > currentTier;
        const isDowngrade = interactive && tier < currentTier;

        let foot: ReactNode;
        if (!interactive) {
          foot = (
            <Link
              href="/register"
              className={`mt-8 inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet ${
                plan.popular
                  ? "bg-violet text-white hover:bg-violet-deep"
                  : "border border-line bg-white text-ink hover:bg-sand-deep"
              }`}
            >
              {plan.cta}
            </Link>
          );
        } else if (isCurrent) {
          foot = (
            <p className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-violet/40 bg-violet-soft px-4 text-center text-[15px] font-medium text-violet-deep">
              Piano attuale
            </p>
          );
        } else {
          const label = `Passa a ${plan.name}`;
          foot = (
            <button
              type="button"
              onClick={() => onSelectPlan?.(plan.id, plan.name)}
              className={`mt-8 inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet ${
                isUpgrade
                  ? "bg-violet text-white hover:bg-violet-deep"
                  : isDowngrade
                    ? "border border-dashed border-line bg-sand text-ink hover:bg-sand-deep"
                    : "border border-line bg-white text-ink hover:bg-sand-deep"
              }`}
            >
              {label}
            </button>
          );
        }

        return (
          <article
            key={plan.id}
            className={`flex flex-col rounded-[28px] p-6 sm:p-7 ${
              interactive && isCurrent
                ? "border-2 border-violet bg-violet-soft/40 shadow-[0_12px_40px_-24px_rgba(109,40,217,0.5)]"
                : plan.popular && !interactive
                  ? "border-2 border-violet bg-white shadow-[0_24px_60px_-28px_rgba(109,40,217,0.55)]"
                  : "border border-line bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold tracking-[-0.03em]">{plan.name}</h3>
              {interactive && isCurrent ? (
                <p className="rounded-full bg-violet px-3 py-1 text-[11px] font-medium tracking-wide text-white uppercase">
                  Attuale
                </p>
              ) : plan.popular && !interactive ? (
                <p className="rounded-full bg-violet px-3 py-1 text-[11px] font-medium tracking-wide text-white uppercase">
                  Più scelto
                </p>
              ) : null}
            </div>
            <p className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-semibold tracking-[-0.04em]">{plan.price}</span>
              <span className="pb-1 text-sm text-muted">/ mese</span>
            </p>
            <p className="mt-1 text-xs text-muted">{plan.billing}</p>
            <ul className="mt-6 flex-1 space-y-3 text-sm leading-6">
              {plan.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                  {point}
                </li>
              ))}
            </ul>
            {foot}
          </article>
        );
      })}
    </div>
  );
}

const shared = [
  "Risposte ai pazienti, anche fuori orario",
  "Prenotazioni scritte in agenda",
  "Promemoria prima della visita",
  "Stesso assistente, anche quando arriveranno altri canali",
];

export function PricingPlans({ cardsOnly = false }: { cardsOnly?: boolean } = {}) {
  return (
    <div>
      {!cardsOnly ? (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shared.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm leading-6 ring-1 ring-line">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-6 text-muted">
            Parti gratis, poi scegli il budget che serve allo studio. Nei piani a pagamento cambia l’AI inclusa, la
            quota WhatsApp e, in Clinica e Gruppo, l’assistenza. L’AI inclusa è un importo in euro: se serve di più, si
            compra una ricarica. Integrazione ufficiale WhatsApp in arrivo. Prezzi IVA esclusa.
          </p>
        </>
      ) : null}
      <div className={cardsOnly ? "" : "mt-8"}>
        <PricingPlanCards />
      </div>
    </div>
  );
}
