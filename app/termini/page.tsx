import type { Metadata } from "next";
import { MarketingFrame } from "@/components/marketing-frame";
import { HeaderSession, MenuSession } from "@/components/marketing-session";

export const metadata: Metadata = {
  title: "Termini e condizioni",
  description: "Termini e condizioni di Clinico. Il testo completo è in corso di finalizzazione.",
  alternates: { canonical: "/termini" },
};

export default function TerminiPage() {
  return (
    <MarketingFrame headerActions={<HeaderSession />} menuActions={<MenuSession />}>
      <section className="mx-auto max-w-[760px] px-5 py-16 sm:px-8 sm:py-24">
        <h1 className="text-[clamp(2rem,4vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
          Termini e condizioni
        </h1>
        <p className="mt-6 text-base leading-7 text-muted sm:text-lg sm:leading-8">
          Stiamo finalizzando i termini e le condizioni d’uso di Clinico. Qui troverai a breve le regole del servizio,
          le responsabilità delle parti e le condizioni di abbonamento.
        </p>
        <p className="mt-4 text-sm leading-6 text-muted">
          Per qualsiasi richiesta nel frattempo: scrivi a{" "}
          <a href="mailto:hello@clinico.xyz" className="font-medium text-ink underline-offset-4 hover:underline">
            hello@clinico.xyz
          </a>
          .
        </p>
      </section>
    </MarketingFrame>
  );
}
