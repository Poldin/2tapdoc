import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFrame } from "@/components/marketing-frame";
import { AccountSession, HeaderSession, MenuSession } from "@/components/marketing-session";
import { PricingPlans } from "@/components/pricing-plans";

export const metadata: Metadata = {
  title: "Prezzi",
  description:
    "Piani Clinico da €19 al mese, IVA esclusa. Stesse funzioni per lo studio: cambia il budget AI incluso, la quota WhatsApp e l’assistenza.",
  alternates: { canonical: "/prezzi" },
  openGraph: {
    title: "Prezzi · Clinico",
    description:
      "Tre piani, le stesse funzioni. Budget AI, messaggi WhatsApp e assistenza cambiano. IVA esclusa.",
    url: "https://clinico.xyz/prezzi",
    locale: "it_IT",
    type: "website",
  },
};

const faq = [
  {
    q: "Cos’è una ricarica?",
    a: "È utilizzo AI in più, quando finisce la quota mensile del piano. Si paga a consumo, senza cambiare piano. Non c’è un numero fisso di conversazioni: il budget è in euro, e il consumo dipende da come lo studio usa l’assistente.",
  },
  {
    q: "Cosa copre il credito WhatsApp?",
    a: "Studio include €5 al mese di messaggi, Clinica €10. Oltre quella quota i messaggi si pagano al costo, senza ricarico. Nel piano Base non c’è una quota messaggi: i costi WhatsApp sono ribaltati con un ricarico fin dal primo messaggio. La quota è quella del mese. Integrazione ufficiale WhatsApp in arrivo: questi importi si riferiscono a quella.",
  },
  {
    q: "Posso cambiare piano?",
    a: "Sì, quando vuoi. Le funzioni restano le stesse. Cambiano il canone, il budget AI incluso, la quota messaggi WhatsApp e, solo nel piano Clinica, l’assistenza prioritaria.",
  },
];

export default function PrezziPage() {
  return (
    <MarketingFrame headerActions={<HeaderSession />} menuActions={<MenuSession />} current="prezzi">
      <section className="mx-auto max-w-[1120px] px-5 pt-16 pb-6 sm:px-8 sm:pt-24">
        <p className="text-sm font-medium text-violet">Prezzi</p>
        <h1 className="mt-3 max-w-[14ch] text-[clamp(2.6rem,6vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
          Stesse funzioni.
          <span className="mt-1 block text-violet">Budget diverso.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-muted">
          Clinico risponde ai pazienti e scrive le visite in agenda, in ogni piano. Cambia quanto utilizzo AI è
          incluso, come si pagano i messaggi WhatsApp e se l’assistenza è prioritaria.
        </p>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-8 sm:px-8">
        <PricingPlans />
      </section>

      <section id="domande-prezzi" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
          Domande sui prezzi
        </h2>
        <div className="mt-8 border-t border-line">
          {faq.map((item) => (
            <details key={item.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-xl leading-none text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-sm leading-7 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="rounded-[32px] bg-violet px-6 py-12 text-white sm:px-12 sm:py-16">
          <h2 className="max-w-[16ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
            Si parte da €19 al mese.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/85">
            IVA esclusa. Crei lo studio e colleghi il primo canale. Se l’AI inclusa non basta, aggiungi una ricarica.
            Integrazione ufficiale WhatsApp in arrivo.
          </p>
          <div className="mt-8">
            <AccountSession />
          </div>
          <p className="mt-6 text-sm text-white/75">
            <Link href="/" className="underline-offset-4 hover:underline">
              Torna alla pagina principale
            </Link>
          </p>
        </div>
      </section>
    </MarketingFrame>
  );
}
