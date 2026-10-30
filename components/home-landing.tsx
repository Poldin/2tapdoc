import type { ReactNode } from "react";
import { CharacterEmoji } from "@/components/character-emoji";
import { DemoChat } from "@/components/demo-chat";
import { RequestStack } from "@/components/request-stack";
import { TaskPhones } from "@/components/task-phones";
import { MarketingFrame } from "@/components/marketing-frame";
import { PricingPlans } from "@/components/pricing-plans";

const cast = [
  { id: "ginevra", emoji: "smilewoman", skinTone: undefined },
  { id: "franco", emoji: "smileman", skinTone: "light" as const },
  { id: "roberta", emoji: "womanraisinghand", skinTone: "light" as const },
  { id: "sofia", emoji: "womancurlyhair", skinTone: "dark" as const },
  { id: "marco", emoji: "manbeard", skinTone: "medium-light" as const },
];

const colleagues = [
  {
    ...cast[1],
    line: "Lui è Franco: gestisce l’agenda.",
    example: "Giovedì alle 16 è pieno. Venerdì alle 9:30 è libero, oppure ti tengo in lista se si libera un posto.",
  },
  {
    ...cast[2],
    line: "Lei è Roberta: gestisce le email e WhatsApp.",
    example:
      "«Mi mandate la fattura di marzo?» arriva per email. «Avete posto oggi??» arriva su WhatsApp. Roberta risponde su entrambi.",
  },
  {
    ...cast[3],
    line: "Lei è Sofia: promemoria e richiami.",
    example: "Domani alle 15:30, controllo. E sei mesi dopo la pulizia, un messaggio per fissare il richiamo.",
  },
  {
    ...cast[4],
    line: "Lui è Marco: ricorda tutto di ogni paziente.",
    example: "Preferisce il pomeriggio, l’ultima volta ha chiesto la fattura, e il figlio viene sempre col papà.",
  },
];

function EuStars({ radius = 11.2 }: { radius?: number }) {
  return (
    <>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = ((index * 30 - 90) * Math.PI) / 180;
        const x = 16 + Math.cos(angle) * radius;
        const y = 16 + Math.sin(angle) * radius;
        return (
          <polygon
            key={index}
            fill="#FFCC00"
            points="0,-1.25 .38,-.4 1.28,-.4 .52,.18 .82,1.1 0,.58 -.82,1.1 -.52,.18 -1.28,-.4 -.38,-.4"
            transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
          />
        );
      })}
    </>
  );
}

function GdprIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#003399" />
      <EuStars />
      <rect x="12.2" y="15.2" width="7.6" height="6" rx="1" fill="#fff" />
      <path d="M13.6 15.2v-1.5a2.4 2.4 0 0 1 4.8 0v1.5" fill="none" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

function AiActIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#003399" />
      <EuStars radius={11.6} />
      <text x="16" y="18.2" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="sans-serif">
        AI
      </text>
    </svg>
  );
}

function EuropeIcon() {
  const stars = Array.from({ length: 12 }, (_, index) => {
    const angle = ((index * 30 - 90) * Math.PI) / 180;
    return { x: 18 + Math.cos(angle) * 6.4, y: 12 + Math.sin(angle) * 6.4 };
  });
  return (
    <svg width="42" height="28" viewBox="0 0 36 24" aria-hidden="true">
      <rect width="36" height="24" fill="#003399" />
      {stars.map((star) => (
        <polygon
          key={`${star.x}-${star.y}`}
          fill="#FFCC00"
          points="0,-1.05 .32,-.32 1.08,-.32 .44,.14 .68,.92 0,.48 -.68,.92 -.44,.14 -1.08,-.32 -.32,-.32"
          transform={`translate(${star.x.toFixed(2)} ${star.y.toFixed(2)})`}
        />
      ))}
    </svg>
  );
}

function TransparencyIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="5" width="24" height="22" rx="1.4" fill="#D7E6F8" stroke="#6D28D9" strokeWidth="1.6" />
      <path d="M6.4 7.6h8.4L6.4 17.2z" fill="#fff" />
      <path d="M17.8 21.6h6.4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MistralMark() {
  return (
    <svg width="22" height="16" viewBox="0 0 21 15" aria-hidden="true">
      <path d="M6 0H3V3H6V0Z" fill="#FFAF01" />
      <path d="M6 9H3V12H6V9Z" fill="#E61300" />
      <path d="M9 12H0V15H9V12Z" fill="#C4001D" />
      <path d="M9 3H3V6H9V3Z" fill="#FF8204" />
      <path d="M12 9H9V12H12V9Z" fill="#E61300" />
      <path d="M18 6H3V9H18V6Z" fill="#FA500F" />
      <path d="M18 3H12V6H18V3Z" fill="#FF8204" />
      <path d="M18 0H15V3H18V0Z" fill="#FFAF01" />
      <path d="M18 9H15V12H18V9Z" fill="#E61300" />
      <path d="M21 12H12V15H21V12Z" fill="#C4001D" />
    </svg>
  );
}


const homeFaq = [
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
    q: "C’è un piano gratuito?",
    a: "Sì. Free è gratis per sempre, con uso dell’AI e funzionalità limitate, per provare Clinico. Quando serve di più, passi a Studio, Clinica o Gruppo.",
  },
  {
    q: "Cos’è una ricarica?",
    a: "È utilizzo AI in più, quando finisce la quota mensile del piano. Si paga a consumo, senza cambiare piano. Non c’è un numero fisso di conversazioni: il budget è in euro, e il consumo dipende da come lo studio usa l’assistente.",
  },
  {
    q: "Cosa copre il credito WhatsApp?",
    a: "Studio include €5 al mese di messaggi, Clinica €10, Gruppo €20. Oltre quella quota i messaggi si pagano al costo, senza ricarico. La quota è quella del mese. Integrazione ufficiale WhatsApp in arrivo: questi importi si riferiscono a quella.",
  },
  {
    q: "Posso cambiare piano?",
    a: "Sì, quando vuoi, anche dal piano Free. Nei piani a pagamento cambiano il canone, il budget AI incluso, la quota messaggi WhatsApp e, in Clinica e Gruppo, l’assistenza prioritaria. Puoi disdire quando vuoi.",
  },
];

const trust = [
  {
    title: "GDPR",
    body: "I dati dei pazienti restano dello studio. Non servono ad addestrare modelli pubblici.",
    icon: <GdprIcon />,
  },
  {
    title: "AI Act europeo",
    body: "Si presentano come intelligenza artificiale. Non danno pareri clinici e non si fingono la segreteria.",
    icon: <AiActIcon />,
  },
  {
    title: "Dati in Europa",
    body: "Ospitati nell’Unione europea. I modelli sono di Mistral, anch’essi in UE.",
    icon: <EuropeIcon />,
  },
  {
    title: "Trasparenza",
    body: "Il paziente sa con chi sta scrivendo. Se serve una persona, la segreteria entra in chat.",
    icon: <TransparencyIcon />,
  },
];

