"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type PairStatus = {
  status?: string;
  qr?: string | null;
  error?: string | null;
  clinicId?: string | null;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function WhatsAppPair({ state }: { state: string }) {
  const [status, setStatus] = useState<PairStatus>({ status: "pending" });
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    async function tick() {
      const response = await fetch(`/tools/whatsapp/pair/status?state=${state}`, { cache: "no-store" });
      const body = (await response.json()) as PairStatus;
      if (stopped) return;
      setStatus(body);
      if (body.status === "linked" && body.clinicId && uuidPattern.test(body.clinicId)) {
        window.location.assign(`/clinics/${body.clinicId}?view=settings`);
        return;
      }
      if (body.status === "failed" || body.status === "expired") return;
      timer = window.setTimeout(() => void tick(), 2000);
    }
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [state]);

  useEffect(() => {
    const qr = status.qr;
    if (!qr) {
      setImage(null);
      return;
    }
    if (qr.startsWith("data:image")) {
      setImage(qr);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(qr, { margin: 1, width: 280 }).then((url) => {
      if (!cancelled) setImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [status.qr]);

  const waiting = status.status === "pending" || status.status === "installing";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-lg font-medium">WhatsApp</h1>
      {image ? (
        <>
          <img src={image} alt="QR di WhatsApp Web" className="h-72 w-72 rounded-2xl bg-white p-3" />
          <p className="text-sm text-muted">Apri WhatsApp, Dispositivi collegati, e scansiona questo QR.</p>
        </>
      ) : (
        <p className="text-sm text-muted">
          {waiting
            ? "Il server sta installando OpenWA."
            : status.status === "failed"
              ? status.error || "Non è stato possibile collegare WhatsApp."
              : "Il collegamento è scaduto. Riprova."}
        </p>
      )}
    </main>
  );
}
