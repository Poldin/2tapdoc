"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { deleteAgendaEntry, moveAgendaEntry } from "@/app/clinics/actions";
import { AgendaEditDialog, type AgendaEditPatient, type AgendaEditTarget } from "@/components/agenda-edit-dialog";

export type AgendaLane = {
  id: string;
  kind: "specialist" | "asset";
  name: string;
};

export type AgendaAppointment = {
  id: string;
  title: string | null;
  note: string | null;
  startsAt: string;
  endsAt: string;
  doctorIds: string[];
  objectIds: string[];
  patientIds: string[];
  patientNames: string[];
};

export type AgendaBlock = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  doctorIds: string[];
  objectIds: string[];
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

function dayKey(clinicId: string) {
  return `agenda-day:${clinicId}`;
}

function dayToken(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${date}`;
}

function readDay(clinicId: string) {
  try {
    const raw = sessionStorage.getItem(dayKey(clinicId));
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [year, month, date] = raw.split("-").map(Number);
    const value = new Date(year, month - 1, date);
    if (
      value.getFullYear() !== year ||
      value.getMonth() !== month - 1 ||
      value.getDate() !== date
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function writeDay(clinicId: string, value: Date) {
  sessionStorage.setItem(dayKey(clinicId), dayToken(value));
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
  emphasis,
}: {
  label?: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border px-3 text-sm ${
        emphasis
          ? "border-ink bg-ink font-medium text-paper"
          : pressed
            ? "border-line bg-line"
            : "border-line bg-paper"
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

const blockFill = "repeating-linear-gradient(-45deg, #5c564e 0 6px, #675f56 6px 8px)";

function clockRange(startsAt: string, endsAt: string) {
  const format = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${format.format(new Date(startsAt))} – ${format.format(new Date(endsAt))}`;
}

type AgendaShift = {
  kind: "appointment" | "block";
  id: string;
  startsAt: string;
  endsAt: string;
  fromLaneId: string;
  toLaneId: string;
};

type AgendaDrag = {
  kind: "appointment" | "block";
  id: string;
  pointerId: number;
  fromLaneId: string;
  laneId: string;
  originTop: number;
  originY: number;
  originX: number;
  durationMs: number;
  top: number;
  moved: boolean;
};

const slotHeight = hourHeight / 4;

function withShift<T extends { startsAt: string; endsAt: string; doctorIds: string[]; objectIds: string[] }>(
  item: T,
  shift: AgendaShift,
  lanes: AgendaLane[],
): T {
  const from = lanes.find((lane) => lane.id === shift.fromLaneId);
  const to = lanes.find((lane) => lane.id === shift.toLaneId);
  let doctorIds = item.doctorIds;
  let objectIds = item.objectIds;
  if (from && to && from.id !== to.id) {
    if (from.kind === "specialist") doctorIds = doctorIds.filter((id) => id !== from.id);
    else objectIds = objectIds.filter((id) => id !== from.id);
    if (to.kind === "specialist") {
      if (!doctorIds.includes(to.id)) doctorIds = [...doctorIds, to.id];
    } else if (!objectIds.includes(to.id)) objectIds = [...objectIds, to.id];
  }
  return { ...item, startsAt: shift.startsAt, endsAt: shift.endsAt, doctorIds, objectIds };
}

function rangeFromTop(day: Date, top: number, durationMs: number) {
  const minutes = Math.round((top / hourHeight) * 60);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + durationMs).toISOString(),
  };
}

function AgendaCard({
  kind,
  heading,
  subtitle,
  timeRange,
  top,
  height,
  selected,
  movable,
  lifted,
  onOpen,
  onDragStart,
}: {
  kind: "appointment" | "block";
  heading: string;
  subtitle: string | null;
  timeRange: string;
  top: number;
  height: number;
  selected: boolean;
  movable: boolean;
  lifted: boolean;
  onOpen: () => void;
  onDragStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const block = kind === "block";
  return (
    <button
      type="button"
      data-agenda-card=""
      aria-expanded={selected}
      aria-label={
        movable
          ? `${block ? "Blocco" : "Appuntamento"}: ${heading}. Trascina per spostare, clicca per il dettaglio`
          : `${block ? "Blocco" : "Appuntamento"}: ${heading}. Apri il dettaglio`
      }
      onClick={() => onOpen()}
      onPointerDown={(event) => {
        if (!movable || event.button !== 0) return;
        onDragStart(event);
      }}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundImage: block ? blockFill : undefined,
        zIndex: lifted ? 30 : undefined,
      }}
      className={`absolute right-1 left-1 flex flex-col overflow-hidden rounded-md px-2 py-0.5 text-left text-xs leading-tight text-[#fbf8f3] ${
        movable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"
      } ${block ? "bg-[#5c564e]" : "bg-[#3a342e]"} ${lifted ? "shadow-lg" : ""} ${
        selected || lifted ? "ring-2 ring-[#fbf8f3]/70" : ""
      }`}
    >
      <span className="truncate font-medium">{heading}</span>
      <span className="truncate text-[11px] text-[#fbf8f3]/75">
        {timeRange}
        {subtitle ? ` · ${subtitle}` : ""}
      </span>
    </button>
  );
}

