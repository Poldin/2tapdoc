import Link from "next/link";
import type { ReactNode } from "react";
import { LandingMenu } from "@/components/landing-menu";

export const marketingNav = [
  { href: "/#colleghi", label: "Colleghi" },
  { href: "/#segreteria", label: "Segreteria" },
  { href: "/#demo", label: "Demo" },
  { href: "/whatsapp", label: "WhatsApp" },
  { href: "/prezzi", label: "Prezzi" },
];

function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#6D28D9" />
      <path
        fill="#fff"
        d="M8.8 11.1c0-1.27 1.03-2.3 2.3-2.3h8.3c1.27 0 2.3 1.03 2.3 2.3v5.7c0 1.27-1.03 2.3-2.3 2.3h-3.7l-3.5 2.6v-2.6h-1.1c-1.27 0-2.3-1.03-2.3-2.3v-5.7z"
      />
    </svg>
  );
}

function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 text-[1.05rem] font-semibold tracking-[-0.03em] text-ink">
      <Mark />
      Clinico
    </Link>
  );
}

export function MarketingFrame({
  children,
  headerActions,
  menuActions,
  current,
}: {
  children: ReactNode;
  headerActions: ReactNode;
  menuActions: ReactNode;
  current?: "prezzi" | "whatsapp";
}) {
  return (
    <div className="marketing flex flex-1 flex-col bg-sand text-ink">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Vai al contenuto
      </a>
      <header className="sticky top-0 z-30 border-b border-line/80 bg-sand/85 backdrop-blur-md">
        <div className="mx-auto flex h-[4.25rem] max-w-[1120px] items-center justify-between gap-4 px-5 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-muted lg:flex" aria-label="Sezioni">
            {marketingNav.map((item) => {
              const active =
                (current === "prezzi" && item.href === "/prezzi") ||
                (current === "whatsapp" && item.href === "/whatsapp");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`transition-colors hover:text-ink ${active ? "font-medium text-ink" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {headerActions}
            <LandingMenu>
              <nav className="flex flex-col" aria-label="Menu">
                {marketingNav.map((item) => (
                  <Link key={item.href} href={item.href} className="rounded-xl px-3 py-2.5 text-sm hover:bg-sand">
                    {item.label}
                  </Link>
                ))}
              </nav>
              {menuActions}
            </LandingMenu>
          </div>
        </div>
      </header>
      <main id="contenuto" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-10 px-5 py-12 sm:px-8 md:flex-row md:justify-between">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-6 text-muted">
              Ginevra e i colleghi, per lo studio. La segreteria detta le regole.
            </p>
          </div>
          <div className="flex gap-16 text-sm">
            <div className="flex flex-col gap-2">
              <p className="font-medium">Prodotto</p>
              {marketingNav.map((item) => (
                <Link key={item.href} href={item.href} className="text-muted hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-medium">Studio</p>
              <Link href="/login" className="text-muted hover:text-ink">
                Accedi
              </Link>
              <Link href="/register" className="text-muted hover:text-ink">
                Crea un account
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-5 pb-8 text-xs text-muted sm:px-8">
          <p>© 2026 Clinico</p>
          <p>clinico.xyz</p>
        </div>
      </footer>
    </div>
  );
}
