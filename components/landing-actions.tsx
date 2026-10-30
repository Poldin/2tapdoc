import Link from "next/link";

const primary =
  "inline-flex h-12 items-center justify-center rounded-full bg-violet px-6 text-[15px] font-medium text-white transition-colors hover:bg-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet";
const secondary =
  "inline-flex h-12 items-center justify-center rounded-full border border-line bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-sand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet";
const navPrimary =
  "inline-flex h-10 items-center justify-center rounded-full bg-violet px-4 text-sm font-medium text-white transition-colors hover:bg-violet-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet";
export function LandingActions({
  signedIn,
  placement,
}: {
  signedIn: boolean;
  placement: "nav" | "menu" | "hero" | "closing" | "account";
}) {
  if (placement === "nav") {
    return signedIn ? (
      <Link href="/clinics" className={navPrimary}>
        Apri la clinica
      </Link>
    ) : (
      <>
        <Link
          href="/login"
          className="hidden h-10 items-center justify-center rounded-full px-3 text-sm font-medium text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet lg:inline-flex"
        >
          Accedi
        </Link>
        <Link href="/register" className={navPrimary}>
          Inizia
        </Link>
      </>
    );
  }

  if (placement === "menu") {
    return (
      <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
        {signedIn ? (
          <Link href="/clinics" className={primary}>
            Apri la clinica
          </Link>
        ) : (
          <>
            <Link href="/register" className={primary}>
              Inizia
            </Link>
            <Link href="/login" className={secondary}>
              Accedi
            </Link>
          </>
        )}
      </div>
    );
  }

  if (placement === "account") {
    return signedIn ? (
      <Link
        href="/clinics"
        className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-violet transition-colors hover:bg-violet-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Apri la clinica
      </Link>
    ) : (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link
          href="/register"
          className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-violet transition-colors hover:bg-violet-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Crea un account
        </Link>
        <Link href="/login" className="text-sm font-medium text-white/90 underline-offset-4 hover:underline">
          Hai già uno studio? Accedi
        </Link>
      </div>
    );
  }

  if (placement === "closing") {
    return signedIn ? (
      <Link
        href="/clinics"
        className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-violet transition-colors hover:bg-violet-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Apri la clinica
      </Link>
    ) : (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link
          href="/register"
          className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-violet transition-colors hover:bg-violet-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Crea un account
        </Link>
        <Link href="/#prezzi" className="text-sm font-medium text-white/90 underline-offset-4 hover:underline">
          Vedi i prezzi
        </Link>
      </div>
    );
  }

  return signedIn ? (
    <Link href="/clinics" className={primary}>
      Apri la clinica
    </Link>
  ) : (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link href="/register" className={primary}>
        Apri lo studio
      </Link>
      <Link href="/#prezzi" className={secondary}>
        Vedi i prezzi
      </Link>
    </div>
  );
}
