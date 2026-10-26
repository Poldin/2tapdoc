"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";

export type AgendaLane = {
  id: string;
  kind: "specialist" | "asset";
  name: string;
};

const hourHeight = 56;
const minColumnWidth = 176;
const timeGutter = 56;
const hours = Array.from({ length: 25 }, (_, hour) => hour);
const weekdayLabels = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addDays(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function dayStamp(value: Date) {
  return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`;
}

function dayTitle(value: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function monthTitle(value: Date) {
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(value);
}

function monthCells(cursor: Date) {
  const first = startOfMonth(cursor);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function hiddenKey(clinicId: string) {
  return `agenda-equipe-hidden:${clinicId}`;
}

function readHidden(clinicId: string) {
  try {
    const raw = localStorage.getItem(hiddenKey(clinicId));
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeHidden(clinicId: string, ids: string[]) {
  localStorage.setItem(hiddenKey(clinicId), JSON.stringify(ids));
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function useDismiss(open: boolean, rootRef: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, rootRef, onClose]);
}

function ToolbarButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label?: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-line px-3 text-sm ${
        pressed ? "bg-line" : "bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

function MonthPicker({
  month,
  selected,
  today,
  onMonth,
  onPick,
}: {
  month: Date;
  selected: Date;
  today: Date;
  onMonth: (value: Date) => void;
  onPick: (value: Date) => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Scegli il giorno"
      className="absolute top-12 left-0 z-30 w-72 rounded-2xl border border-line bg-paper p-3 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mese precedente"
          onClick={() => onMonth(addMonths(month, -1))}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-background"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <p className="text-sm font-medium capitalize">{monthTitle(month)}</p>
        <button
          type="button"
          aria-label="Mese successivo"
          onClick={() => onMonth(addMonths(month, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-background"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekdayLabels.map((label, index) => (
          <span key={`${label}-${index}`} className="py-1 text-[11px] text-muted">
            {label}
          </span>
        ))}
        {monthCells(month).map((cell) => {
          const outside = cell.getMonth() !== month.getMonth();
          const isSelected = sameDay(cell, selected);
          const isToday = sameDay(cell, today);
          return (
            <button
              key={dayStamp(cell)}
              type="button"
              onClick={() => onPick(cell)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                isSelected
                  ? "bg-ink text-paper"
                  : isToday
                    ? "text-teal"
                    : outside
                      ? "text-date"
                      : ""
              } ${isSelected ? "" : "hover:bg-background"}`}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EquipeGroup({
  title,
  lanes,
  hidden,
  onToggle,
  empty,
}: {
  title: string;
  lanes: AgendaLane[];
  hidden: string[];
  onToggle: (id: string) => void;
  empty: string;
}) {
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-[0.06em] text-muted">{title}</p>
      {lanes.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted">{empty}</p>
      ) : (
        lanes.map((lane) => {
          const checked = !hidden.includes(lane.id);
          return (
            <label
              key={lane.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-background"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(lane.id)}
                className="h-4 w-4 accent-teal"
              />
              <span className="min-w-0 truncate">{lane.name}</span>
            </label>
          );
        })
      )}
    </div>
  );
}

function EquipePicker({
  lanes,
  hidden,
  onToggle,
}: {
  lanes: AgendaLane[];
  hidden: string[];
  onToggle: (id: string) => void;
}) {
  const specialists = lanes.filter((lane) => lane.kind === "specialist");
  const assets = lanes.filter((lane) => lane.kind === "asset");
  return (
    <div
      role="dialog"
      aria-label="Equipe"
      className="absolute top-12 right-0 z-30 flex w-72 max-h-80 flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-sm"
    >
      <p className="px-4 pt-3 pb-1 text-sm font-medium">Equipe</p>
      <div className="min-h-0 flex-1 overflow-y-auto p-1 pb-2">
        <EquipeGroup
          title="Specialisti"
          lanes={specialists}
          hidden={hidden}
          onToggle={onToggle}
          empty="Nessuno specialista."
        />
        <EquipeGroup
          title="Stanze e oggetti"
          lanes={assets}
          hidden={hidden}
          onToggle={onToggle}
          empty="Nessuna stanza o oggetto."
        />
      </div>
    </div>
  );
}

