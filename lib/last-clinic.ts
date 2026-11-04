function storageKey(userId: string) {
  return `lastClinic:${userId}`;
}

export function rememberLastClinic(userId: string, clinicId: string) {
  try {
    localStorage.setItem(storageKey(userId), clinicId);
  } catch {
    // Storage can be unavailable in private mode.
  }
}

export function readLastClinic(userId: string) {
  try {
    const value = localStorage.getItem(storageKey(userId));
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}
