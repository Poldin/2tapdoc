import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PublicChat } from "@/components/public-chat";
import { botFaceIds, isListed } from "@/lib/marks";
import { parsePublicPageCard } from "@/lib/public-page-card";
import { createClient } from "@/lib/supabase/server";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const instant = false;

async function publicAssistant(slug: string) {
  await connection();
  if (!slugPattern.test(slug) || slug.length > 80) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_public_assistant", { p_slug: slug });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) return null;
  const face = typeof row.emoji === "string" ? row.emoji : "";
  return { name, emoji: isListed(botFaceIds, face) ? face : "smile", ...parsePublicPageCard(row) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const assistant = await publicAssistant(slug);
  if (!assistant) return { title: "Pagina non disponibile", robots: { index: false, follow: false } };
  return {
    title: assistant.name,
    description: assistant.description || `Pagina pubblica di ${assistant.name}.`,
    alternates: { canonical: `/p/${slug}` },
  };
}

export default async function PublicClinicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const assistant = await publicAssistant(slug);
  if (!assistant) notFound();

  return (
    <PublicChat
      slug={slug}
      clinicName={assistant.name}
      emoji={assistant.emoji}
      card={{
        description: assistant.description,
        phones: assistant.phones,
        address: assistant.address,
        images: assistant.images,
      }}
    />
  );
}
