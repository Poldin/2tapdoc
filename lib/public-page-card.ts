export type PublicPageCard = {
  description: string;
  phones: string[];
  address: string;
  images: string[];
};

const imagePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

const phonePattern = /^[0-9+(). -]{5,40}$/;

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "").length;
}

export function parsePublicPageCard(row: Record<string, unknown>): PublicPageCard {
  const phones = Array.isArray(row.phones)
    ? row.phones.flatMap((item) => {
        const phone = text(item, 40);
        if (!phonePattern.test(phone) || phoneDigits(phone) < 5) return [];
        return [phone];
      }).slice(0, 8)
    : [];
  const images = Array.isArray(row.images)
    ? row.images.flatMap((item) => {
        const path = typeof item === "string" ? item.trim() : "";
        return imagePattern.test(path) ? [path] : [];
      }).slice(0, 8)
    : [];
  return {
    description: text(row.description, 600),
    phones,
    address: text(row.address, 200),
    images,
  };
}

export function publicPageImageUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/public-page/${path}`;
}
