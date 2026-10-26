"use client";

import { useActionState } from "react";
import { type FormState } from "@/app/clinics/actions";

export function ClinicForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm">
        Nome dello studio
        <input
          name="name"
          required
          maxLength={80}
          className="h-12 rounded-xl border border-line bg-paper px-3 outline-none focus:border-teal"
        />
      </label>
      {state.error ? <p className="text-sm text-teal">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-full bg-teal text-teal-ink disabled:opacity-50"
      >
        {pending ? "Creazione…" : "Entra nello studio"}
      </button>
    </form>
  );
}