export function AgendaView({ clinicId, lanes }: { clinicId: string; lanes: AgendaLane[] }) {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [panel, setPanel] = useState<"month" | "equipe" | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const monthRef = useRef<HTMLDivElement>(null);
  const equipeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const today = startOfDay(new Date());
  const isToday = sameDay(day, today);
  const now = useNow(isToday);
  const visible = lanes.filter((lane) => !hidden.includes(lane.id));
  const columns = visible.length > 0 ? visible : [];
  const gridMinWidth = timeGutter + Math.max(columns.length, 1) * minColumnWidth;
  const nowTop =
    ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * (24 * hourHeight);

  useEffect(() => {
    setHidden(readHidden(clinicId));
  }, [clinicId]);

  useDismiss(panel === "month", monthRef, () => setPanel(null));
  useDismiss(panel === "equipe", equipeRef, () => setPanel(null));

  useEffect(() => {
    if (!isToday) return;
    const key = dayStamp(day);
    if (scrolledFor.current === key) return;
    const node = scrollRef.current;
    if (!node) return;
    scrolledFor.current = key;
    node.scrollTop = Math.max(0, nowTop - node.clientHeight / 3);
  }, [day, isToday, nowTop]);

  const title = useMemo(() => dayTitle(day), [day]);

  function goTo(value: Date) {
    const next = startOfDay(value);
    setDay(next);
    setMonth(startOfMonth(next));
  }

  function toggleLane(id: string) {
    setHidden((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeHidden(clinicId, next);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-2 pl-14 md:pl-3">
        <ToolbarButton label="Oggi" onClick={() => goTo(new Date())}>
          Oggi
        </ToolbarButton>
        <ToolbarButton label="Giorno precedente" onClick={() => goTo(addDays(day, -1))}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Giorno successivo" onClick={() => goTo(addDays(day, 1))}>
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <p className="min-w-0 truncate px-1 text-sm font-medium capitalize">{title}</p>
        <div ref={monthRef} className="relative">
          <ToolbarButton
            label="Apri il mese"
            pressed={panel === "month"}
            onClick={() => {
              setMonth(startOfMonth(day));
              setPanel((open) => (open === "month" ? null : "month"));
            }}
          >
            <CalendarDays className="h-4 w-4" strokeWidth={2} />
          </ToolbarButton>
          {panel === "month" ? (
            <MonthPicker
              month={month}
              selected={day}
              today={today}
              onMonth={setMonth}
              onPick={(value) => {
                goTo(value);
                setPanel(null);
              }}
            />
          ) : null}
        </div>
        <div ref={equipeRef} className="relative ml-auto">
          <ToolbarButton
            label={`Equipe ${visible.length}/${lanes.length}`}
            pressed={panel === "equipe"}
            onClick={() => setPanel((open) => (open === "equipe" ? null : "equipe"))}
          >
            <Users className="h-4 w-4" strokeWidth={2} />
            Equipe {visible.length}/{lanes.length}
          </ToolbarButton>
          {panel === "equipe" ? (
            <EquipePicker lanes={lanes} hidden={hidden} onToggle={toggleLane} />
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="thread-scroll min-h-0 flex-1 overflow-auto">
        <div className="relative min-h-full" style={{ minWidth: `${gridMinWidth}px` }}>
          <div className="sticky top-0 z-20 flex border-b border-line bg-background">
            <div className="sticky left-0 z-30 w-14 shrink-0 bg-background" />
            {columns.length > 0 ? (
              columns.map((lane) => (
                <div
                  key={lane.id}
                  className="min-w-[11rem] flex-1 truncate px-3 py-2 text-sm font-medium"
                >
                  {lane.name}
                </div>
              ))
            ) : (
              <div className="min-w-[11rem] flex-1 px-3 py-2 text-sm text-muted">
                {lanes.length === 0
                  ? "Nessuna colonna. Aggiungi specialisti o stanze."
                  : "Scegli cosa vedere da Equipe."}
              </div>
            )}
          </div>

          <div className="relative flex" style={{ height: 24 * hourHeight }}>
            <div className="sticky left-0 z-10 w-14 shrink-0 bg-background">
              {hours.map((hour) => {
                const label = `${String(hour).padStart(2, "0")}:00`;
                if (hour === 0) {
                  return (
                    <time key={hour} className="absolute top-1 right-2 text-[11px] text-muted">
                      {label}
                    </time>
                  );
                }
                if (hour === 24) {
                  return (
                    <time key={hour} className="absolute right-2 bottom-1 text-[11px] text-muted">
                      {label}
                    </time>
                  );
                }
                return (
                  <time
                    key={hour}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-muted"
                    style={{ top: hour * hourHeight }}
                  >
                    {label}
                  </time>
                );
              })}
            </div>

            <div className="relative min-w-0 flex-1 bg-paper">
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={`h-${hour}`}>
                  <div
                    className="absolute right-0 left-0 border-t border-line"
                    style={{ top: hour * hourHeight }}
                  />
                  <div
                    className="absolute right-0 left-0 border-t border-line/50"
                    style={{ top: hour * hourHeight + hourHeight / 2 }}
                  />
                </div>
              ))}
              <div className="absolute right-0 bottom-0 left-0 border-t border-line" />
              <div className="absolute inset-0 flex">
                {(columns.length > 0 ? columns : [{ id: "empty", kind: "specialist" as const, name: "" }]).map((lane) => (
                  <div key={lane.id} className="min-w-[11rem] flex-1 border-l border-line" />
                ))}
              </div>
              {isToday ? (
                <div
                  className="pointer-events-none absolute right-0 left-0 z-10"
                  style={{ top: nowTop }}
                >
                  <div className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-teal" />
                  <div className="h-px bg-teal" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
