import { Suspense } from "react";
import { ClinicPanel } from "@/components/clinic-panel";
import { PanelSkeleton } from "@/components/panel-skeleton";

export default function ClinicPage({ params, searchParams }: PageProps<"/clinics/[id]">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <ClinicPanel params={params} searchParams={searchParams} />
    </Suspense>
  );
}
