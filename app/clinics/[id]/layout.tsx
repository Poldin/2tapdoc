import { Suspense } from "react";
import { ClinicFrame } from "@/components/clinic-frame";
import { FrameSkeleton } from "@/components/panel-skeleton";

export default function ClinicLayout({ children, params }: LayoutProps<"/clinics/[id]">) {
  return (
    <Suspense fallback={<FrameSkeleton />}>
      <ClinicFrame params={params}>{children}</ClinicFrame>
    </Suspense>
  );
}
