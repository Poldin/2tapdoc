import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="text-sm tracking-[0.18em] text-muted uppercase">
        2tapdoc
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Accedi</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Entra con l&apos;email e la password che hai scelto.
      </p>
      <div className="mt-8">
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
