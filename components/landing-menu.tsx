"use client";

import { useRef, type ReactNode } from "react";

export function LandingMenu({ children }: { children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  return (
    <details ref={detailsRef} className="relative lg:hidden">
      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-line bg-white [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Apri il menu</span>
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" fill="none">
          <path d="M1 1h14M1 6h14M1 11h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </summary>
      <div
        className="absolute right-0 z-40 mt-2 w-[min(18rem,calc(100vw-2.5rem))] rounded-3xl border border-line bg-white p-3 shadow-[0_24px_60px_-28px_rgba(60,40,20,0.45)]"
        onClick={() => detailsRef.current?.removeAttribute("open")}
      >
        {children}
      </div>
    </details>
  );
}
