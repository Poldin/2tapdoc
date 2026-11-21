import { type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ClinicShell } from "@/components/clinic-shell";
import { getSessionUser } from "@/lib/auth/session";
import { clinicIdPattern, loadClinicFrame, loadPendingConfirmations, loadUserChatStates } from "@/lib/clinic-frame";

export async function ClinicFrame({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const { id } = await params;
  if (!clinicIdPattern.test(id)) notFound();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [frame, chatStates, pendingConfirmations] = await Promise.all([
    loadClinicFrame(user.id, id),
    loadUserChatStates(user.id),
    loadPendingConfirmations(id),
  ]);
  if (!frame) redirect("/clinics");

  return (
    <ClinicShell
      clinicId={frame.clinic.id}
      clinicName={frame.clinic.name}
      clinics={frame.clinics}
      email={user.email}
      chats={frame.chats}
      initialChatStates={chatStates}
      initialPendingConfirmations={pendingConfirmations}
      currentUserId={user.id}
      clinicPeople={frame.people}
      myBots={frame.myBots}
      recency={frame.recency}
    >
      {children}
    </ClinicShell>
  );
}
