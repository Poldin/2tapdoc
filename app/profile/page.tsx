import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PasskeySettings } from "@/components/passkey-settings";
import { PasswordForm } from "@/components/password-form";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-10">
        </main>
      }
    >
      <ProfileScreen />
    </Suspense>
  );
}

async function ProfileScreen() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("memberships")
    .select("clinic_id, clinics(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const clinics = (memberships ?? []).flatMap((membership) => {
    const clinic = membership.clinics as { name: string } | { name: string }[] | null;
    const name = Array.isArray(clinic) ? clinic[0]?.name : clinic?.name;
    if (!name) return [];
    return [{ id: membership.clinic_id, name }];
  });
  const initial = (user.email.trim()[0] || "?").toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-10">
      <Link
        href="/clinics"
        className="inline-flex h-10 w-fit items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-medium text-ink transition-colors hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet"
      >
        <ArrowLeft className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        Indietro
      </Link>
      <div className="mt-8 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-violet text-lg font-medium text-white">
          {initial}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Profilo</h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </div>

      <h2 className="mt-10 text-sm text-muted">Studi</h2>
      {clinics.length === 0 ? (
        <p className="mt-3 text-sm">Non hai ancora uno studio.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {clinics.map((clinic) => (
            <li key={clinic.id}>
              <Link
                href={`/clinics/${clinic.id}`}
                className="block rounded-2xl border border-line bg-paper px-4 py-3"
              >
                {clinic.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <PasswordForm />
      <PasskeySettings />

      <form action="/auth/sign-out" method="post" className="mt-6">
        <button type="submit" className="h-12 rounded-full border border-line px-5">
          Esci
        </button>
      </form>
    </main>
  );
}
