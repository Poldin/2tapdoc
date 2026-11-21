import Link from "next/link";
import { clinicPricingPlans } from "@/components/pricing-plans";
import { ProfileComparePlansDialog } from "@/components/profile-compare-plans-dialog";

const defaultPlanId: (typeof clinicPricingPlans)[number]["id"] = "free";

function planLabel(planId: string) {
  const plan = clinicPricingPlans.find((p) => p.id === planId);
  return plan?.name ?? "Free";
}

/**
 * UI-only billing summary for clinic admins. Replace `currentPlanId` with Stripe subscription data when wired.
 */
export function ProfileBillingSection({
  adminClinics,
}: {
  adminClinics: { id: string; name: string; currentPlanId?: string }[];
}) {
  if (adminClinics.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-sm text-muted">Piano e fatturazione</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Gestisci il piano della clinica. I pagamenti saranno con Stripe; qui vedi solo lo stato attuale e il confronto
        con i piani sul sito.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {adminClinics.map((clinic) => {
          const planId = clinic.currentPlanId ?? defaultPlanId;
          const planName = planLabel(planId);
          return (
            <li key={clinic.id} className="rounded-2xl border border-line bg-paper px-4 py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{clinic.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    Piano attuale: <span className="text-ink">{planName}</span>
                  </p>
                </div>
                <div className="mt-3 flex shrink-0 flex-col gap-2 sm:mt-0 sm:items-end">
                  <Link
                    href={`/clinics/${clinic.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-sand"
                  >
                    Apri clinica
                  </Link>
                  <ProfileComparePlansDialog clinicName={clinic.name} currentPlanId={planId} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
