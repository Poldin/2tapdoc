"use client";

import type { RefObject } from "react";
import { Ellipsis } from "lucide-react";
import { ChatMenu } from "@/components/chat-menu";
import { useClinicChrome } from "@/components/clinic-chrome";
import { BotGlyph, ChannelMark } from "@/components/mark";

export function ChatTitle({
  chatId,
  label,
  badgeRef,
  color,
  emoji,
  face,
}: {
  chatId: string;
  label: string;
  badgeRef: RefObject<HTMLDivElement | null>;
  color: string;
  emoji: string;
  face?: { color: string; emoji: string } | null;
}) {
  const chrome = useClinicChrome();
  const menu = chrome?.chatMenuTarget(chatId) ?? null;
  const mark = face ? (
    <BotGlyph color={face.color} emoji={face.emoji} animate plain />
  ) : (
    <ChannelMark color={color} emoji={emoji} animate plain />
  );

  if (!menu) {
    return (
      <div
        ref={badgeRef}
        className="pointer-events-none absolute top-3 left-1/2 z-20 flex w-fit max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-medium"
      >
        {mark}
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <ChatMenu
      rootRef={badgeRef}
      rootClassName="absolute top-3 left-1/2 z-20 w-fit max-w-[calc(100%-6rem)] -translate-x-1/2"
      buttonClassName="flex max-w-full items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-left text-sm font-medium text-ink hover:bg-background"
      menuClassName="top-full right-0 mt-1"
      label={`${label}, apri il menu della chat`}
      selected={false}
      clinicId={menu.clinicId}
      chatId={menu.chatId}
      name={menu.name}
      people={menu.people}
      unread={menu.unread}
      onEdit={menu.onEdit}
      onPeople={menu.onPeople}
      onRemoved={menu.onRemoved}
      onToggleUnread={menu.onToggleUnread}
    >
      {mark}
      <span className="min-w-0 truncate">{label}</span>
      <Ellipsis className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
    </ChatMenu>
  );
}
