import { Suspense } from "react";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-20">
      <p className="text-sm tracking-[0.18em] text-muted uppercase">2tapdoc</p>
      <h1 className="mt-4 max-w-xl text-4xl leading-tight font-semibold text-ink">
        L&apos;AI è la prima interfaccia dello studio.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
        Dottori, segreteria e amministrazione parlano con il sistema. La clinica tiene i
        dati, e ognuno vede solo ciò che il suo ruolo gli lascia raggiungere.
      </p>
      <Suspense fallback={<div className="mt-8 h-12" />}>
        <HomeActions />
      </Suspense>
    </main>
  );
}

async function HomeActions() {
  const user = await getSessionUser();

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      {user ? (
        <Link
          href="/clinics"
          className="flex h-12 items-center justify-center rounded-full bg-teal px-6 text-teal-ink"
        >
          Apri la clinica
        </Link>
      ) : (
        <>
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-full bg-teal px-6 text-teal-ink"
          >
            Accedi
          </Link>
          <Link
            href="/register"
            className="flex h-12 items-center justify-center rounded-full border border-line px-6"
          >
            Crea un account
          </Link>
        </>
      )}
    </div>
  );
}
