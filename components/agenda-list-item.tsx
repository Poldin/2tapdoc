"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";

export const agendaListId = "agenda";

export function AgendaListItem({
  clinicId,
  selected,
  onSelect,
  compact = false,
}: {
  clinicId: string;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <li data-chat={agendaListId} className="relative">
      <Link
        href={`/clinics/${clinicId}?view=agenda`}
        aria-current={selected ? "page" : undefined}
        title="Agenda"
        onClick={onSelect}
        className={`relative z-10 flex items-center gap-2 rounded-2xl py-3 pr-3 pl-3 transition-colors duration-200 motion-reduce:transition-none ${
          compact ? "md:justify-center md:px-2 md:py-2" : ""
        } ${selected ? "text-paper" : "hover:bg-line"}`}
      >
        <span className={`flex shrink-0 items-center justify-center ${compact ? "md:h-12 md:w-12" : ""}`}>
          <CalendarDays
            className={`h-[1.125rem] w-[1.125rem] shrink-0 ${selected ? "text-paper/70" : "text-muted"}`}
            strokeWidth={2}
          />
        </span>
        <span className={`min-w-0 truncate font-medium ${compact ? "md:sr-only" : ""}`}>Agenda</span>
      </Link>
    </li>
  );
}
