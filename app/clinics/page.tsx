import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClinic } from "@/app/clinics/actions";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ClinicForm } from "@/components/clinic-form";
import { ClinicLanding } from "@/components/clinic-landing";

export default function ClinicsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
        </main>
      }
    >
      <ClinicsGate />
    </Suspense>
  );
}

async function ClinicsGate() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("clinic_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const clinicIds = (data ?? []).flatMap((row) => (row.clinic_id ? [row.clinic_id] : []));
  if (clinicIds.length > 0) return <ClinicLanding userId={user.id} clinicIds={clinicIds} />;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="text-sm tracking-[0.18em] text-muted uppercase">Clinico</p>
      <h1 className="mt-4 text-3xl font-semibold">Apri il tuo studio</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Sei il primo admin. Il nome si può cambiare dopo.
      </p>
      <ClinicForm action={createClinic} />
    </main>
  );
}
