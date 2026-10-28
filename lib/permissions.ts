export const permissionCatalog = [
  { key: "clinic.update", label: "Rinominare la clinica" },
  { key: "clinic.delete", label: "Eliminare la clinica" },
  { key: "members.manage", label: "Aggiungere e gestire le persone" },
  { key: "roles.manage", label: "Creare ruoli e assegnare i permessi" },
  { key: "patients.read", label: "Vedere i pazienti" },
  { key: "patients.write", label: "Creare e aggiornare i pazienti" },
  { key: "agenda.read", label: "Vedere l'agenda" },
  { key: "agenda.write", label: "Creare e aggiornare l'agenda" },
] as const;

export const permissionKeys = permissionCatalog.map((item) => item.key);

export function permissionLabel(key: string) {
  return permissionCatalog.find((item) => item.key === key)?.label ?? key;
}

export function listedPermissions(values: unknown[]) {
  const allowed = new Set<string>(permissionKeys);
  return [...new Set(values.map((value) => String(value)))].filter((key) => allowed.has(key));
}

export function roleSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!slug) return "ruolo";
  return /^[a-z]/.test(slug) ? slug : `r_${slug}`.slice(0, 41);
}