export function AgendaView({
  clinicId,
  lanes,
  appointments = [],
  blocks = [],
  patients = [],
  canMove = false,
}: {
  clinicId: string;
  lanes: AgendaLane[];
  appointments?: AgendaAppointment[];
  blocks?: AgendaBlock[];
  patients?: AgendaEditPatient[];
  canMove?: boolean;
}) {
  const router = useRouter();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [panel, setPanel] = useState<"month" | "equipe" | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [edit, setEdit] = useState<AgendaEditTarget | null>(null);
  const [drag, setDrag] = useState<AgendaDrag | null>(null);
  const [moves, setMoves] = useState<AgendaShift[]>([]);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const [removed, setRemoved] = useState<Array<{ kind: "appointment" | "block"; id: string }>>([]);
  const monthRef = useRef<HTMLDivElement>(null);
  const equipeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<AgendaDrag | null>(null);
  const suppressClick = useRef(false);
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
    const saved = readDay(clinicId) ?? startOfDay(new Date());
    setDay(saved);
    setMonth(startOfMonth(saved));
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

  useEffect(() => {
    setMoves([]);
  }, [appointments, blocks]);

  const dayRef = useRef(day);
  dayRef.current = day;

  useEffect(() => {
    function laneFromX(clientX: number) {
      const nodes = gridRef.current?.querySelectorAll<HTMLElement>("[data-agenda-lane]");
      if (!nodes) return null;
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (clientX >= rect.left && clientX < rect.right) return node.dataset.agendaLane ?? null;
      }
      return null;
    }

    function onMove(event: PointerEvent) {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const moved =
        current.moved || Math.hypot(event.clientX - current.originX, event.clientY - current.originY) > 6;
      const raw = current.originTop + (event.clientY - current.originY);
      const height = (current.durationMs / 60_000) * (hourHeight / 60);
      const maxTop = 24 * hourHeight - height;
      const top = moved
        ? Math.min(Math.max(0, Math.round(raw / slotHeight) * slotHeight), Math.max(0, maxTop))
        : current.originTop;
      const laneId = moved ? laneFromX(event.clientX) ?? current.laneId : current.laneId;
      const next = { ...current, moved, top, laneId };
      dragRef.current = next;
      setDrag(next);
    }

    function onUp(event: PointerEvent) {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      dragRef.current = null;
      setDrag(null);
      if (!current.moved) return;
      suppressClick.current = true;
      const { startsAt } = rangeFromTop(dayRef.current, current.top, current.durationMs);
      const origin = rangeFromTop(dayRef.current, current.originTop, current.durationMs);
      if (startsAt === origin.startsAt && current.laneId === current.fromLaneId) return;
      const shift: AgendaShift = {
        kind: current.kind,
        id: current.id,
        ...rangeFromTop(dayRef.current, current.top, current.durationMs),
        fromLaneId: current.fromLaneId,
        toLaneId: current.laneId,
      };
      setMoveError(null);
      setSavingMove(true);
      setMoves((existing) => [...existing.filter((item) => item.id !== shift.id || item.kind !== shift.kind), shift]);
      void moveAgendaEntry({
        clinicId,
        kind: shift.kind,
        id: shift.id,
        startsAt: shift.startsAt,
        fromLaneId: shift.fromLaneId,
        toLaneId: shift.toLaneId,
      }).then((result) => {
        setSavingMove(false);
        if (result.error) {
          setMoves((existing) => existing.filter((item) => item.id !== shift.id || item.kind !== shift.kind));
          setMoveError(result.error);
          return;
        }
        router.refresh();
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clinicId, router]);

  const title = useMemo(() => dayTitle(day), [day]);

  const dragShift: AgendaShift | null =
    drag?.moved === true
      ? {
          kind: drag.kind,
          id: drag.id,
          ...rangeFromTop(day, drag.top, drag.durationMs),
          fromLaneId: drag.fromLaneId,
          toLaneId: drag.laneId,
        }
      : null;

  function placed<T extends { id: string; startsAt: string; endsAt: string; doctorIds: string[]; objectIds: string[] }>(
    kind: AgendaShift["kind"],
    item: T,
  ) {
    const pending = moves.find((shift) => shift.kind === kind && shift.id === item.id);
    const shift = dragShift?.kind === kind && dragShift.id === item.id ? dragShift : pending;
    return shift ? withShift(item, shift, lanes) : item;
  }

  const shownAppointments = appointments
    .filter((item) => !removed.some((entry) => entry.kind === "appointment" && entry.id === item.id))
    .map((item) => placed("appointment", item));
  const shownBlocks = blocks
    .filter((item) => !removed.some((entry) => entry.kind === "block" && entry.id === item.id))
    .map((item) => placed("block", item));

  function removeEntry(kind: "appointment" | "block", id: string) {
    setEdit(null);
    setRemoved((current) => [...current, { kind, id }]);
    setMoveError(null);
    void deleteAgendaEntry({ clinicId, kind, id }).then((result) => {
      if (result.error) {
        setRemoved((current) => current.filter((entry) => entry.kind !== kind || entry.id !== id));
        setMoveError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: AgendaShift["kind"],
    id: string,
    laneId: string,
    startsAt: string,
    endsAt: string,
    top: number,
  ) {
    if (!canMove || savingMove) return;
    const durationMs = Date.parse(endsAt) - Date.parse(startsAt);
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const next: AgendaDrag = {
      kind,
      id,
      pointerId: event.pointerId,
      fromLaneId: laneId,
      laneId,
      originTop: top,
      originY: event.clientY,
      originX: event.clientX,
      durationMs,
      top,
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
    setMoveError(null);
  }

  function goTo(value: Date) {
    const next = startOfDay(value);
    setDay(next);
    setMonth(startOfMonth(next));
    writeDay(clinicId, next);
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
        <ToolbarButton label="Oggi" emphasis={!isToday} onClick={() => goTo(new Date())}>
          Oggi
        </ToolbarButton>
        <ToolbarButton label="Giorno precedente" onClick={() => goTo(addDays(day, -1))}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton label="Giorno successivo" onClick={() => goTo(addDays(day, 1))}>
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </ToolbarButton>
        <p className="min-w-0 truncate px-1 text-sm font-medium capitalize">{title}</p>
        {moveError ? <p className="text-sm text-ink">{moveError}</p> : null}
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
            <Stethoscope className="h-4 w-4" strokeWidth={2} />
            Equipe {visible.length}/{lanes.length}
          </ToolbarButton>
          {panel === "equipe" ? (
            <EquipePicker lanes={lanes} hidden={hidden} onToggle={toggleLane} />
          ) : null}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="thread-scroll min-h-0 flex-1 overflow-auto"
      >
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
              <div ref={gridRef} className="absolute inset-0 flex">
                {(columns.length > 0 ? columns : [{ id: "empty", kind: "specialist" as const, name: "" }]).map((lane) => {
                  const dayStartMs = day.getTime();
                  const dayEndMs = addDays(day, 1).getTime();
                  const onDay = (startsAt: string, endsAt: string) => {
                    const startMs = Date.parse(startsAt);
                    const endMs = Date.parse(endsAt);
                    return startMs < dayEndMs && endMs > dayStartMs;
                  };
                  const assignedToLane = (doctorIds: string[], objectIds: string[]) =>
                    lane.kind === "specialist" ? doctorIds.includes(lane.id) : objectIds.includes(lane.id);
                  const laneAppointments =
                    lane.id === "empty"
                      ? []
                      : shownAppointments.filter(
                          (item) =>
                            assignedToLane(item.doctorIds, item.objectIds) && onDay(item.startsAt, item.endsAt),
                        );
                  const laneBlocks =
                    lane.id === "empty"
                      ? []
                      : shownBlocks.filter(
                          (item) =>
                            assignedToLane(item.doctorIds, item.objectIds) && onDay(item.startsAt, item.endsAt),
                        );

                  function box(startsAt: string, endsAt: string) {
                    const startMs = Math.max(Date.parse(startsAt), dayStartMs);
                    const endMs = Math.min(Date.parse(endsAt), dayEndMs);
                    const startMin = (startMs - dayStartMs) / 60_000;
                    const durationMin = Math.max(15, (endMs - startMs) / 60_000);
                    return {
                      top: (startMin / (24 * 60)) * (24 * hourHeight),
                      height: (durationMin / (24 * 60)) * (24 * hourHeight),
                    };
                  }

                  function openEntry(next: AgendaEditTarget) {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    setEdit(next);
                  }

                  function canDrag(startsAt: string, endsAt: string) {
                    if (!canMove || savingMove || lane.id === "empty") return false;
                    const start = Date.parse(startsAt);
                    const end = Date.parse(endsAt);
                    return start >= dayStartMs && end <= dayEndMs;
                  }

                  return (
                    <div
                      key={lane.id}
                      data-agenda-lane={lane.id === "empty" ? undefined : lane.id}
                      onClick={(event) => {
                        if (!canMove || savingMove || lane.id === "empty") return;
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        const hit = event.target;
                        if (hit instanceof Element && hit.closest("[data-agenda-card]")) return;
                        const minutes = ((event.clientY - event.currentTarget.getBoundingClientRect().top) / hourHeight) * 60;
                        const snapped = Math.min(24 * 60 - 30, Math.max(0, Math.floor(minutes / 30) * 30));
                        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, snapped);
                        setEdit({
                          kind: "appointment",
                          id: null,
                          title: null,
                          body: null,
                          startsAt: start.toISOString(),
                          endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
                          doctorIds: lane.kind === "specialist" ? [lane.id] : [],
                          objectIds: lane.kind === "asset" ? [lane.id] : [],
                          patientIds: [],
                        });
                      }}
                      className={`relative min-w-[11rem] flex-1 border-l border-line ${
                        canMove && lane.id !== "empty" ? "cursor-pointer" : ""
                      }`}
                    >
                      {laneBlocks.map((block) => {
                        const { top, height } = box(block.startsAt, block.endsAt);
                        const key = `${lane.id}-block-${block.id}`;
                        const timeRange = clockRange(block.startsAt, block.endsAt);
                        return (
                          <AgendaCard
                            key={key}
                            kind="block"
                            heading={block.title}
                            subtitle={block.description}
                            timeRange={timeRange}
                            top={top}
                            height={height}
                            selected={edit?.kind === "block" && edit.id === block.id}
                            movable={canDrag(block.startsAt, block.endsAt)}
                            lifted={drag?.moved === true && drag.kind === "block" && drag.id === block.id}
                            onDragStart={(event) =>
                              beginDrag(event, "block", block.id, lane.id, block.startsAt, block.endsAt, top)
                            }
                            onOpen={() =>
                              openEntry({
                                kind: "block",
                                id: block.id,
                                title: block.title,
                                body: block.description,
                                startsAt: block.startsAt,
                                endsAt: block.endsAt,
                                doctorIds: block.doctorIds,
                                objectIds: block.objectIds,
                                patientIds: [],
                              })
                            }
                          />
                        );
                      })}
                      {laneAppointments.map((app) => {
                        const { top, height } = box(app.startsAt, app.endsAt);
                        const key = `${lane.id}-appointment-${app.id}`;
                        const timeRange = clockRange(app.startsAt, app.endsAt);
                        const heading =
                          app.patientNames.length > 0 ? app.patientNames.join(", ") : app.title || "Appuntamento";
                        const subtitle = app.patientNames.length > 0 && app.title ? app.title : app.note;
                        return (
                          <AgendaCard
                            key={key}
                            kind="appointment"
                            heading={heading}
                            subtitle={subtitle}
                            timeRange={timeRange}
                            top={top}
                            height={height}
                            selected={edit?.kind === "appointment" && edit.id === app.id}
                            movable={canDrag(app.startsAt, app.endsAt)}
                            lifted={drag?.moved === true && drag.kind === "appointment" && drag.id === app.id}
                            onDragStart={(event) =>
                              beginDrag(event, "appointment", app.id, lane.id, app.startsAt, app.endsAt, top)
                            }
                            onOpen={() =>
                              openEntry({
                                kind: "appointment",
                                id: app.id,
                                title: app.title,
                                body: app.note,
                                startsAt: app.startsAt,
                                endsAt: app.endsAt,
                                doctorIds: app.doctorIds,
                                objectIds: app.objectIds,
                                patientIds: app.patientIds,
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  );
                })}
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
      <AgendaEditDialog
        target={edit}
        clinicId={clinicId}
        lanes={lanes}
        patients={patients}
        canChange={canMove}
        onClose={() => setEdit(null)}
        onDelete={() => {
          if (!edit?.id) return;
          removeEntry(edit.kind, edit.id);
        }}
        onSaved={() => {
          setEdit(null);
          router.refresh();
        }}
      />
    </div>
  );
}
