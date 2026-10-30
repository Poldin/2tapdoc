import Link from "next/link";

const plans = [
  {
    id: "base",
    name: "Base",
    price: "€19",
    popular: false,
    points: [
      "€9,50 al mese di utilizzo AI incluso",
      "Messaggi WhatsApp a consumo, con ricarico",
      "Oltre la quota AI, ricariche a consumo",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    price: "€29",
    popular: true,
    points: [
      "€14,50 al mese di utilizzo AI incluso",
      "€5 al mese di messaggi WhatsApp inclusi",
      "WhatsApp oltre la quota: al costo, senza ricarico",
      "Oltre la quota AI, ricariche a consumo",
    ],
  },
  {
    id: "clinica",
    name: "Clinica",
    price: "€79",
    popular: false,
    points: [
      "€39,50 al mese di utilizzo AI incluso",
      "€10 al mese di messaggi WhatsApp inclusi",
      "WhatsApp oltre la quota: al costo, senza ricarico",
      "Assistenza prioritaria",
      "Oltre la quota AI, ricariche a consumo",
    ],
  },
] as const;

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
            Le funzioni sono le stesse in ogni piano. Cambia il budget incluso e, solo in Clinica, l’assistenza. L’AI inclusa
            è un importo in euro, non un numero di conversazioni: se serve di più, si compra una ricarica. Integrazione
            ufficiale WhatsApp in arrivo. Prezzi IVA esclusa.
          </p>
        </>
      ) : null}
      <div className={`grid items-stretch gap-4 lg:grid-cols-3 ${cardsOnly ? "" : "mt-8"}`}>
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={`flex flex-col rounded-[28px] p-6 sm:p-8 ${
              plan.popular
                ? "border-2 border-violet bg-white shadow-[0_24px_60px_-28px_rgba(109,40,217,0.55)]"
                : "border border-line bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold tracking-[-0.03em]">{plan.name}</h3>
              {plan.popular ? (
                <p className="rounded-full bg-violet px-3 py-1 text-[11px] font-medium tracking-wide text-white uppercase">
                  Più scelto
                </p>
              ) : null}
            </div>
            <p className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-semibold tracking-[-0.04em]">{plan.price}</span>
              <span className="pb-1 text-sm text-muted">/ mese</span>
            </p>
            <p className="mt-1 text-xs text-muted">+IVA, fatturato mensilmente</p>
            <ul className="mt-6 flex-1 space-y-3 text-sm leading-6">
              {plan.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={`mt-8 inline-flex h-12 items-center justify-center rounded-full px-6 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet ${
                plan.popular
                  ? "bg-violet text-white hover:bg-violet-deep"
                  : "border border-line bg-white text-ink hover:bg-sand-deep"
              }`}
            >
              Inizia con {plan.name}
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
