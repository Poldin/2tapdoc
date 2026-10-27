"use client";

import { useActionState, useEffect, useRef } from "react";
import { decideBotAction, type FormState } from "@/app/clinics/actions";

export type BotActionRequest = {
  id: string;
  botName: string;
  action: string;
};

export function BotActionDialog({
  open,
  clinicId,
  request,
  onDecided,
}: {
  open: boolean;
  clinicId: string;
  request: BotActionRequest | null;
  onDecided: (requestId: string) => void;
}) {
  const requestId = request?.id ?? "none";
  const [state, action, pending] = useActionState<FormState, FormData>(
    decideBotAction.bind(null, clinicId, requestId),
    {},
  );
  const onDecidedRef = useRef(onDecided);
  onDecidedRef.current = onDecided;

  useEffect(() => {
    if (!state.decided) return;
    onDecidedRef.current(state.decided);
  }, [state.decided]);

  if (!open || !request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bot-action-title"
        className="w-full max-w-sm rounded-3xl border border-line bg-paper p-5"
      >
        <h2 id="bot-action-title" className="text-base font-medium">
          <span className="font-semibold">{request.botName}</span> sta tentando di eseguire {request.action}. Procedere?
        </h2>
        {state.error ? <p className="mt-3 text-sm text-teal">{state.error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="submit"
            name="decision"
            value="cancelled"
            disabled={pending}
            className="h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="submit"
            name="decision"
            value="confirmed"
            disabled={pending}
            className="h-10 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
          >
            {pending ? "Attendere…" : "Procedi"}
          </button>
        </div>
      </form>
    </div>
  );
}