export function HomeLanding({
  headerActions,
  menuActions,
}: {
  headerActions: ReactNode;
  menuActions: ReactNode;
}) {
  return (
    <MarketingFrame headerActions={headerActions} menuActions={menuActions}>
      <section id="ginevra" className="scroll-mt-28 mx-auto max-w-[760px] px-5 pt-16 pb-6 sm:px-8 sm:pt-24">
        <div className="flex items-center gap-4 sm:gap-6">
          <CharacterEmoji id={cast[0].emoji} size={104} />
          <h1 className="text-[clamp(1.65rem,4vw,2.6rem)] leading-[1.15] font-semibold tracking-[-0.035em] text-balance">
            Lei è Ginevra: ti aiuta a gestire le richieste dei pazienti.
          </h1>
        </div>
        <RequestStack />
      </section>

      <section id="colleghi" className="scroll-mt-28 mx-auto max-w-[760px] px-5 py-12 sm:px-8 sm:py-16">
        <div className="space-y-16">
          {colleagues.map((person) => (
            <article key={person.id} className="scroll-mt-28">
              <div className="flex items-center gap-4 sm:gap-5">
                <CharacterEmoji id={person.emoji} skinTone={person.skinTone} size={76} />
                <h2 className="text-[clamp(1.45rem,3vw,2rem)] leading-snug font-semibold tracking-[-0.03em] text-balance">
                  {person.line}
                </h2>
              </div>
              <p className="mt-4 ml-0 max-w-xl rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-ink ring-1 ring-line sm:ml-24">
                {person.example}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section id="segreteria" className="scroll-mt-28 bg-sand-deep">
        <div className="mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-nowrap items-center justify-start gap-2 sm:gap-4">
            {cast.map((person) => (
              <CharacterEmoji key={person.id} id={person.emoji} skinTone={person.skinTone} size={56} />
            ))}
          </div>
          <h2 className="mt-8 text-[clamp(1.7rem,3.4vw,2.4rem)] leading-snug font-semibold tracking-[-0.03em] text-balance">
            Ginevra, Roberta, Sofia: sono Intelligenze artificiali che ti supportano ogni giorno.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Scegli tu i loro nomi, di cosa si occupano e come vuoi che lavorino. Loro eseguono.
          </p>
        </div>
      </section>

      <section id="conformita" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="max-w-[16ch] text-[clamp(1.7rem,3.4vw,2.4rem)] leading-snug font-semibold tracking-[-0.03em]">
          In Europa, e in chiaro.
        </h2>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          powered by
          <MistralMark />
          <span className="sr-only">Mistral</span>
        </p>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="shrink-0">{item.icon}</span>
              <div>
                <h3 className="font-semibold tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="demo" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-8 sm:px-8 sm:py-12">
        <DemoChat />
      </section>

      <section className="relative mx-auto max-w-[1120px] px-5 py-6 sm:px-8 sm:py-10">
        <div className="relative overflow-hidden rounded-[36px] bg-[#16141c] px-6 pt-12 pb-44 text-[#f6f3ee] sm:px-12 sm:pt-16 sm:pb-16">
          <h2 className="max-w-[12ch] text-[clamp(2.1rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.04em]">
            Scrivi ai tuoi assistenti
            <br />
            come a dei colleghi
          </h2>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:max-w-[34rem] sm:text-lg sm:leading-8">
            Affida i compiti a Ginevra, Franco, Roberta, Sofia e Marco come faresti con una collega, da computer o da
            telefono. Portano a termine il lavoro dall’inizio alla fine, ricordano come lavora il tuo studio,
            migliorano col tempo e tornano da te quando serve la tua approvazione.
          </p>
          <div aria-hidden="true" className="pointer-events-none absolute -right-3 -bottom-3 sm:hidden">
            <CharacterEmoji id="wink" size={148} />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute -right-5 -bottom-4 hidden sm:block">
            <CharacterEmoji id="wink" size={232} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 py-10 sm:px-8 sm:py-14">
        <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] leading-snug font-semibold tracking-[-0.035em]">
          Dai a ciascuno un compito
        </h2>
        <div className="mt-6">
          <TaskPhones />
        </div>
      </section>


      <section id="prezzi" className="scroll-mt-28 bg-sand-deep">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] leading-snug font-semibold tracking-[-0.035em]">
            Scegli il piano per te
          </h2>
          <p className="mt-3 text-base leading-7 text-muted sm:text-lg">Disdici quando vuoi.</p>
          <div className="mt-10">
            <PricingPlans cardsOnly />
          </div>
        </div>
      </section>

      <section id="domande" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="text-[clamp(1.8rem,4vw,2.8rem)] leading-snug font-semibold tracking-[-0.035em]">
          Domande frequenti
        </h2>
        <div className="mt-8 border-t border-line">
          {homeFaq.map((item) => (
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

    </MarketingFrame>
  );
}
