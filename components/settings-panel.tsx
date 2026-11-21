"use client";

import { SettingsView, type ClinicAsset, type ClinicIntegration, type ClinicMember, type ClinicRole, type Specialist } from "@/components/settings-view";
import { useClinicChrome } from "@/components/clinic-chrome";

export function SettingsPanel({
  clinicId,
  clinicName,
  canRename,
  canDelete,
  canManageMembers,
  canManageRoles,
  canManageAgenda,
  currentUserId,
  members,
  roles,
  specialists,
  assets,
  integrations,
  canManageIntegrations,
  webhookVerifyToken,
}: {
  clinicId: string;
  clinicName: string;
  canRename: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageAgenda: boolean;
  currentUserId: string;
  members: ClinicMember[];
  roles: ClinicRole[];
  specialists: Specialist[];
  assets: ClinicAsset[];
  integrations: ClinicIntegration[];
  canManageIntegrations: boolean;
  webhookVerifyToken: string;
}) {
  const chrome = useClinicChrome();
  return (
    <SettingsView
      clinicId={clinicId}
      clinicName={clinicName}
      canRename={canRename}
      canDelete={canDelete}
      canManageMembers={canManageMembers}
      canManageRoles={canManageRoles}
      canManageAgenda={canManageAgenda}
      currentUserId={currentUserId}
      members={members}
      roles={roles}
      specialists={specialists}
      assets={assets}
      integrations={integrations}
      canManageIntegrations={canManageIntegrations}
      webhookVerifyToken={webhookVerifyToken}
      onCreatedChat={chrome?.onChatCreated}
    />
  );
}
