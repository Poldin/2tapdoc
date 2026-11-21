import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-20">
      <p className="text-sm text-muted">Pagina dello studio</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">{name}</h1>
      <p className="mt-4 text-sm leading-6 text-muted">
        Questa è la pagina pubblica dello studio. Chi arriva da questo link vede il nome dello studio.
      </p>
    </main>
  );
}
