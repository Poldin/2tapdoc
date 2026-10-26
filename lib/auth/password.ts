export function passwordChecks(password: string) {
  return [
    { label: "Almeno 8 caratteri", met: password.length >= 8 },
    { label: "Una minuscola", met: /[a-z]/.test(password) },
    { label: "Una maiuscola", met: /[A-Z]/.test(password) },
    { label: "Un numero", met: /[0-9]/.test(password) },
    { label: "Un carattere speciale", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function passwordError(password: string) {
  const missing = passwordChecks(password).find((check) => !check.met);
  if (!missing) return null;
  return `Manca: ${missing.label.charAt(0).toLowerCase()}${missing.label.slice(1)}.`;
}
