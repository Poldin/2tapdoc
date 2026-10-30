import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { MarketingFrame } from "@/components/marketing-frame";
import { HeaderSession, MenuSession } from "@/components/marketing-session";

export const metadata: Metadata = {
  title: "Accedi",
  description: "Accedi al tuo studio Clinico.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <MarketingFrame headerActions={<HeaderSession />} menuActions={<MenuSession />}>
      <section className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center px-5 py-14 sm:px-8 sm:py-20">
        <div className="rounded-[28px] border border-line bg-white p-6 sm:p-8">
          <p className="text-sm font-medium text-violet">Account</p>
          <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.25rem)] leading-snug font-semibold tracking-[-0.03em]">
            Accedi
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Entra con l’email e la password del tuo studio.
          </p>
          <div className="mt-8">
            <AuthForm mode="login" />
          </div>
        </div>
      </section>
    </MarketingFrame>
  );
}
