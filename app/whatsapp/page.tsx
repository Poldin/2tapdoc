import type { Metadata } from "next";
import { ClinicoLanding } from "@/components/clinico-landing";
import { ClosingSession, HeaderSession, HeroSession, MenuSession } from "@/components/marketing-session";

export const metadata: Metadata = {
  title: "WhatsApp",
  description:
    "Su WhatsApp Clinico risponde ai pazienti, propone gli orari liberi e scrive la visita in agenda. È il primo canale. L’integrazione ufficiale è in arrivo.",
  alternates: { canonical: "/whatsapp" },
  openGraph: {
    title: "WhatsApp · Clinico",
    description:
      "Il primo canale di Clinico: risposte ai pazienti e prenotazioni in agenda. Integrazione ufficiale WhatsApp in arrivo.",
    url: "https://clinico.xyz/whatsapp",
    locale: "it_IT",
    type: "website",
  },
};

export default function WhatsAppPage() {
  return (
    <ClinicoLanding
      headerActions={<HeaderSession />}
      menuActions={<MenuSession />}
      heroActions={<HeroSession />}
      closingActions={<ClosingSession />}
    />
  );
}
