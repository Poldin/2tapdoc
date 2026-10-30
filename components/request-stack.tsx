"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const requests = [
  "Buongiorno, posso spostare l’appuntamento di giovedì? ho un imprevisto",
  "Salve quanto costa una pulizia?",
  "Mi si è rotto un pezzo di dente, avete posto oggi??",
  "mia figlia ha la febbre, il dottore riceve domani?",
  "Mi serve la fattura della visita di marzo per il 730",
  "avete parcheggio?",
  "buonasera, devo fare la ricetta per il solito farmaco",
  "ciao scusate sono in ritardo di 10 minuti, sto arrivando",
];

/** Fixed row + gap so stack height never shifts when copy wraps differently. */
const ROW_PX = 72;
const GAP_PX = 4;
const STACK_PX = requests.length * ROW_PX + (requests.length - 1) * GAP_PX;

export function RequestStack() {
  const [order, setOrder] = useState(() => requests.map((_, index) => index));
  const [phase, setPhase] = useState<"spin" | "done" | "leaving">("spin");
  const [reduced, setReduced] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const firstRects = useRef<Map<number, DOMRect>>(new Map());

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduced || phase !== "spin") return;
    const wait = 3000 + Math.random() * 2000;
    const timer = window.setTimeout(() => setPhase("done"), wait);
    return () => window.clearTimeout(timer);
  }, [order, phase, reduced]);

  useEffect(() => {
    if (reduced || phase !== "done") return;
    const timer = window.setTimeout(() => setPhase("leaving"), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  useEffect(() => {
    if (reduced || phase !== "leaving") return;
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      if (list) {
        const map = new Map<number, DOMRect>();
        list.querySelectorAll<HTMLElement>("[data-request]").forEach((item) => {
          map.set(Number(item.dataset.request), item.getBoundingClientRect());
        });
        firstRects.current = map;
      }
      setOrder((current) => [...current.slice(1), current[0]]);
      setPhase("spin");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  useLayoutEffect(() => {
    const map = firstRects.current;
    if (map.size === 0 || reduced) return;
    const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-request]") ?? []);
    const moving: HTMLElement[] = [];
    nodes.forEach((item) => {
      const first = map.get(Number(item.dataset.request));
      if (!first) return;
      const delta = first.top - item.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      item.style.transition = "none";
      item.style.transform = `translateY(${delta}px)`;
      item.style.opacity = "";
      moving.push(item);
    });
    firstRects.current = new Map();
    if (moving.length === 0) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        moving.forEach((item) => {
          item.style.transition = "";
          item.style.transform = "";
        });
      });
    });
  }, [order, reduced]);

  return (
    <div className="relative mt-12 overflow-hidden" style={{ height: STACK_PX }} aria-live="polite">
      <ul
        ref={listRef}
        className="absolute inset-x-0 top-0 flex w-full flex-col"
        style={{ gap: GAP_PX }}
      >
        {order.map((id, index) => {
          const leaving = !reduced && phase === "leaving" && index === 0;
          const baseOpacity = 1 - index * 0.1;
          return (
            <li
              key={id}
              data-request={id}
              className="flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-white px-4 text-[15px] leading-6 transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{
                height: ROW_PX,
                opacity: leaving ? 0 : baseOpacity,
                transform: leaving ? "translateY(12px)" : undefined,
              }}
            >
              <span className="min-w-0 flex-1 line-clamp-2">{requests[id]}</span>
              {index === 0 && !reduced ? phase === "spin" ? <Spinner /> : <Check /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#e7ddd4] border-t-violet motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="#16a34a" />
      <path
        d="M4.6 8.2 7 10.6 11.5 5.6"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
