import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm tracking-[0.18em] text-muted uppercase">
        Clinico
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Crea un account</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Email e password. Poi inserisci il codice che arriva per email.
      </p>
      <div className="mt-8">
        <AuthForm mode="register" />
      </div>
    </main>
  );
}
