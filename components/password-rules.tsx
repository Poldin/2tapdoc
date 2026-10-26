"use client";

import { passwordChecks } from "@/lib/auth/password";

export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {passwordChecks(password).map((check) => (
        <li key={check.label} className={check.met ? "text-teal" : "text-muted"}>
          <span className="sr-only">{check.met ? "Soddisfatta. " : "Mancante. "}</span>
          <span aria-hidden="true">{check.met ? "✓ " : "○ "}</span>
          {check.label}
        </li>
      ))}
    </ul>
  );
}
