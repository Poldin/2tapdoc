"use client";

import { Children, useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  attachPublicPageImage,
  detachPublicPageImage,
  dropIntegration,
  readPublicPageDesk,
  renamePublicPage,
  setPublicPageCard,
  setPublicPageFace,
  type FormState,
} from "@/app/clinics/actions";
import { BotGlyph } from "@/components/mark";
import { formatTokenCount } from "@/lib/agent-steps";
import { botFaces } from "@/lib/marks";
import { publicPageImageUrl } from "@/lib/public-page-card";
import type { PublicPageDesk as PublicPageDeskData } from "@/lib/public-page-desk";
import { createClient } from "@/lib/supabase/client";

type Tab = "setup" | "data";

const when = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function fieldClassName() {
  return "h-12 min-w-0 flex-1 rounded-xl border border-line bg-background px-3 text-sm outline-none focus:border-teal";
}

function amount(value: number, one: string, many: string) {
  return value === 1 ? `1 ${one}` : `${value} ${many}`;
}

export function PublicPageDesk({
  clinicId,
  integrationId,
  canManage,
}: {
  clinicId: string;
  integrationId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("setup");
  const [desk, setDesk] = useState<PublicPageDeskData | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [facePending, setFacePending] = useState(false);
  const [faceError, setFaceError] = useState<string>();
  const [description, setDescription] = useState("");
  const [phones, setPhones] = useState<string[]>([""]);
  const [address, setAddress] = useState("");
  const [cardPending, setCardPending] = useState(false);
  const [imagePending, setImagePending] = useState(false);
  const [cardError, setCardError] = useState<string>();
  const [renameState, rename, renamePending] = useActionState<FormState, FormData>(
    renamePublicPage.bind(null, clinicId),
    {},
  );
  const [removeState, remove, removePending] = useActionState<FormState, FormData>(
    dropIntegration.bind(null, clinicId, integrationId),
    {},
  );

  useEffect(() => {
    let cancelled = false;
    void readPublicPageDesk(clinicId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setDesk(null);
        setLoadError(result.error);
        return;
      }
      setLoadError(undefined);
      setDesk(result.desk);
    });
    return () => {
      cancelled = true;
    };
  }, [clinicId, renameState.sent]);

  useEffect(() => {
    if (!removeState.sent) return;
    router.push(`/clinics/${clinicId}?view=settings`);
    router.refresh();
  }, [removeState.sent, clinicId, router]);

  const cardStamp = desk
    ? JSON.stringify({ description: desk.description, phones: desk.phones, address: desk.address })
    : "";

  useEffect(() => {
    if (!cardStamp) return;
    const next = JSON.parse(cardStamp) as { description: string; phones: string[]; address: string };
    setDescription(next.description);
    setPhones(next.phones.length ? next.phones : [""]);
    setAddress(next.address);
  }, [cardStamp]);

  const slug = renameState.integrationAccount || desk?.slug || "";
  const path = slug ? `/p/${slug}` : "";
  const emoji = desk?.emoji || "smile";

  async function chooseFace(next: string) {
    if (!canManage || facePending || next === emoji) return;
    setFacePending(true);
    const result = await setPublicPageFace(clinicId, next);
    setFacePending(false);
    if (result.error) {
      setFaceError(result.error);
      return;
    }
    setFaceError(undefined);
    setDesk((current) => (current ? { ...current, emoji: next } : current));
    router.refresh();
  }

  async function saveCard() {
    if (!canManage || cardPending) return;
    setCardPending(true);
    const result = await setPublicPageCard(clinicId, { description, phones, address });
    setCardPending(false);
    if (result.error) {
      setCardError(result.error);
      return;
    }
    const nextPhones = phones.map((phone) => phone.trim()).filter(Boolean);
    setCardError(undefined);
    setDesk((current) =>
      current
        ? { ...current, description: description.trim(), phones: nextPhones, address: address.trim() }
        : current,
    );
    router.refresh();
  }

  async function addPhotos(list: FileList | null) {
    if (!desk || !canManage || imagePending || !list?.length) return;
    const room = 8 - desk.images.length;
    const files = [...list].slice(0, room);
    if (!files.length) {
      setCardError("Puoi aggiungere fino a 8 foto.");
      return;
    }
    setImagePending(true);
    setCardError(undefined);
    const supabase = createClient();
    const added: string[] = [];
    for (const file of files) {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/jpeg" ? "jpg" : "";
      if (!ext || file.size > 4 * 1024 * 1024) {
        setCardError("Usa foto JPG, PNG o WebP entro 4 MB.");
        continue;
      }
      const path = `${clinicId}/${crypto.randomUUID()}.${ext}`;
      const uploaded = await supabase.storage.from("public-page").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploaded.error) {
        setCardError("Non è stato possibile caricare la foto.");
        continue;
      }
      const result = await attachPublicPageImage(clinicId, path);
      if (result.error) {
        await supabase.storage.from("public-page").remove([path]);
        setCardError(result.error);
        continue;
      }
      added.push(path);
    }
    if (added.length) {
      setDesk((current) =>
        current ? { ...current, images: [...current.images, ...added].slice(0, 8) } : current,
      );
      router.refresh();
    }
    setImagePending(false);
  }

  async function removePhoto(path: string) {
    if (!canManage || imagePending) return;
    setImagePending(true);
    const result = await detachPublicPageImage(clinicId, path);
    setImagePending(false);
    if (result.error) {
      setCardError(result.error);
      return;
    }
    setCardError(undefined);
    setDesk((current) =>
      current ? { ...current, images: current.images.filter((item) => item !== path) } : current,
    );
    router.refresh();
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div className="pointer-events-none absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center">
        <div
          role="tablist"
          aria-label="Pagina pubblica"
          className="pointer-events-auto flex rounded-full border border-line bg-paper p-1 text-sm font-medium"
        >
          {(
            [
              ["setup", "Impostazioni"],
              ["data", "Dati"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1 ${tab === id ? "bg-ink text-paper" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-16 pb-10 md:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {loadError ? <p className="text-sm text-teal">{loadError}</p> : null}
          {!desk && !loadError ? <p className="text-sm text-muted">Caricamento…</p> : null}
          {desk && tab === "setup" ? (
            <>
              <form action={rename} className="flex flex-col gap-4 rounded-2xl bg-paper px-4 py-4">
                <div>
                  <p className="text-xs font-medium tracking-[0.06em] text-muted">Indirizzo</p>
                  <p className="mt-1 text-sm text-muted">
                    Chi ha il link parla con l&apos;assistente dello studio.
                  </p>
                </div>
                {canManage ? (
                  <label className="flex flex-col gap-2">
                    <span className="sr-only">Indirizzo della pagina</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-muted">/p/</span>
                      <input
                        name="slug"
                        required
                        maxLength={80}
                        defaultValue={slug}
                        key={slug}
                        spellCheck={false}
                        autoCapitalize="none"
                        className={fieldClassName()}
                      />
                    </span>
                  </label>
                ) : (
                  <p className="text-sm">{path || "La pagina si sta aprendo."}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {canManage ? (
                    <button
                      type="submit"
                      disabled={renamePending || !slug}
                      className="h-10 rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
                    >
                      {renamePending ? "Salvataggio…" : "Salva indirizzo"}
                    </button>
                  ) : null}
                  {path ? (
                    <>
                      <a
                        href={path}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm"
                      >
                        Apri
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(`${window.location.origin}${path}`);
                            setCopied(true);
                          } catch {
                            setCopied(false);
                          }
                        }}
                        className="h-10 rounded-full border border-line px-4 text-sm"
                      >
                        {copied ? "Copiato" : "Copia link"}
                      </button>
                    </>
                  ) : null}
                </div>
                {renameState.error ? <p className="text-sm text-teal">{renameState.error}</p> : null}
              </form>

              <section className="rounded-2xl bg-paper px-4 py-4">
                <p className="text-xs font-medium tracking-[0.06em] text-muted">Volto</p>
                <p className="mt-1 text-sm text-muted">Il visitatore lo vede animato, come i bot dello studio.</p>
                <BotGlyph color="teal" emoji={emoji} animate plain className="mt-3 h-12 w-12" />
                {canManage ? (
                  <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Volto dell'assistente">
                    {botFaces.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={item.label}
                        aria-pressed={emoji === item.id}
                        disabled={facePending}
                        onClick={() => void chooseFace(item.id)}
                        className={`rounded-[22%] [contain-intrinsic-size:1.75rem] [content-visibility:auto] disabled:opacity-50 ${
                          emoji === item.id ? "ring-2 ring-ink ring-offset-1" : ""
                        }`}
                      >
                        <BotGlyph color="teal" emoji={item.id} plain className="h-7 w-7" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {faceError ? <p className="mt-2 text-sm text-teal">{faceError}</p> : null}
              </section>

              {desk.bot ? (
                <section className="rounded-2xl bg-paper px-4 py-4">
                  <p className="text-xs font-medium tracking-[0.06em] text-muted">Riferimento</p>
                  <p className="mt-1 text-sm text-muted">
                    Informazioni, scambi e criticità della pagina arrivano a questo bot.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <BotGlyph color={desk.bot.color} emoji={desk.bot.emoji} plain className="h-9 w-9" />
                    <p className="text-sm font-medium">{desk.bot.name}</p>
                  </div>
                </section>
              ) : null}

              <CardFields
                canManage={canManage}
                description={description}
                phones={phones}
                address={address}
                images={desk.images}
                cardPending={cardPending}
                imagePending={imagePending}
                error={cardError}
                onDescription={setDescription}
                onPhones={setPhones}
                onAddress={setAddress}
                onSave={() => void saveCard()}
                onAddPhotos={(files) => void addPhotos(files)}
                onRemovePhoto={(path) => void removePhoto(path)}
              />

              <section className="rounded-2xl bg-paper px-4 py-4">
                <p className="text-xs font-medium tracking-[0.06em] text-muted">Cosa conosce</p>
                <p className="mt-1 text-sm text-muted">
                  Risponde solo con gli specialisti attivi e le stanze di questo studio. Orari, prezzi e disponibilità non li inventa.
                </p>
                <Knowledge title="Specialisti" empty="Nessuno specialista attivo.">
                  {(desk?.specialists ?? []).map((doctor) => (
                    <li key={doctor.name}>
                      {doctor.name}
                      {doctor.specialization ? <span className="text-muted"> — {doctor.specialization}</span> : null}
                    </li>
                  ))}
                </Knowledge>
                <Knowledge title="Stanze e oggetti" empty="Nessuna stanza o oggetto.">
                  {(desk?.places ?? []).map((place) => (
                    <li key={`${place.kind}-${place.name}`}>
                      {place.name}
                      <span className="text-muted"> — {place.kind === "room" ? "stanza" : "oggetto"}</span>
                    </li>
                  ))}
                </Knowledge>
              </section>

              {canManage ? (
                <form action={remove} className="rounded-2xl bg-paper px-4 py-4">
                  <p className="text-sm text-muted">Rimuovere la pagina chiude il link.</p>
                  {removeState.error ? <p className="mt-2 text-sm text-teal">{removeState.error}</p> : null}
                  <button
                    type="submit"
                    disabled={removePending}
                    className="mt-4 h-10 rounded-full border border-line px-4 text-sm disabled:opacity-50"
                  >
                    {removePending ? "Rimozione…" : "Rimuovi pagina"}
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            desk && tab === "data" ? <DataTab desk={desk} /> : null
          )}
        </div>
      </div>
    </div>
  );
}

function CardFields({
  canManage,
  description,
  phones,
  address,
  images,
  cardPending,
  imagePending,
  error,
  onDescription,
  onPhones,
  onAddress,
  onSave,
  onAddPhotos,
  onRemovePhoto,
}: {
  canManage: boolean;
  description: string;
  phones: string[];
  address: string;
  images: string[];
  cardPending: boolean;
  imagePending: boolean;
  error?: string;
  onDescription: (value: string) => void;
  onPhones: (value: string[]) => void;
  onAddress: (value: string) => void;
  onSave: () => void;
  onAddPhotos: (files: FileList | null) => void;
  onRemovePhoto: (path: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-paper px-4 py-4">
      <div>
        <p className="text-xs font-medium tracking-[0.06em] text-muted">Scheda</p>
        <p className="mt-1 text-sm text-muted">Si apre quando il visitatore tocca il nome dello studio.</p>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        Descrizione
        {canManage ? (
          <textarea
            value={description}
            maxLength={600}
            rows={3}
            onChange={(event) => onDescription(event.target.value)}
            className={`${fieldClassName()} h-auto py-3`}
          />
        ) : (
          <p>{description || "Nessuna descrizione."}</p>
        )}
      </label>
      <div className="flex flex-col gap-2 text-sm">
        <span>Telefoni</span>
        {canManage ? (
          phones.map((phone, index) => (
            <span key={index} className="flex items-center gap-2">
              <input
                value={phone}
                maxLength={40}
                inputMode="tel"
                aria-label={`Telefono ${index + 1}`}
                onChange={(event) =>
                  onPhones(phones.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                }
                className={fieldClassName()}
              />
              {phones.length > 1 ? (
                <button
                  type="button"
                  aria-label="Togli numero"
                  onClick={() => onPhones(phones.filter((_, itemIndex) => itemIndex !== index))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))
        ) : (
          <p>{phones.filter(Boolean).join(", ") || "Nessun telefono."}</p>
        )}
        {canManage && phones.length < 8 ? (
          <button
            type="button"
            onClick={() => onPhones([...phones, ""])}
            className="self-start text-sm text-muted"
          >
            Aggiungi numero
          </button>
        ) : null}
      </div>
      <label className="flex flex-col gap-2 text-sm">
        Indirizzo
        {canManage ? (
          <input
            value={address}
            maxLength={200}
            onChange={(event) => onAddress(event.target.value)}
            className={fieldClassName()}
          />
        ) : (
          <p>{address || "Nessun indirizzo."}</p>
        )}
      </label>
      <div className="flex flex-col gap-2 text-sm">
        <span>Foto</span>
        {images.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {images.map((path) => (
              <div key={path} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={publicPageImageUrl(path)} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />
                {canManage ? (
                  <button
                    type="button"
                    aria-label="Togli foto"
                    disabled={imagePending}
                    onClick={() => onRemovePhoto(path)}
                    className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-paper text-sm leading-none disabled:opacity-50"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">Nessuna foto.</p>
        )}
        {canManage && images.length < 8 ? (
          <label className="self-start">
            <span className="inline-flex h-10 cursor-pointer items-center rounded-full border border-line px-4 text-sm">
              {imagePending ? "Caricamento…" : "Aggiungi foto"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={imagePending}
              className="sr-only"
              onChange={(event) => {
                onAddPhotos(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
      {canManage ? (
        <button
          type="button"
          disabled={cardPending}
          onClick={onSave}
          className="h-10 self-start rounded-full bg-ink px-4 text-sm text-paper disabled:opacity-50"
        >
          {cardPending ? "Salvataggio…" : "Salva scheda"}
        </button>
      ) : null}
      {error ? <p className="text-sm text-teal">{error}</p> : null}
    </section>
  );
}

function Knowledge({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const filled = Children.count(children) > 0;
  return (
    <div className="mt-4">
      <p className="text-sm font-medium">{title}</p>
      {filled ? <ul className="mt-1 flex flex-col gap-1 text-sm">{children}</ul> : <p className="mt-1 text-sm text-muted">{empty}</p>}
    </div>
  );
}

function DataTab({ desk }: { desk: PublicPageDeskData | null }) {
  const sessions = desk?.sessions ?? [];
  const visitors = sessions.reduce((sum, session) => sum + session.visitorMessages, 0);
  const replies = sessions.reduce((sum, session) => sum + session.replies, 0);
  const tokens = (desk?.tokens.input ?? 0) + (desk?.tokens.output ?? 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Conversazioni" value={String(sessions.length)} />
        <Stat label="Messaggi" value={String(visitors)} />
        <Stat label="Risposte" value={String(replies)} />
      </div>
      <section className="rounded-2xl bg-paper px-4 py-4">
        <p className="text-xs font-medium tracking-[0.06em] text-muted">Token</p>
        <p className="mt-1 text-sm">{tokens > 0 ? `${formatTokenCount(tokens)} usati da questa pagina.` : "Nessun token usato."}</p>
      </section>
      <section className="overflow-hidden rounded-2xl bg-paper">
        {sessions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">Nessuna conversazione ancora.</p>
        ) : (
          <ul>
            {sessions.map((session) => {
              const stamp = Date.parse(session.lastAt);
              return (
                <li key={session.id} className="border-t border-line px-4 py-3 first:border-t-0">
                  <p className="text-sm">{session.preview || "Nessun messaggio."}</p>
                  <p className="mt-1 text-xs text-muted">
                    {Number.isNaN(stamp) ? "" : `${when.format(stamp)} · `}
                    {amount(session.visitorMessages, "messaggio", "messaggi")}
                    {" · "}
                    {amount(session.replies, "risposta", "risposte")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-paper px-4 py-4">
      <p className="text-xs font-medium tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}
