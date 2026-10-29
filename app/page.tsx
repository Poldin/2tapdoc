import type { Metadata } from "next";
import { ClinicoLanding } from "@/components/clinico-landing";
import { ClosingSession, HeaderSession, HeroSession, MenuSession } from "@/components/marketing-session";

export const metadata: Metadata = {
  title: {
    absolute: "Clinico — L'assistente AI per lo studio",
  },
  description:
    "Clinico risponde ai pazienti degli studi dentistici e medici, propone gli orari liberi e scrive la visita in agenda. WhatsApp è il primo canale. Piani da €19 al mese, IVA esclusa.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Clinico — L'assistente AI per lo studio",
    description:
      "Risponde ai pazienti, propone gli orari liberi e registra la visita in agenda. Piani da €19 al mese.",
    url: "https://clinico.xyz",
    locale: "it_IT",
    type: "website",
  },
};

export default function Home() {
  return (
    <ClinicoLanding
      headerActions={<HeaderSession />}
      menuActions={<MenuSession />}
      heroActions={<HeroSession />}
      closingActions={<ClosingSession />}
    />
  );
}
