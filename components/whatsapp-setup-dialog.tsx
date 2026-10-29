"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { dropIntegration, requestWhatsAppQr, startMastroW, type CreatedChat, type FormState } from "@/app/clinics/actions";
import { BotGlyph } from "@/components/mark";
import { createClient } from "@/lib/supabase/client";

const mastroWColor = "green";
const mastroWEmoji = "1f9d0_facewithmonocle";

function storageKey(integrationId: string) {
  return `2tapdoc.whatsapp.setup.${integrationId}`;
}

export function clearWhatsAppSetupDraft(integrationId: string) {
  try {
    window.localStorage.removeItem(storageKey(integrationId));
  } catch {
    /* ignore quota / private mode */
  }
}

export function WhatsAppSetupDialog({
  open,
  clinicId,
  integrationId,
  canManage,
  onClose,
  onCreatedChat,
}: {
  open: boolean;
  clinicId: string;
  integrationId: string;
  canManage: boolean;
  webhookVerifyToken?: string;
  onClose: () => void;
  onLinkedNote?: (note: string) => void;
  onCreatedChat?: (chat: CreatedChat) => void;
}) {
  const router = useRouter();
  const [qrRaw, setQrRaw] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const [mastroState, mastroAction, mastroPending] = useActionState<FormState, FormData>(
    startMastroW.bind(null, clinicId),
    {},
  );
  const [dropState, dropAction, dropPending] = useActionState<FormState, FormData>(
    dropIntegration.bind(null, clinicId, integrationId),
    {},
  );

  const busy = mastroPending || dropPending;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onCreatedChatRef = useRef(onCreatedChat);
  onCreatedChatRef.current = onCreatedChat;

  useEffect(() => {
    if (!mastroState.created) return;
    onCloseRef.current();
    onCreatedChatRef.current?.(mastroState.created);
  }, [mastroState.created]);

  useEffect(() => {
    if (!dropState.sent) return;
    onCloseRef.current();
  }, [dropState.sent]);

  useEffect(() => {
    if (!open || !canManage) return;
    let cancelled = false;
    void requestWhatsAppQr(clinicId, integrationId).then((res) => {
      if (!cancelled && res.error) setQrError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canManage, clinicId, integrationId]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let stopped = false;

    async function pollState() {
      if (stopped) return;
      const [{ data: channelRow }, { data: intRow }] = await Promise.all([
        supabase
          .from("whatsapp_channels")
          .select("qr_code")
          .eq("integration_id", integrationId)
          .maybeSingle(),
        supabase
          .from("integrations")
          .select("status")
          .eq("id", integrationId)
          .maybeSingle(),
      ]);
      if (stopped) return;
      if (intRow?.status === "connected") {
        router.refresh();
        onCloseRef.current();
        return;
      }
      if (typeof channelRow?.qr_code === "string" && channelRow.qr_code.trim() !== "") {
        setQrRaw(channelRow.qr_code);
      }
    }

    void pollState();
    const interval = window.setInterval(pollState, 2500);

    const channel = supabase.channel(`whatsapp-qr:${integrationId}`);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "whatsapp_channels",
        filter: `integration_id=eq.${integrationId}`,
      },
      () => {
        void pollState();
      },
    );
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "integrations",
        filter: `id=eq.${integrationId}`,
      },
      () => {
        void pollState();
      },
    );

    void supabase.auth.getSession().then(({ data }) => {
      if (stopped) return;
      const token = data.session?.access_token;
      const ready = token ? supabase.realtime.setAuth(token) : Promise.resolve();
      void ready.then(() => {
        if (!stopped) channel.subscribe();
      });
    });

    return () => {
      stopped = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [open, integrationId, router]);

  useEffect(() => {
    if (!qrRaw) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(qrRaw, {
      width: 240,
      margin: 1,
      color: { dark: "#1c1915", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrRaw]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-setup-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-paper p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="whatsapp-setup-title" className="text-base font-medium">
            Collega WhatsApp
          </h2>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            disabled={busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <p className="text-sm leading-6 text-muted">
          Apri WhatsApp sul telefono dello studio → <span className="font-medium text-ink">Dispositivi collegati</span> →{" "}
          <span className="font-medium text-ink">Collega un dispositivo</span> e inquadra il QR code.
        </p>

        <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-background p-5">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR code per collegare WhatsApp"
              className="h-56 w-56 rounded-xl bg-white p-2"
            />
          ) : (
            <div className="flex h-56 w-56 flex-col items-center justify-center gap-2 text-center text-sm text-muted">
              <span>Generazione QR code in corso…</span>
            </div>
          )}
        </div>

        {qrError || mastroState.error || dropState.error ? (
          <p className="text-sm text-teal" aria-live="polite">
            {qrError || mastroState.error || dropState.error}
          </p>
        ) : null}

        {canManage ? (
          <div className="flex flex-col gap-2">
            <form action={mastroAction}>
              <button
                type="submit"
                disabled={busy}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-teal px-5 text-sm font-medium text-teal-ink disabled:opacity-50"
              >
                <BotGlyph color={mastroWColor} emoji={mastroWEmoji} animate plain className="h-7 w-7" />
                <span>{mastroPending ? "Avvio Mastro W…" : "Hai bisogno di aiuto? Chiedi a Mastro W"}</span>
              </button>
            </form>
            <form action={dropAction}>
              <button
                type="submit"
                disabled={busy}
                className="h-10 rounded-full border border-line px-4 text-sm text-muted hover:text-ink disabled:opacity-50"
              >
                {dropPending ? "Rimozione…" : "Rimuovi integrazione"}
              </button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted">In attesa del collegamento.</p>
        )}
      </div>
    </div>
  );
}
