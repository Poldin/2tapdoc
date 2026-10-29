import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://clinico.xyz"),
  title: {
    default: "Clinico",
    template: "%s · Clinico",
  },
  description:
    "Clinico è l'assistente AI per studi dentistici e medici. Risponde ai pazienti e scrive le prenotazioni in agenda.",
  applicationName: "Clinico",
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "Clinico",
    title: "Clinico",
    description:
      "Clinico è l'assistente AI per studi dentistici e medici. Risponde ai pazienti e scrive le prenotazioni in agenda.",
    url: "https://clinico.xyz",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-ink">{children}</body>
    </html>
  );
}
