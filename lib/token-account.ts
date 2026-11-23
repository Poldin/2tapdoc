export type ClinicTokenAccount = {
  planId: string;
  includedTokens: number;
  overageTokens: number;
  usedTokens: number;
  renewsAt: string;
  canEdit: boolean;
};

const countMax = 2_000_000_000;

function asCount(value: unknown) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isInteger(numeric) || numeric < 0 || numeric > countMax) return null;
  return numeric;
}

export function parseClinicTokenAccount(value: unknown): ClinicTokenAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const planId = typeof row.planId === "string" ? row.planId : "";
  const includedTokens = asCount(row.includedTokens);
  const overageTokens = asCount(row.overageTokens);
  const usedTokens = asCount(row.usedTokens);
  const renewsAt = typeof row.renewsAt === "string" ? row.renewsAt : "";
  if (!planId || includedTokens == null || overageTokens == null || usedTokens == null || !renewsAt) return null;
  if (Number.isNaN(Date.parse(renewsAt))) return null;
  return {
    planId,
    includedTokens,
    overageTokens,
    usedTokens,
    renewsAt,
    canEdit: row.canEdit === true,
  };
}
