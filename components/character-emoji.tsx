"use client";

import { Emoji } from "animated-fluent-emojis/react";

export function CharacterEmoji({
  id,
  size = 96,
  skinTone,
}: {
  id: string;
  size?: number;
  skinTone?: "light" | "medium-light" | "medium" | "medium-dark" | "dark";
}) {
  return (
    <span className="character-emoji inline-flex shrink-0" style={{ width: size, height: size }}>
      <Emoji id={id} size={size} skinTone={skinTone} alt="" autoPlay animationIterations="infinite" />
    </span>
  );
}
