import Link from "next/link";
import type { ReactNode } from "react";
import { CharacterEmoji } from "@/components/character-emoji";
import { DemoChat } from "@/components/demo-chat";
import { MarketingFrame } from "@/components/marketing-frame";

const requests = [
  "Buongiorno, posso spostare l’appuntamento di giovedì? ho un imprevisto",
  "Salve quanto costa una pulizia?",
  "Mi si è rotto un pezzo di dente, avete posto oggi??",
  "mia figlia ha la febbre, il dottore riceve domani?",
  "Mi serve la fattura della visita di marzo per il 730",
  "avete parcheggio?",
  "buonasera, devo fare la ricetta per il solito farmaco",
  "ciao scusate sono in ritardo di 10 minuti, sto arrivando",
];

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
        <div className="mt-12 flex flex-col gap-1">
          {requests.map((text, index) => (
            <p
              key={text}
              className="rounded-2xl border border-line bg-white px-4 py-3 text-[15px] leading-6"
              style={{ opacity: 1 - index * 0.1 }}
            >
              {text}
            </p>
          ))}
        </div>
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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[clamp(1.7rem,3.4vw,2.4rem)] leading-snug font-semibold tracking-[-0.03em]">
              Parla con Ginevra.
            </h2>
            <p className="mt-2 max-w-xl text-base leading-7 text-muted">
              Studio Dentistico Demo. Nulla parte verso i pazienti senza la segreteria.
            </p>
          </div>
          <p className="flex gap-4 text-sm">
            <Link href="/whatsapp" className="font-medium text-ink underline-offset-4 hover:underline">
              WhatsApp
            </Link>
            <Link href="/prezzi" className="font-medium text-ink underline-offset-4 hover:underline">
              Prezzi
            </Link>
          </p>
        </div>
        <DemoChat />
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pt-8 pb-20 sm:px-8 sm:pb-28">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[32px] bg-violet px-6 py-10 text-white sm:flex-row sm:items-center sm:px-10">
          <p className="max-w-md text-2xl leading-snug font-semibold tracking-[-0.03em]">
            WhatsApp è il primo canale. I prezzi sono tre, le persone le stesse.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/whatsapp"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-violet hover:bg-violet-soft"
            >
              WhatsApp
            </Link>
            <Link
              href="/prezzi"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/40 px-6 text-[15px] font-medium text-white hover:bg-white/10"
            >
              Prezzi
            </Link>
          </div>
        </div>
      </section>
    </MarketingFrame>
  );
}
