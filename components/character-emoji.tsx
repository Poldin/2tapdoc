"use client";

import { Emoji } from "animated-fluent-emojis/react";

export function CharacterEmoji({ id, size = 96 }: { id: string; size?: number }) {
  return (
    <span className="character-emoji inline-flex shrink-0" style={{ width: size, height: size }}>
      <Emoji id={id} size={size} alt="" autoPlay animationIterations="infinite" />
    </span>
  );
}
