import type { Metadata } from "next";
import { HomeLanding } from "@/components/home-landing";
import { HeaderSession, MenuSession } from "@/components/marketing-session";

export const metadata: Metadata = {
  title: {
    absolute: "Clinico — Bot AI per lo studio, in Europa",
  },
  description:
    "Bot AI per studi dentistici e medici, ospitati nell’Unione europea. Conformi al GDPR e all’AI Act, con modelli Mistral. La segreteria detta le regole. WhatsApp è il primo canale.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Clinico — Bot AI per lo studio, in Europa",
    description:
      "GDPR, AI Act e modelli Mistral in UE. Il bot lavora, la segreteria decide. WhatsApp è il primo canale.",
    url: "https://clinico.xyz",
    locale: "it_IT",
    type: "website",
  },
};

export default function Home() {
  return <HomeLanding headerActions={<HeaderSession />} menuActions={<MenuSession />} />;
}
