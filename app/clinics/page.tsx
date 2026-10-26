import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClinic } from "@/app/clinics/actions";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ClinicForm } from "@/components/clinic-form";

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
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.clinic_id) redirect(`/clinics/${data.clinic_id}`);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <p className="text-sm tracking-[0.18em] text-muted uppercase">2tapdoc</p>
      <h1 className="mt-4 text-3xl font-semibold">Apri il tuo studio</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        Sei il primo admin. Il nome si può cambiare dopo.
      </p>
      <ClinicForm action={createClinic} />
    </main>
  );
}
