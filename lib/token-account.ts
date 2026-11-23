export type OnDemandMode = "disabled" | "fixed" | "unlimited";

export type ClinicTokenAccount = {
  planId: string;
  includedTokens: number;
  usedTokens: number;
  renewsAt: string;
  canEdit: boolean;
  onDemand: OnDemandMode;
  spendLimitCents: number;
  onDemandCents: number;
  centsPerMillion: number;
  usageUpdatedAt: string | null;
};

const countMax = 2_000_000_000;

function asCount(value: unknown) {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isInteger(numeric) || numeric < 0 || numeric > countMax) return null;
  return numeric;
}

function asTimestamp(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return undefined;
  return value;
}

function asMode(value: unknown): OnDemandMode | null {
  if (value === "disabled" || value === "fixed" || value === "unlimited") return value;
  return null;
}

export function parseClinicTokenAccount(value: unknown): ClinicTokenAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const planId = typeof row.planId === "string" ? row.planId : "";
  const includedTokens = asCount(row.includedTokens);
  const usedTokens = asCount(row.usedTokens);
  const spendLimitCents = asCount(row.spendLimitCents);
  const onDemandCents = asCount(row.onDemandCents);
  const centsPerMillion = asCount(row.centsPerMillion);
  const onDemand = asMode(row.onDemand);
  const renewsAt = typeof row.renewsAt === "string" ? row.renewsAt : "";
  const usageUpdatedAt = asTimestamp(row.usageUpdatedAt);
  if (
    !planId ||
    includedTokens == null ||
    usedTokens == null ||
    spendLimitCents == null ||
    onDemandCents == null ||
    centsPerMillion == null ||
    centsPerMillion <= 0 ||
    !onDemand ||
    !renewsAt ||
    usageUpdatedAt === undefined
  ) {
    return null;
  }
  if (Number.isNaN(Date.parse(renewsAt))) return null;
  return {
    planId,
    includedTokens,
    usedTokens,
    renewsAt,
    canEdit: row.canEdit === true,
    onDemand,
    spendLimitCents,
    onDemandCents,
    centsPerMillion,
    usageUpdatedAt,
  };
}

export function euroToCents(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, "").replace("€", "");
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 10_000_000) return null;
  return cents;
}
