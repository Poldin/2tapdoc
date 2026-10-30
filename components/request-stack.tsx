"use client";

import { useEffect, useRef, useState } from "react";

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

/** Explicit geometry — wrapper height never depends on content or enter/exit. */
const ROW_PX = 72;
const GAP_PX = 4;
const STACK_PX = requests.length * ROW_PX + (requests.length - 1) * GAP_PX;
const SLOT_STRIDE = ROW_PX + GAP_PX;

export function RequestStack() {
  const [order, setOrder] = useState(() => requests.map((_, index) => index));
  const [phase, setPhase] = useState<"spin" | "done" | "leaving">("spin");
  const [reduced, setReduced] = useState(false);
  const [skipTransformId, setSkipTransformId] = useState<number | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

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
      const leavingId = orderRef.current[0] ?? null;
      setSkipTransformId(leavingId);
      setOrder((current) => [...current.slice(1), current[0]]);
      setPhase("spin");
    }, 700);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  useEffect(() => {
    if (skipTransformId == null) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setSkipTransformId(null));
    });
    return () => window.cancelAnimationFrame(id);
  }, [skipTransformId, order]);

  return (
    <div
      data-request-stack
      className="relative mt-12 h-[604px] max-h-[604px] min-h-[604px] overflow-hidden sm:h-[604px]"
      style={{ height: STACK_PX, minHeight: STACK_PX, maxHeight: STACK_PX }}
      aria-live="polite"
    >
      {order.map((id, index) => {
        const leaving = !reduced && phase === "leaving" && index === 0;
        const baseOpacity = 1 - index * 0.1;
        const y = index * SLOT_STRIDE + (leaving ? 12 : 0);
        const skip = skipTransformId === id;
        return (
          <div
            key={id}
            data-request={id}
            data-slot={index}
            className="absolute left-0 right-0 flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-white px-4 text-[15px] leading-6 will-change-transform motion-reduce:transition-none"
            style={{
              top: 0,
              height: ROW_PX,
              width: "100%",
              opacity: leaving ? 0 : baseOpacity,
              transform: `translate3d(0, ${y}px, 0)`,
              transition: reduced
                ? undefined
                : skip
                  ? "opacity 700ms cubic-bezier(0.22, 1, 0.36, 1)"
                  : "transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms cubic-bezier(0.22, 1, 0.36, 1)",
              zIndex: leaving ? 0 : requests.length - index,
              pointerEvents: "none",
            }}
          >
            <span className="min-w-0 flex-1 line-clamp-2">{requests[id]}</span>
            {index === 0 && !reduced ? (phase === "spin" ? <Spinner /> : <Check />) : null}
          </div>
        );
      })}
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
