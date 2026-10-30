import type { ReactNode } from "react";
import Link from "next/link";
import { MarketingFrame } from "@/components/marketing-frame";
import { PricingPlans } from "@/components/pricing-plans";

const faq = [
  {
    q: "Clinico sostituisce il gestionale?",
    a: "No. Cartelle, contabilità e piani di cura restano dove sono. Clinico è l’assistente che parla con i pazienti e tiene le prenotazioni in agenda.",
  },
  {
    q: "Funziona solo su WhatsApp?",
    a: "WhatsApp è il primo canale, ed è quello con cui si parte. L’integrazione ufficiale WhatsApp è in arrivo. Clinico è l’assistente dello studio: sito, telefono e gli altri messaggi useranno lo stesso modo di rispondere e di prenotare.",
  },
  {
    q: "La prenotazione finisce davvero in agenda?",
    a: "Sì. Il paziente sceglie tra gli orari liberi e la visita compare sull’agenda del professionista, con nome e motivo. Puoi spostarla o annullarla come qualsiasi altro appuntamento.",
  },
  {
    q: "Chi vede messaggi e pazienti?",
    a: "Ogni persona vede solo i dati che il suo ruolo, in quella clinica, le consente di raggiungere. I pazienti appartengono allo studio, non a un account personale.",
  },
  {
    q: "Quanto ci vuole per partire?",
    a: "Pochi minuti. Si crea l’account, si dà un nome allo studio, si indicano orari e professionisti e si collega il numero WhatsApp. Non c’è nulla da installare in reception.",
  },
  {
    q: "Va bene anche per uno studio medico?",
    a: "Sì. È pensato per studi dentistici e per studi medici: la segreteria, i professionisti e l’agenda funzionano allo stesso modo.",
  },
  {
    q: "Se il paziente chiede un parere clinico?",
    a: "Clinico resta sul pratico: orari, prenotazioni e indicazioni che lo studio ha definito. Non dà pareri clinici. Quando serve una persona, il messaggio resta nello studio.",
  },
];

const steps = [
  {
    n: "01",
    title: "Racconta lo studio",
    body: "Orari, professionisti e il modo in cui volete parlare ai pazienti. Clinico non esce da lì.",
  },
  {
    n: "02",
    title: "Collega il primo canale",
    body: "Il numero WhatsApp dello studio. È il canale da cui si parte, non l’unico che esisterà.",
  },
  {
    n: "03",
    title: "Controlla l’agenda",
    body: "Le visite confermate compaiono da sole. Si spostano e si annullano come tutte le altre.",
  },
];

const principles = [
  {
    title: "La voce è la vostra",
    body: "Risponde con indicazioni, orari e limiti che impostate voi. Se non è nello studio, non lo inventa.",
  },
  {
    title: "L’agenda resta vostra",
    body: "Ogni prenotazione si vede, si sposta e si annulla. Nessuna visita scritta e poi dimenticata in chat.",
  },
  {
    title: "I dati sono della clinica",
    body: "Pazienti e appuntamenti appartengono allo studio. Ogni persona vede solo ciò che il suo ruolo consente.",
  },
];

function WhatsAppThread() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#e7ddd4] bg-[#ece5dd]">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xs font-semibold">SB</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Studio Bianchi</p>
          <p className="flex items-center gap-1.5 text-[11px] text-white/75">
            <span className="clinico-pulse h-1.5 w-1.5 rounded-full bg-[#7dffb3]" />
            WhatsApp · in linea
          </p>
        </div>
      </div>
      <div className="space-y-2.5 px-3 py-4">
        <Bubble mine time="09:14">
          Buongiorno, avete un controllo martedì pomeriggio?
        </Bubble>
        <Bubble time="09:14">
          Buongiorno Giulia. Martedì il dott. Greco è libero alle 15:30 e alle 17:00. Quale preferisce?
        </Bubble>
        <Bubble mine time="09:15">
          Alle 15:30, grazie.
        </Bubble>
        <Bubble time="09:15">
          Prenotato. Martedì 4 novembre alle 15:30, controllo con il dott. Greco. Lunedì sera le mando un promemoria.
        </Bubble>
      </div>
    </div>
  );
}

