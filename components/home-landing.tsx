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

const colleagues = [
  {
    id: "franco",
    emoji: "smileman",
    line: "Lui è Franco: gestisce l’agenda.",
    example: "Giovedì alle 16 è pieno. Venerdì alle 9:30 è libero, oppure ti tengo in lista se si libera un posto.",
  },
  {
    id: "roberta",
    emoji: "officeworkerfemale",
    line: "Lei è Roberta: gestisce le email.",
    example: "«Mi mandate la fattura di marzo per il 730?» Roberta trova la visita e risponde con il documento.",
  },
  {
    id: "sofia",
    emoji: "womanraisinghand",
    line: "Lei è Sofia: promemoria e richiami.",
    example: "Domani alle 15:30, controllo. E sei mesi dopo la pulizia, un messaggio per fissare il richiamo.",
  },
  {
    id: "marco",
    emoji: "manteacher",
    line: "Lui è Marco: ricorda tutto di ogni paziente.",
    example: "Preferisce il pomeriggio, l’ultima volta ha chiesto la fattura, e il figlio viene sempre col papà.",
  },
];

const trust = [
  {
    title: "GDPR",
    body: "I dati dei pazienti restano dello studio. Non servono ad addestrare modelli pubblici.",
  },
  {
    title: "AI Act europeo",
    body: "Si presentano come intelligenza artificiale. Non danno pareri clinici e non si fingono la segreteria.",
  },
  {
    title: "Dati in Europa",
    body: "Ospitati nell’Unione europea. I modelli sono di Mistral, anch’essi in UE.",
  },
  {
    title: "Trasparenza",
    body: "Il paziente sa con chi sta scrivendo. Se serve una persona, la segreteria entra in chat.",
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
          <CharacterEmoji id="smilewoman" size={104} />
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

      <section id="colleghi" className="scroll-mt-28 mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-lg leading-8 text-muted">Poi chiama chi sa farle.</p>
        <div className="mt-14 space-y-16">
          {colleagues.map((person) => (
            <article key={person.id} className="scroll-mt-28">
              <div className="flex items-center gap-4 sm:gap-5">
                <CharacterEmoji id={person.emoji} size={76} />
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
          <h2 className="text-[clamp(1.7rem,3.4vw,2.4rem)] leading-snug font-semibold tracking-[-0.03em] text-balance">
            La segreteria decide come lavorano, e può entrare in ogni chat.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            Tono, orari, cosa possono dire e cosa no. Se la conversazione esce da lì, una persona prende il filo.
          </p>
        </div>
      </section>

      <section id="conformita" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="max-w-[16ch] text-[clamp(1.7rem,3.4vw,2.4rem)] leading-snug font-semibold tracking-[-0.03em]">
          In Europa, e in chiaro.
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trust.map((item) => (
            <article key={item.title} className="rounded-[24px] border border-line bg-white p-5">
              <h3 className="font-semibold tracking-[-0.02em]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="demo" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-8 sm:px-8 sm:py-12">
        <div className="grid items-start gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="flex items-center gap-3">
              <CharacterEmoji id="smilewoman" size={56} />
              <h2 className="text-[clamp(1.7rem,3.4vw,2.4rem)] leading-snug font-semibold tracking-[-0.03em]">
                Parla con Ginevra.
              </h2>
            </div>
            <p className="mt-4 text-base leading-7 text-muted">
              Studio Dentistico Demo, uno studio finto. Si presenta come intelligenza artificiale e non scrive visite
              vere in agenda.
            </p>
            <p className="mt-6 flex flex-col gap-2 text-sm">
              <Link href="/whatsapp" className="font-medium text-ink underline-offset-4 hover:underline">
                Come funziona su WhatsApp
              </Link>
              <Link href="/prezzi" className="font-medium text-ink underline-offset-4 hover:underline">
                Prezzi, da €19 al mese
              </Link>
            </p>
          </div>
          <DemoChat />
        </div>
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
