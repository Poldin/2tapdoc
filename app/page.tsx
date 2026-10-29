import type { Metadata } from "next";
import { HomeLanding } from "@/components/home-landing";
import { HeaderSession, MenuSession } from "@/components/marketing-session";

export const metadata: Metadata = {
  title: {
    absolute: "Clinico — Lei è Ginevra",
  },
  description:
    "Lei è Ginevra: ti aiuta a gestire le richieste dei pazienti. Con lei Franco, Roberta, Sofia e Marco. La segreteria decide come lavorano.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Clinico — Lei è Ginevra",
    description:
      "Ginevra prende le richieste dei pazienti. Franco l’agenda, Roberta le email, Sofia i richiami, Marco la memoria.",
    url: "https://clinico.xyz",
    locale: "it_IT",
    type: "website",
  },
};

export default function Home() {
  return <HomeLanding headerActions={<HeaderSession />} menuActions={<MenuSession />} />;
}