function Bubble({
  children,
  mine = false,
  time,
}: {
  children: ReactNode;
  mine?: boolean;
  time: string;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-5 shadow-sm ${
          mine ? "rounded-br-md bg-[#d9fdd3] text-[#111b21]" : "rounded-bl-md bg-white text-[#111b21]"
        }`}
      >
        {mine ? null : <p className="mb-0.5 text-[10px] font-semibold text-violet">Clinico</p>}
        <p>{children}</p>
        <p className="mt-1 text-right text-[10px] text-[#667781]">{time}</p>
      </div>
    </div>
  );
}

function AgendaMock() {
  const rows = [
    { time: "14:30", name: "Marco Rinaldi", reason: "Igiene" },
    { time: "15:30", name: "Giulia Bianchi", reason: "Controllo", fresh: true },
    { time: "16:30", name: "Libero", open: true },
    { time: "17:00", name: "Elena Costa", reason: "Prima visita" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-line bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] text-muted uppercase">Agenda</p>
          <p className="mt-0.5 font-medium">Martedì 4 novembre</p>
        </div>
        <p className="shrink-0 rounded-full bg-white px-3 py-1 text-xs ring-1 ring-line">Dott. Greco</p>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.time}
            className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${
              row.fresh ? "clinico-rise clinico-rise-late bg-violet-soft" : ""
            }`}
          >
            <span className={`w-12 shrink-0 text-xs tabular-nums ${row.fresh ? "font-medium text-violet" : "text-muted"}`}>
              {row.time}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm ${row.open ? "text-muted" : "font-medium"}`}>{row.name}</span>
              {row.reason ? <span className="block truncate text-xs text-muted">{row.reason}</span> : null}
            </span>
            {row.fresh ? (
              <span className="shrink-0 rounded-full bg-violet px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
                In agenda
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-auto border-t border-line px-4 py-3 text-xs text-muted">Scritta in agenda insieme alla conferma.</p>
    </div>
  );
}

export function ClinicoLanding({
  headerActions,
  menuActions,
  heroActions,
  closingActions,
}: {
  headerActions: ReactNode;
  menuActions: ReactNode;
  heroActions: ReactNode;
  closingActions: ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Clinico",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://clinico.xyz",
    description:
      "Assistente AI per studi dentistici e medici. Risponde ai pazienti e scrive le prenotazioni in agenda.",
    inLanguage: "it",
  };

  return (
    <MarketingFrame headerActions={headerActions} menuActions={menuActions} current="whatsapp">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <section className="mx-auto max-w-[1120px] px-5 pt-16 pb-8 sm:px-8 sm:pt-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-violet" />
            Assistente AI per studi dentistici e medici
          </p>
          <h1 className="mt-6 max-w-[14ch] text-[clamp(3rem,6.4vw,5.35rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
            Il paziente scrive.
            <span className="mt-1 block text-violet">La visita è in agenda.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-muted">
            Clinico risponde ai pazienti quando la segreteria è in visita, di sera e nel weekend. Propone solo
            orari liberi, conferma la visita e la scrive in agenda. WhatsApp è il primo canale. Gli altri arrivano,
            con lo stesso assistente.
          </p>
          <div className="mt-8">{heroActions}</div>
          <p className="mt-5 text-sm text-muted">Studi dentistici, studi medici e poliambulatori.</p>

          <figure className="relative mt-14 sm:mt-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-6 -top-10 bottom-8 -z-10 rounded-[40px] bg-[radial-gradient(ellipse_at_top,rgba(109,40,217,0.10),transparent_62%)]"
            />
            <div className="rounded-[32px] border border-line bg-white p-3 shadow-[0_30px_80px_-36px_rgba(60,40,20,0.35)] sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3 px-2 pt-1">
                <p className="text-sm font-medium">Studio Bianchi</p>
                <p className="text-xs text-muted">Esempio di una prenotazione</p>
              </div>
              <div className="grid items-stretch gap-3 lg:grid-cols-2">
                <WhatsAppThread />
                <AgendaMock />
              </div>
            </div>
            <figcaption className="mx-auto mt-4 max-w-2xl text-center text-sm leading-6 text-muted">
              Giulia chiede un controllo. Clinico conferma martedì alle 15:30 e la visita compare sull’agenda del
              dott. Greco.
            </figcaption>
          </figure>
        </section>

        <section id="funzioni" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
          <p className="text-sm font-medium text-violet">Funzioni</p>
          <h2 className="mt-3 max-w-[16ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
            Lo studio risponde, anche a reception chiusa.
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
            Le richieste trovano una risposta. Le visite trovano un orario. La segreteria smette di rifare lo stesso
            lavoro a mano.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <article className="flex flex-col justify-between gap-8 rounded-[28px] border border-line bg-white p-6 shadow-[0_18px_50px_-32px_rgba(60,40,20,0.45)] sm:p-8 lg:col-span-7">
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.03em]">Risposte, a qualsiasi ora</h3>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted">
                  Orari, come arrivare, quanto dura una seduta, cosa portare. Con le parole dello studio, di giorno e
                  di notte. Se la domanda chiede un parere clinico, non lo dà.
                </p>
              </div>
              <div className="rounded-3xl bg-sand-deep p-4">
                <div className="mb-3 flex items-center justify-between text-[11px] text-muted">
                  <span>Paziente</span>
                  <span>23:41 · studio chiuso</span>
                </div>
                <div className="space-y-2">
                  <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-3 py-2 text-sm leading-5">
                    A che ora aprite domani?
                  </p>
                  <p className="max-w-[90%] rounded-2xl rounded-bl-md bg-violet px-3 py-2 text-sm leading-5 text-white">
                    Apriamo alle 9. Il primo posto libero con la dott.ssa Neri è alle 11:20. Lo tengo?
                  </p>
                </div>
              </div>
            </article>

            <article className="flex flex-col justify-between rounded-[28px] border border-line bg-white p-6 shadow-[0_18px_50px_-32px_rgba(60,40,20,0.45)] sm:p-8 lg:col-span-5">
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.03em]">La visita finisce in agenda</h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Il paziente sceglie tra gli orari davvero liberi. L’appuntamento compare sul professionista, con nome
                  e motivo.
                </p>
              </div>
              <div className="mt-8 rounded-2xl border border-violet/20 bg-violet-soft p-4">
                <p className="text-[11px] font-medium tracking-[0.14em] text-violet uppercase">Nuova visita</p>
                <p className="mt-2 font-medium">Giulia Bianchi · Controllo</p>
                <p className="mt-1 text-sm text-muted">Martedì 4 novembre · 15:30 · Dott. Greco</p>
              </div>
            </article>

            <article className="rounded-[28px] border border-line bg-white p-6 shadow-[0_18px_50px_-32px_rgba(60,40,20,0.45)] sm:p-8 lg:col-span-4">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">Promemoria, meno buchi</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                Il giorno prima Clinico ricorda data e ora. Meno assenze, meno telefonate per riempire la giornata.
              </p>
              <p className="mt-6 rounded-2xl bg-sand px-4 py-3 text-sm leading-6">
                Le ricordiamo la visita di domani alle 15:30 con il dott. Greco.
              </p>
            </article>

            <article className="rounded-[28px] border border-line bg-white p-6 shadow-[0_18px_50px_-32px_rgba(60,40,20,0.45)] sm:p-8 lg:col-span-4">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">WhatsApp oggi. Poi gli altri.</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                Si parte dal numero dello studio. Integrazione ufficiale WhatsApp in arrivo. Gli altri canali useranno
                lo stesso assistente.
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                {[
                  ["WhatsApp", "Primo canale"],
                  ["Sito dello studio", "In arrivo"],
                  ["Telefono", "In arrivo"],
                  ["Email", "In arrivo"],
                ].map(([name, state]) => (
                  <li key={name} className="flex items-center justify-between gap-3 rounded-xl bg-sand px-3 py-2">
                    <span>{name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        state === "Primo canale" ? "bg-violet text-white" : "bg-white text-muted ring-1 ring-line"
                      }`}
                    >
                      {state}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[28px] border border-line bg-white p-6 shadow-[0_18px_50px_-32px_rgba(60,40,20,0.45)] sm:p-8 lg:col-span-4">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">In piedi in pochi minuti</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                Un account, gli orari, il canale. Nessun progetto di mesi e nulla da installare in studio.
              </p>
              <ol className="mt-6 space-y-3 text-sm">
                {["Crea lo studio", "Indica orari e professionisti", "Collega WhatsApp"].map((item, index) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-violet text-[11px] font-medium text-white">
                      {index + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </section>

        <section id="come-funziona" className="scroll-mt-28 bg-sand-deep">
          <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
            <p className="text-sm font-medium text-violet">Come funziona</p>
            <h2 className="mt-3 max-w-[14ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              Tre passi, poi lavora da solo.
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3">
              {steps.map((step) => (
                <li key={step.n}>
                  <p className="text-sm font-medium text-violet">{step.n}</p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
          <p className="text-sm font-medium text-violet">Per lo studio</p>
          <h2 className="mt-3 max-w-[16ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
            Voi decidete. Clinico esegue.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {principles.map((item) => (
              <article key={item.title} className="rounded-[28px] border border-line bg-white p-6 sm:p-8">
                <span className="block h-1 w-10 rounded-full bg-violet" />
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em]">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="prezzi" className="scroll-mt-28 bg-sand-deep">
          <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
            <p className="text-sm font-medium text-violet">Prezzi</p>
            <h2 className="mt-3 max-w-[16ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              Tre piani. Le stesse funzioni.
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
              Da €19 al mese, IVA esclusa. Cambia il budget di AI incluso e come si pagano i messaggi WhatsApp.
              L’assistenza prioritaria è solo nel piano Clinica.
            </p>
            <div className="mt-12">
              <PricingPlans />
            </div>
            <p className="mt-8 text-sm leading-6 text-muted">
              <Link href="/#domande" className="font-medium text-ink underline-offset-4 hover:underline">
                Ricariche, credito WhatsApp e cambio piano
              </Link>
            </p>
          </div>
        </section>

        <section id="domande" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
          <h2 className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
            Domande frequenti
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

        <section id="inizia" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
          <div className="rounded-[32px] bg-violet px-6 py-12 text-white sm:px-12 sm:py-16">
            <h2 className="max-w-[14ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              Porta Clinico nel tuo studio.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/85">
              Crei l’account, dai un nome alla clinica e colleghi WhatsApp. In pochi minuti l’assistente può
              rispondere, e l’agenda è la vostra.
            </p>
            <ul className="mt-8 grid gap-2 text-sm text-white/90 sm:grid-cols-2">
              {[
                "Risposte ai pazienti, tutti i giorni",
                "Prenotazioni scritte in agenda",
                "Promemoria prima della visita",
                "WhatsApp subito, altri canali dopo",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8">{closingActions}</div>
          </div>
        </section>
    </MarketingFrame>
  );
}
