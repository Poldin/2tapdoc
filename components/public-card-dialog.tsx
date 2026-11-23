"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapPin, Phone } from "lucide-react";
import { BotGlyph } from "@/components/mark";
import { publicPageImageUrl, type PublicPageCard } from "@/lib/public-page-card";

function CardDescription({ text }: { text: string }) {
  const body = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = body.current;
    if (!node || open) return;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, open]);

  return (
    <div>
      <p ref={body} className={`text-sm leading-6 ${open ? "" : "line-clamp-3"}`}>
        {text}
      </p>
      {overflows || open ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mt-1 text-sm text-muted"
        >
          {open ? "Mostra meno" : "Mostra tutto"}
        </button>
      ) : null}
    </div>
  );
}

export function PublicCardDialog({
  open,
  clinicName,
  emoji,
  card,
  onClose,
}: {
  open: boolean;
  clinicName: string;
  emoji: string;
  card: PublicPageCard;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const headingRow = useRef<HTMLDivElement>(null);
  const headingProbe = useRef<HTMLSpanElement>(null);
  const [titleBeside, setTitleBeside] = useState(true);

  useLayoutEffect(() => {
    if (!open) return;
    const row = headingRow.current;
    const probe = headingProbe.current;
    if (!row || !probe) return;
    const measure = () => {
      const available = row.clientWidth - 80 - 40 - 24;
      setTitleBeside(probe.scrollWidth <= available);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [open, clinicName]);

  if (!open) return null;

  const title = (
    <h2 id="public-card-title" className="text-2xl leading-none font-bold">
      {clinicName}
    </h2>
  );

  return (
    <div
      className="fixed inset-0 z-30 flex bg-ink/40 md:items-center md:justify-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-card-title"
        className="thread-scroll flex h-dvh w-full flex-col gap-4 overflow-y-auto bg-paper p-5 md:h-auto md:max-h-[min(44rem,calc(100dvh-3rem))] md:max-w-3xl md:rounded-3xl md:border md:border-line md:p-8"
      >
        <div ref={headingRow} className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-end gap-3">
            <BotGlyph color="teal" emoji={emoji} animate plain className="h-20 w-20 shrink-0" />
            {titleBeside ? title : null}
          </div>
          <button
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none"
          >
            ×
          </button>
        </div>
        <span
          ref={headingProbe}
          aria-hidden
          className="pointer-events-none absolute text-2xl font-bold whitespace-nowrap opacity-0"
        >
          {clinicName}
        </span>
        {titleBeside ? null : title}
        {card.description ? <CardDescription text={card.description} /> : null}
        {card.phones.length > 0 ? (
          <div className="flex flex-col items-start gap-2">
            {card.phones.map((phone) => (
              <a
                key={phone}
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-line px-4 py-2 text-sm transition-colors hover:bg-line"
              >
                <Phone className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
                {phone}
              </a>
            ))}
          </div>
        ) : null}
        {card.address ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit max-w-full items-start gap-2 rounded-2xl border border-line px-4 py-2 text-left text-sm leading-6 transition-colors hover:bg-line"
          >
            <MapPin className="mt-1 h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
            {card.address}
          </a>
        ) : null}
        {card.images.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {card.images.map((path) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={path}
                src={publicPageImageUrl(path)}
                alt=""
                className="aspect-[4/3] w-full rounded-2xl object-cover"
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
