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
  placement: "nav" | "menu";
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
