import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PublicChat } from "@/components/public-chat";
import { createClient } from "@/lib/supabase/server";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const instant = false;

async function publicClinicName(slug: string) {
  await connection();
  if (!slugPattern.test(slug) || slug.length > 80) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_public_page", { p_slug: slug });
  if (error || typeof data !== "string") return null;
  const name = data.trim();
  return name || null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await publicClinicName(slug);
  if (!name) return { title: "Pagina non disponibile", robots: { index: false, follow: false } };
  return {
    title: name,
    description: `Pagina pubblica di ${name}.`,
    alternates: { canonical: `/p/${slug}` },
  };
}

export default async function PublicClinicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = await publicClinicName(slug);
  if (!name) notFound();

  return <PublicChat slug={slug} clinicName={name} />;
}
