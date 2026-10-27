import type { RefObject } from "react";
import { BotGlyph, ChannelMark } from "@/components/mark";

export function ChatTitle({
  label,
  badgeRef,
  bot,
  color,
  emoji,
}: {
  label: string;
  badgeRef: RefObject<HTMLParagraphElement | null>;
  bot: { color: string; emoji: string } | null;
  color: string;
  emoji: string;
}) {
  return (
    <p
      ref={badgeRef}
      className="pointer-events-none absolute top-3 left-1/2 z-20 flex w-fit max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium"
    >
      {bot ? (
        <BotGlyph color={bot.color} emoji={bot.emoji} animate plain />
      ) : (
        <ChannelMark color={color} emoji={emoji} animate plain />
      )}
      <span className="truncate">{label}</span>
    </p>
  );
}
