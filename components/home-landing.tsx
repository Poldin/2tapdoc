import Link from "next/link";
import type { ReactNode } from "react";
import { DemoChat } from "@/components/demo-chat";
import { MarketingFrame } from "@/components/marketing-frame";

const trust = [
  {
    title: "GDPR",
    body: "I dati dei pazienti restano dello studio. Clinico li tratta per rispondere e prenotare, non per addestrare modelli pubblici.",
  },
  {
    title: "AI Act europeo",
    body: "Il paziente sa di parlare con un’intelligenza artificiale. Il bot non dà pareri clinici e non si finge una persona della segreteria.",
  },
  {
    title: "Dati in Europa",
    body: "Clinico è ospitato nell’Unione europea. I modelli sono di Mistral, anch’essi in UE.",
  },
  {
    title: "Trasparenza",
    body: "Ogni conversazione dice, in chiaro, che dall’altra parte c’è un bot. La segreteria può entrare quando serve una persona.",
  },
];

const rules = [
  "Il tono con cui lo studio parla ai pazienti",
  "Cosa il bot può fare: orari, prenotazioni, promemoria",
  "Cosa non può fare: pareri clinici, promesse, urgenze",
  "Quando deve fermarsi e chiamare una persona",
];

const memory = [
  { title: "Storia del paziente", body: "Nome, visite e note operative restano sulla scheda dello studio, non in un foglio a parte." },
  { title: "Conversazioni passate", body: "Il bot ritrova cosa era già stato chiesto, così il paziente non ricomincia da zero." },
  { title: "Preferenze", body: "Il pomeriggio, un professionista, un giorno della settimana: se lo studio lo sa, il bot lo ricorda." },
  { title: "Richiami", body: "Promemoria e controlli successivi restano agganciati alla persona, non a un messaggio perso." },
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
      <section className="mx-auto max-w-[1120px] px-5 pt-16 pb-8 sm:px-8 sm:pt-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-violet" />
          Bot AI per studi dentistici e medici
        </p>
        <h1 className="mt-6 max-w-[16ch] text-[clamp(3rem,6.4vw,5.35rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
          I bot dello studio,
          <span className="mt-1 block text-violet">in regola in Europa.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-muted">
          Clinico risponde ai pazienti, ricorda la storia e prepara i richiami. I modelli sono di Mistral, ospitati
          nell’Unione europea. Conformi al GDPR e all’AI Act. La segreteria detta le regole e può entrare in ogni
          conversazione.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="#demo"
            className="inline-flex h-12 items-center justify-center rounded-full bg-violet px-6 text-[15px] font-medium text-white transition-colors hover:bg-violet-deep"
          >
            Prova la demo
          </a>
          <Link
            href="/whatsapp"
            className="inline-flex h-12 items-center justify-center rounded-full border border-line bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-sand-deep"
          >
            Vedi WhatsApp
          </Link>
        </div>
        <p className="mt-5 text-sm text-muted">
          <Link href="/prezzi" className="font-medium text-ink underline-offset-4 hover:underline">
            Piani da €19 al mese, IVA esclusa
          </Link>
        </p>
      </section>

      <section id="conformita" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-sm font-medium text-violet">Conformità</p>
        <h2 className="mt-3 max-w-[18ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
          Prima di tutto, in Europa e in chiaro.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
          Lo studio sa dove stanno i dati, con quale modello lavora il bot e cosa viene detto al paziente.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {trust.map((item) => (
            <article key={item.title} className="rounded-[28px] border border-line bg-white p-6 sm:p-8">
              <span className="block h-1 w-10 rounded-full bg-violet" />
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em]">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="segreteria" className="scroll-mt-28 bg-sand-deep">
        <div className="mx-auto grid max-w-[1120px] gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-violet">Segreteria</p>
            <h2 className="mt-3 max-w-[16ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              Il bot lavora. La segreteria decide come.
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
              Regole, tono e confini li scrive lo studio. Il bot esegue. Se la conversazione esce da lì, una persona
              entra e prende il filo.
            </p>
            <ul className="mt-8 space-y-3 text-sm leading-6">
              {rules.map((rule) => (
                <li key={rule} className="flex items-start gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[28px] border border-line bg-white p-4 shadow-[0_18px_50px_-32px_rgba(60,40,20,0.45)]">
            <p className="px-2 pt-1 text-xs font-medium tracking-[0.14em] text-muted uppercase">Supervisione</p>
            <div className="mt-3 space-y-2 rounded-3xl bg-sand p-4">
              <p className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-white px-3 py-2 text-sm leading-6">
                Ho un dolore forte da stamattina. Cosa prendo?
              </p>
              <p className="max-w-[92%] rounded-2xl rounded-bl-md bg-violet px-3 py-2 text-sm leading-6 text-white">
                Sono un assistente AI e non posso consigliare farmaci. Passo la chat alla segreteria.
              </p>
              <p className="rounded-2xl border border-violet/30 bg-violet-soft px-3 py-2 text-sm leading-6">
                <span className="block text-[10px] font-semibold tracking-wide text-violet uppercase">Segreteria</span>
                Buongiorno, sono Giulia della reception. La richiamo io tra pochi minuti.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="memoria" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
        <p className="text-sm font-medium text-violet">Memoria</p>
        <h2 className="mt-3 max-w-[16ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
          Il bot tiene il filo, visita dopo visita.
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {memory.map((item) => (
            <article key={item.title} className="rounded-[28px] border border-line bg-white p-6 sm:p-8">
              <h3 className="text-xl font-semibold tracking-[-0.03em]">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="canali" className="scroll-mt-28 bg-sand-deep">
        <div className="mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
          <p className="text-sm font-medium text-violet">Canali</p>
          <h2 className="mt-3 max-w-[14ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
            Si parte da WhatsApp.
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
            È il primo canale. Gli altri arrivano, con lo stesso bot e le stesse regole della segreteria.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Link href="/whatsapp" className="rounded-[28px] border border-line bg-white p-6 transition-colors hover:border-violet/40 sm:p-8">
              <p className="text-[11px] font-medium tracking-[0.14em] text-violet uppercase">Primo canale</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">WhatsApp</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                Il paziente scrive, il bot risponde e la visita può finire in agenda. Integrazione ufficiale WhatsApp in
                arrivo.
              </p>
              <p className="mt-6 text-sm font-medium text-ink">Apri la pagina WhatsApp</p>
            </Link>
            <article className="rounded-[28px] border border-line bg-white p-6 sm:p-8">
              <p className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">In arrivo</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Sito, telefono, email</h3>
              <p className="mt-3 text-sm leading-6 text-muted">
                Stesso assistente, stesse regole, stessa memoria. Il canale cambia. Il modo di lavorare dello studio no.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="demo" className="scroll-mt-28 mx-auto max-w-[1120px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-medium text-violet">Demo</p>
            <h2 className="mt-3 max-w-[14ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              Scrivi allo Studio Dentistico Demo.
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted">
              È uno studio finto. Il bot si presenta come intelligenza artificiale, non dà pareri clinici e, se serve,
              dice che passa la chat alla segreteria.
            </p>
          </div>
          <DemoChat />
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="rounded-[32px] bg-violet px-6 py-12 text-white sm:px-12 sm:py-16">
          <h2 className="max-w-[16ch] text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
            Tre piani, le stesse funzioni.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/85">
            Da €19 al mese, IVA esclusa. Cambia il budget incluso, non quello che il bot sa fare per lo studio.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/prezzi"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-violet hover:bg-violet-soft"
            >
              Vedi i prezzi
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/40 px-6 text-[15px] font-medium text-white hover:bg-white/10"
            >
              Apri lo studio
            </Link>
          </div>
        </div>
      </section>
    </MarketingFrame>
  );
}
