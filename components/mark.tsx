"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Emoji } from "animated-fluent-emojis/react";
import { markPaint } from "@/lib/marks";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function FluentFace({ emoji, animate }: { emoji: string; animate: boolean }) {
  const reduced = useReducedMotion();
  const frame = useRef<HTMLSpanElement>(null);
  const [px, setPx] = useState(0);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      const next = Math.round(Math.min(element.clientWidth, element.clientHeight));
      setPx((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const play = animate && !reduced;

  return (
    <span ref={frame} className="mark-glyph">
      {px > 0 ? (
        <Emoji
          key={`${emoji}:${px}:${play ? "play" : "still"}`}
          id={emoji}
          alt=""
          size={px}
          autoPlay={false}
          animationIterations="infinite"
          playing={play}
        />
      ) : null}
    </span>
  );
}

export function BotGlyph({
  color,
  emoji,
  animate = false,
  className = "h-4 w-4",
}: {
  color: string;
  emoji: string;
  animate?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-[22%] ${className}`}
      style={{ background: markPaint(color) }}
    >
      <FluentFace emoji={emoji} animate={animate} />
    </span>
  );
}

export function ChannelMark({
  color,
  emoji,
  animate = false,
  className = "h-4 w-4",
}: {
  color: string;
  emoji: string;
  animate?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ background: markPaint(color) }}
    >
      <FluentFace emoji={emoji} animate={animate} />
    </span>
  );
}
