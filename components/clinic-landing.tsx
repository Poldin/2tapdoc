"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastClinic } from "@/lib/last-clinic";

export function ClinicLanding({ userId, clinicIds }: { userId: string; clinicIds: string[] }) {
  const router = useRouter();
  const allowed = clinicIds.join("\n");

  useEffect(() => {
    const ids = allowed.split("\n").filter((id) => id.length > 0);
    const saved = readLastClinic(userId);
    const target = saved && ids.includes(saved) ? saved : ids[0];
    if (target) router.replace(`/clinics/${target}`);
  }, [userId, allowed, router]);

  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16" />;
}
