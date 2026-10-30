import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { MarketingFrame } from "@/components/marketing-frame";
import { HeaderSession, MenuSession } from "@/components/marketing-session";

export const metadata: Metadata = {
  title: "Crea un account",
  description: "Crea un account Clinico per il tuo studio.",
  alternates: { canonical: "/register" },
};

export default function RegisterPage() {
  return (
    <MarketingFrame headerActions={<HeaderSession />} menuActions={<MenuSession />}>
      <section className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-5 py-14 sm:px-8 sm:py-20">
        <div className="rounded-[28px] border border-line bg-white p-6 sm:p-8">
          <p className="text-sm font-medium text-violet">Account</p>
          <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.25rem)] leading-snug font-semibold tracking-[-0.03em]">
            Crea un account
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Scegli email e password. Ti inviamo un codice per confermare l’indirizzo.
          </p>
          <div className="mt-8">
            <AuthForm mode="register" />
          </div>
        </div>
      </section>
    </MarketingFrame>
  );
}
