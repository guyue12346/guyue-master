import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { TodoItem, RecurringEvent } from '../types';
import { ChevronLeft, ChevronRight, Clock, Calendar as CalendarIcon, LayoutGrid, Columns3, AlignJustify, Settings2, Repeat2 } from 'lucide-react';

/* ─────────────────── Types ─────────────────── */

type ViewMode = 'day' | 'week' | 'month';

interface ScheduleViewProps {
  todos: TodoItem[];
  onEditTodo: (todo: TodoItem) => void;
  onToggleTodo: (id: string) => void;
  recurringEvents?: RecurringEvent[];
  onEditRecurring?: (re: RecurringEvent) => void;
}

interface CalendarEvent {
  todo?: TodoItem;
  recurring?: RecurringEvent;
  start: Date;
  end: Date;
  isAllDay: boolean;
}

interface LayoutedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
}

/* ─────────────────── Constants ─────────────────── */

const HOUR_HEIGHT = 56;
const COMPRESSED_HOUR_HEIGHT = 12; // 0–6 compressed height per hour
const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const STORAGE_KEY_COMPRESS = 'guyue_schedule_compress_night';
const STORAGE_KEY_TIMELINE = 'guyue_schedule_show_timeline';

/** Event custom-color → Tailwind-style inline colors */
const EVENT_COLOR_MAP: Record<string, { bar: string; block: string; text: string }> = {
  '#3b82f6': { bar: 'bg-blue-100 text-blue-700', block: 'bg-blue-50 border-l-blue-500 text-blue-800', text: 'text-blue-700' },
  '#8b5cf6': { bar: 'bg-violet-100 text-violet-700', block: 'bg-violet-50 border-l-violet-500 text-violet-800', text: 'text-violet-700' },
  '#ec4899': { bar: 'bg-pink-100 text-pink-700', block: 'bg-pink-50 border-l-pink-500 text-pink-800', text: 'text-pink-700' },
  '#ef4444': { bar: 'bg-red-100 text-red-700', block: 'bg-red-50 border-l-red-500 text-red-800', text: 'text-red-700' },
  '#f97316': { bar: 'bg-orange-100 text-orange-700', block: 'bg-orange-50 border-l-orange-500 text-orange-800', text: 'text-orange-700' },
  '#eab308': { bar: 'bg-yellow-100 text-yellow-700', block: 'bg-yellow-50 border-l-yellow-500 text-yellow-800', text: 'text-yellow-700' },
  '#22c55e': { bar: 'bg-green-100 text-green-700', block: 'bg-green-50 border-l-green-500 text-green-800', text: 'text-green-700' },
  '#14b8a6': { bar: 'bg-teal-100 text-teal-700', block: 'bg-teal-50 border-l-teal-500 text-teal-800', text: 'text-teal-700' },
  '#6b7280': { bar: 'bg-gray-200 text-gray-700', block: 'bg-gray-100 border-l-gray-500 text-gray-800', text: 'text-gray-700' },
};

const PRIORITY_COLORS: Record<string, { bar: string; block: string; dot: string }> = {
  high:   { bar: 'bg-rose-100 text-rose-700', block: 'bg-rose-50 border-l-rose-500 text-rose-800', dot: 'bg-rose-500' },
  medium: { bar: 'bg-amber-100 text-amber-700', block: 'bg-amber-50 border-l-amber-500 text-amber-800', dot: 'bg-amber-500' },
  low:    { bar: 'bg-sky-100 text-sky-700', block: 'bg-sky-50 border-l-sky-500 text-sky-800', dot: 'bg-sky-500' },
};
const COMPLETED_COLORS = { bar: 'bg-gray-100 text-gray-400 line-through', block: 'bg-gray-50 border-l-gray-300 text-gray-400 line-through', dot: 'bg-gray-300' };

/* ─────────────────── Helpers ─────────────────── */

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function todoToEvent(todo: TodoItem): CalendarEvent | null {
  if (todo.timeType === 'range' && todo.timeStart) {
    return {
      todo,
      start: new Date(todo.timeStart),
      end: todo.timeEnd ? new Date(todo.timeEnd) : new Date(todo.timeStart + 3600000),
      isAllDay: false,
    };
  }
  if (todo.timeType === 'point' && todo.dueDate) {
    const start = new Date(todo.dueDate);
    return { todo, start, end: new Date(todo.dueDate + 1800000), isAllDay: false };
  }
  if (todo.timeType === 'allday' && todo.dueDate) {
    const start = new Date(todo.dueDate);
    start.setHours(0, 0, 0, 0);
    return { todo, start, end: start, isAllDay: true };
  }
  if (todo.dueDate && !todo.timeType) {
    const start = new Date(todo.dueDate);
    start.setHours(0, 0, 0, 0);
    return { todo, start, end: start, isAllDay: true };
  }
  return null;
}

/** Check if a recurring event occurs on a given date */
function doesRecurOccurOn(event: RecurringEvent, date: Date): boolean {
  const start = new Date(event.startDate);
  start.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  if (day < start) return false;
  if (event.endDate) {
    const end = new Date(event.endDate);
    end.setHours(23, 59, 59, 999);
    if (day > end) return false;
  }
  const diffDays = Math.round((day.getTime() - start.getTime()) / 86400000);
  switch (event.recurrence) {
    case 'daily': return diffDays % event.interval === 0;
    case 'weekly': {
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks % event.interval !== 0) return false;
      if (event.weekDays && event.weekDays.length > 0) return event.weekDays.includes(day.getDay());
      return day.getDay() === start.getDay();
    }
    case 'monthly': {
      const mDiff = (day.getFullYear() - start.getFullYear()) * 12 + (day.getMonth() - start.getMonth());
      if (mDiff < 0 || mDiff % event.interval !== 0) return false;
      return day.getDate() === start.getDate();
    }
    case 'yearly': {
      const yDiff = day.getFullYear() - start.getFullYear();
      if (yDiff < 0 || yDiff % event.interval !== 0) return false;
      return day.getMonth() === start.getMonth() && day.getDate() === start.getDate();
    }
    default: return false;
  }
}

/** Generate CalendarEvents from recurring events for given days */
function recurringToEvents(recurringEvents: RecurringEvent[], days: Date[]): CalendarEvent[] {
  const results: CalendarEvent[] = [];
  for (const re of recurringEvents) {
    if (!re.isActive) continue;
    for (const day of days) {
      if (!doesRecurOccurOn(re, day)) continue;
      if (re.allDay) {
        const d = new Date(day);
        d.setHours(0, 0, 0, 0);
        results.push({ recurring: re, start: d, end: d, isAllDay: true });
      } else {
        const startMin = re.startTime ?? 9 * 60;
        const dur = re.duration ?? 60;
        const start = new Date(day);
        start.setHours(0, 0, 0, 0);
        start.setMinutes(startMin);
        const end = new Date(start.getTime() + dur * 60000);
        results.push({ recurring: re, start, end, isAllDay: false });
      }
    }
  }
  return results;
}

function eventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return events.filter(e => {
    const eStart = e.start.getTime();
    const eEnd = e.end.getTime();
    return eStart <= dayEnd.getTime() && eEnd >= dayStart.getTime();
  });
}

/** Greedy column-packing for overlapping events */
function layoutEvents(dayEvents: CalendarEvent[]): LayoutedEvent[] {
  if (dayEvents.length === 0) return [];
  const timed = dayEvents.filter(e => !e.isAllDay);
  const sorted = [...timed].sort((a, b) => a.start.getTime() - b.start.getTime() || (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime()));

  const columns: number[] = [];
  const result: LayoutedEvent[] = [];

  for (const event of sorted) {
    let col = columns.findIndex(end => end <= event.start.getTime());
    if (col === -1) { col = columns.length; columns.push(0); }
    columns[col] = event.end.getTime();
    result.push({ event, column: col, totalColumns: 0 });
  }
  const totalCols = Math.max(columns.length, 1);
  for (const r of result) r.totalColumns = totalCols;
  return result;
}

function getEventColors(todo: TodoItem): { bar: string; block: string } {
  if (todo.isCompleted) return COMPLETED_COLORS;
  if (todo.color && EVENT_COLOR_MAP[todo.color]) {
    return EVENT_COLOR_MAP[todo.color];
  }
  return PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium;
}

function getCalendarEventColors(ev: CalendarEvent): { bar: string; block: string } {
  if (ev.todo) return getEventColors(ev.todo);
  const color = ev.recurring?.color;
  if (color && EVENT_COLOR_MAP[color]) return EVENT_COLOR_MAP[color];
  return { bar: 'bg-violet-100 text-violet-700', block: 'bg-violet-50 border-l-violet-500 text-violet-800' };
}

/** Convert minutes to pixel position accounting for 0–6 compression */
function minutesToPx(minutes: number, compress: boolean): number {
  if (!compress) return (minutes / 60) * HOUR_HEIGHT;
  // 0-6 = compressed zone (6 hours → 6 × COMPRESSED_HOUR_HEIGHT)
  const compressedZoneEnd = 6 * 60; // 360 min
  const compressedPx = 6 * COMPRESSED_HOUR_HEIGHT;
  if (minutes <= compressedZoneEnd) {
    return (minutes / compressedZoneEnd) * compressedPx;
  }
  return compressedPx + ((minutes - compressedZoneEnd) / 60) * HOUR_HEIGHT;
}

function totalGridHeight(compress: boolean): number {
  if (!compress) return 24 * HOUR_HEIGHT;
  return 6 * COMPRESSED_HOUR_HEIGHT + 18 * HOUR_HEIGHT;
}

/** Find earliest event hour across all visible days to auto-scroll to */
function findSmartScrollTarget(events: CalendarEvent[], days: Date[], compress: boolean): number {
  let earliestMinutes = Infinity;
  for (const day of days) {
    const dayEvts = eventsForDate(events, day).filter(e => !e.isAllDay);
    for (const ev of dayEvts) {
      const m = ev.start.getHours() * 60 + ev.start.getMinutes();
      if (m < earliestMinutes) earliestMinutes = m;
    }
  }
  // If we found events, scroll to 30 min before the earliest, else scroll to ~8am
  if (earliestMinutes < Infinity) {
    const target = Math.max(0, earliestMinutes - 30);
    return minutesToPx(target, compress);
  }
  // Default: scroll to 8am area
  return minutesToPx(8 * 60, compress);
}

/* ─────────────────── Month Grid Builder ─────────────────── */

function buildMonthGrid(year: number, month: number): { date: Date; isCurrentMonth: boolean }[][] {
  const firstDay = new Date(year, month, 1);
  const firstDayIdx = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const startDate = new Date(year, month, 1 - firstDayIdx);

  const grid: { date: Date; isCurrentMonth: boolean }[][] = [];
  const cur = new Date(startDate);
  for (let w = 0; w < 6; w++) {
    const row: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      row.push({ date: new Date(cur), isCurrentMonth: cur.getMonth() === month });
      cur.setDate(cur.getDate() + 1);
    }
    grid.push(row);
    if (w >= 4 && row.every(c => !c.isCurrentMonth)) { grid.pop(); break; }
  }
  return grid;
}

/* ═════════════════════════════════════════════════════════════
   Sub-components
   ═════════════════════════════════════════════════════════════ */

/* ─────────── Event Block (week/day time-grid) ─────────── */
const EventBlock: React.FC<{
  le: LayoutedEvent;
  onClickTodo: (todo: TodoItem) => void;
  onClickRecurring?: (re: RecurringEvent) => void;
  compressNight: boolean;
}> = ({ le, onClickTodo, onClickRecurring, compressNight }) => {
  const { event, column, totalColumns } = le;
  const colors = getCalendarEventColors(event);
  const customColor = event.todo?.color || event.recurring?.color;
  const isCompleted = event.todo?.isCompleted || false;
  const title = event.todo?.content || event.recurring?.title || '';
  const isRecurring = !!event.recurring;

  const startMinutes = event.start.getHours() * 60 + event.start.getMinutes();
  const endMinutes = event.end.getHours() * 60 + event.end.getMinutes();
  const durationMinutes = Math.max(endMinutes - startMinutes, 20);

  const top = minutesToPx(startMinutes, compressNight);
  const height = Math.max(minutesToPx(startMinutes + durationMinutes, compressNight) - top, 22);
  const width = `calc(${(1 / totalColumns) * 100}% - 4px)`;
  const left = `calc(${(column / totalColumns) * 100}% + 2px)`;

  const blockStyle: React.CSSProperties = { top, height, width, left, zIndex: 10 + column };
  let blockClass = `absolute rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer transition-opacity hover:opacity-80 text-left border-l-[3px]`;
  if (isRecurring) blockClass += ' border-dashed';

  if (customColor && !isCompleted) {
    blockStyle.borderLeftColor = customColor;
    blockStyle.backgroundColor = customColor + '15';
    blockStyle.color = customColor;
  } else {
    blockClass += ` ${colors.block}`;
  }

  const handleClick = () => {
    if (event.todo) onClickTodo(event.todo);
    else if (event.recurring) onClickRecurring?.(event.recurring);
  };

  return (
    <button
      onClick={handleClick}
      className={blockClass}
      style={blockStyle}
      title={`${title}\n${formatHM(event.start)} – ${formatHM(event.end)}${isRecurring ? '\n\uD83D\uDD04 重复事件' : ''}`}
    >
      <div className="text-[11px] font-medium truncate leading-tight flex items-center gap-1">
        {isRecurring && <Repeat2 className="w-2.5 h-2.5 shrink-0 opacity-60" />}
        {title}
      </div>
      {height > 30 && (
        <div className="text-[10px] opacity-70 truncate">{formatHM(event.start)} – {formatHM(event.end)}</div>
      )}
    </button>
  );
};

/* ─────────── Month View ─────────── */
const MonthView: React.FC<{
  currentDate: Date;
  events: CalendarEvent[];
  onClickEvent: (todo: TodoItem) => void;
  onClickRecurring?: (re: RecurringEvent) => void;
  onClickDay: (date: Date) => void;
}> = ({ currentDate, events, onClickEvent, onClickRecurring, onClickDay }) => {
  const today = new Date();
  const grid = useMemo(() => buildMonthGrid(currentDate.getFullYear(), currentDate.getMonth()), [currentDate]);

  const MAX_VISIBLE = 2;

  return (
    <div className="select-none">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {WEEK_DAYS.map((d, i) => (
          <div key={i} className={`text-center text-[11px] font-semibold py-2 ${i >= 5 ? 'text-gray-400' : 'text-gray-500'}`}>{d}</div>
        ))}
      </div>

      {/* Grid rows */}
      {grid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-gray-50 last:border-b-0">
          {week.map((cell, di) => {
            const dayEvents = eventsForDate(events, cell.date);
            const isToday = isSameDay(cell.date, today);
            const overflow = dayEvents.length - MAX_VISIBLE;
            const hasEvents = dayEvents.length > 0;
            return (
              <div
                key={di}
                className={`min-h-[80px] border-r border-gray-50 last:border-r-0 p-1 cursor-pointer transition-colors hover:bg-gray-50/50
                  ${!cell.isCurrentMonth ? 'bg-gray-50/30' : ''}
                `}
                onClick={() => onClickDay(cell.date)}
              >
                <div className="flex items-center gap-0.5">
                  <div className={`text-[11px] font-medium w-6 h-6 flex items-center justify-center rounded-full
                    ${isToday ? 'bg-blue-600 text-white' : cell.isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}
                    ${di >= 5 && !isToday ? (cell.isCurrentMonth ? 'text-gray-400' : 'text-gray-300') : ''}
                  `}>
                    {cell.date.getDate()}
                  </div>
                  {/* Event dot indicator */}
                  {hasEvents && !isToday && (
                    <div className="flex gap-[2px]">
                      {dayEvents.slice(0, 3).map((ev, idx) => {
                        const c = ev.todo?.color || ev.recurring?.color;
                        const priority = ev.todo?.priority;
                        return (
                          <div
                            key={idx}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: c || (priority === 'high' ? '#f43f5e' : priority === 'low' ? '#3b82f6' : '#f59e0b') }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {dayEvents.slice(0, MAX_VISIBLE).map(ev => {
                    const colors = getCalendarEventColors(ev);
                    const customColor = (ev.todo?.color || ev.recurring?.color) && !ev.todo?.isCompleted;
                    const eventColor = ev.todo?.color || ev.recurring?.color;
                    const title = ev.todo?.content || ev.recurring?.title || '';
                    const evKey = ev.todo?.id || `${ev.recurring?.id}_${ev.start.toDateString()}`;
                    const isRecurring = !!ev.recurring;
                    return (
                      <button
                        key={evKey}
                        onClick={(e) => { e.stopPropagation(); ev.todo ? onClickEvent(ev.todo) : onClickRecurring?.(ev.recurring!); }}
                        className={`w-full text-left text-[10px] px-1 py-[1px] rounded truncate leading-tight font-medium ${customColor ? '' : colors.bar} ${isRecurring ? 'border-l-2 border-l-current' : ''}`}
                        style={customColor ? { backgroundColor: eventColor + '20', color: eventColor! } : undefined}
                        title={title}
                      >
                        {isRecurring && <Repeat2 className="inline w-2.5 h-2.5 mr-0.5 opacity-60" />}
                        {!ev.isAllDay && <span className="opacity-60">{formatHM(ev.start)} </span>}
                        {title}
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <div className="text-[9px] text-gray-400 font-medium pl-1">+{overflow} 更多</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/* ─────────── Time Grid (shared by Week & Day) ─────────── */
const TimeGrid: React.FC<{
  days: Date[];
  events: CalendarEvent[];
  onClickEvent: (todo: TodoItem) => void;
  onClickRecurring?: (re: RecurringEvent) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  compressNight: boolean;
  showTimeLine: boolean;
}> = ({ days, events, onClickEvent, onClickRecurring, scrollRef, compressNight, showTimeLine }) => {
  const today = new Date();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Current-time indicator position
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = minutesToPx(nowMinutes, compressNight);

  // Pre-compute layout for each day column
  const dayLayouts = useMemo(() => {
    return days.map(day => {
      const dayEvts = eventsForDate(events, day).filter(e => !e.isAllDay);
      return layoutEvents(dayEvts);
    });
  }, [days, events]);

  // All-day events per day
  const allDayEvents = useMemo(() => {
    return days.map(day => eventsForDate(events, day).filter(e => e.isAllDay));
  }, [days, events]);

  const hasAnyAllDay = allDayEvents.some(a => a.length > 0);

  // Has-events marker per day
  const dayHasEvents = useMemo(() => {
    return days.map(day => eventsForDate(events, day).length > 0);
  }, [days, events]);

  const gridHeight = totalGridHeight(compressNight);

  return (
    <div className="h-full flex flex-col">
      {/* Day headers */}
      <div className="flex border-b border-gray-100 sticky top-0 bg-white z-20">
        <div className="w-12 shrink-0" />
        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            const hasEvt = dayHasEvents[i];
            return (
              <div key={i} className="text-center py-2 border-l border-gray-50 first:border-l-0 relative">
                <div className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                  周{dayNames[day.getDay()]}
                </div>
                <div className={`text-lg font-bold leading-tight mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full relative
                  ${isToday ? 'bg-blue-600 text-white' : 'text-gray-800'}
                `}>
                  {day.getDate()}
                  {/* Dot marker for days with events */}
                  {hasEvt && !isToday && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day events row (if any) */}
      {hasAnyAllDay && (
        <div className="flex border-b border-gray-100 bg-gray-50/50">
          <div className="w-12 shrink-0 flex items-center justify-end pr-2">
            <span className="text-[9px] text-gray-400 font-medium">全天</span>
          </div>
          <div className="flex-1 grid py-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {allDayEvents.map((dayEvts, di) => (
              <div key={di} className="px-0.5 space-y-0.5 border-l border-gray-100 first:border-l-0">
                {dayEvts.map(ev => {
                  const colors = getCalendarEventColors(ev);
                  const customColor = (ev.todo?.color || ev.recurring?.color) && !ev.todo?.isCompleted;
                  const eventColor = ev.todo?.color || ev.recurring?.color;
                  const title = ev.todo?.content || ev.recurring?.title || '';
                  const evKey = ev.todo?.id || `${ev.recurring?.id}_${ev.start.toDateString()}`;
                  const isRecurring = !!ev.recurring;
                  return (
                    <button
                      key={evKey}
                      onClick={() => ev.todo ? onClickEvent(ev.todo) : onClickRecurring?.(ev.recurring!)}
                      className={`w-full text-left text-[10px] px-1 py-[1px] rounded truncate font-medium ${customColor ? '' : colors.bar} ${isRecurring ? 'border-l-2 border-l-current' : ''}`}
                      style={customColor ? { backgroundColor: eventColor + '20', color: eventColor! } : undefined}
                      title={title}
                    >
                      {isRecurring && <Repeat2 className="inline w-2.5 h-2.5 mr-0.5 opacity-60" />}
                      {title}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0">
        <div className="flex relative" style={{ height: gridHeight }}>
          {/* Hour labels */}
          <div className="w-12 shrink-0 relative">
            {hours.map(h => {
              const top = minutesToPx(h * 60, compressNight);
              const isCompressed = compressNight && h < 6;
              if (isCompressed && h !== 0 && h !== 6) return null; // Skip labels 1–5 in compressed mode
              return (
                <div key={h} className={`absolute right-2 text-[10px] font-medium -translate-y-1/2 ${isCompressed ? 'text-gray-300' : 'text-gray-400'}`} style={{ top }}>
                  {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          <div className="flex-1 relative grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {/* Hour grid lines */}
            {hours.map(h => {
              const top = minutesToPx(h * 60, compressNight);
              const isCompressed = compressNight && h < 6;
              return (
                <div key={h} className={`absolute left-0 right-0 ${isCompressed ? 'border-t border-gray-50' : 'border-t border-gray-100'}`} style={{ top }} />
              );
            })}
            {/* Half-hour grid lines (skip in compressed zone) */}
            {hours.map(h => {
              if (compressNight && h < 6) return null;
              const top = minutesToPx(h * 60 + 30, compressNight);
              return (
                <div key={`h${h}`} className="absolute left-0 right-0 border-t border-gray-50" style={{ top }} />
              );
            })}

            {/* Compression zone label */}
            {compressNight && (
              <div className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-10"
                style={{ top: 0, height: 6 * COMPRESSED_HOUR_HEIGHT }}>
                <span className="text-[9px] text-gray-300 font-medium bg-white/80 px-2 rounded">0:00 — 6:00</span>
              </div>
            )}

            {/* Current-time indicator */}
            {showTimeLine && days.some(d => isSameDay(d, today)) && (
              <>
                <div
                  className="absolute left-0 right-0 border-t-2 border-dashed border-red-400 z-20 pointer-events-none"
                  style={{ top: nowTop }}
                />
                {days.map((d, i) => isSameDay(d, today) ? (
                  <div
                    key={`dot${i}`}
                    className="absolute w-2.5 h-2.5 rounded-full bg-red-400 z-20 pointer-events-none -translate-y-1/2"
                    style={{ top: nowTop, left: `calc(${(i / days.length) * 100}%)` }}
                  />
                ) : null)}
              </>
            )}

            {/* Event blocks per column */}
            {dayLayouts.map((layouted, colIdx) => (
              <div key={colIdx} className="relative border-l border-gray-100 first:border-l-0">
                {layouted.map(le => {
                  const evKey = le.event.todo?.id || `${le.event.recurring?.id}_${le.event.start.toDateString()}`;
                  return (
                    <EventBlock key={evKey} le={le} onClickTodo={onClickEvent} onClickRecurring={onClickRecurring} compressNight={compressNight} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═════════════════════════════════════════════════════════════
   Main Component
   ═════════════════════════════════════════════════════════════ */

export const ScheduleView: React.FC<ScheduleViewProps> = ({ todos, onEditTodo, onToggleTodo, recurringEvents = [], onEditRecurring }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const timeGridRef = useRef<HTMLDivElement>(null);

  // Night compression setting with localStorage memory
  const [compressNight, setCompressNight] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_COMPRESS) !== 'false'; } catch { return true; } // default ON
  });
  const toggleCompress = useCallback(() => {
    setCompressNight(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY_COMPRESS, String(next)); } catch {}
      return next;
    });
  }, []);

  // Current-time indicator setting with localStorage memory
  const [showTimeLine, setShowTimeLine] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_TIMELINE) !== 'false'; } catch { return true; }
  });
  const toggleTimeLine = useCallback(() => {
    setShowTimeLine(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY_TIMELINE, String(next)); } catch {}
      return next;
    });
  }, []);

  // Settings popover
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showSettings) return;
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSettings]);

  // Convert todos → calendar events
  const todoEvents = useMemo(() => {
    return todos.map(t => todoToEvent(t)).filter((e): e is CalendarEvent => e !== null);
  }, [todos]);

  // Visible days for current view (used to compute recurring occurrences)
  const visibleDays = useMemo(() => {
    if (viewMode === 'month') {
      const grid = buildMonthGrid(currentDate.getFullYear(), currentDate.getMonth());
      return grid.flat().map(c => c.date);
    }
    if (viewMode === 'week') {
      const ws = getWeekStart(currentDate);
      return Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
    }
    return [new Date(currentDate)];
  }, [viewMode, currentDate]);

  // Recurring event occurrences for the visible range
  const recurringOccurrences = useMemo(() => {
    return recurringToEvents(recurringEvents, visibleDays);
  }, [recurringEvents, visibleDays]);

  // Combined events
  const events = useMemo(() => [...todoEvents, ...recurringOccurrences], [todoEvents, recurringOccurrences]);

  // Smart auto-scroll to the nearest event time
  useEffect(() => {
    if ((viewMode === 'week' || viewMode === 'day') && timeGridRef.current) {
      const days = viewMode === 'week' ? (() => {
        const ws = getWeekStart(currentDate);
        return Array.from({ length: 7 }, (_, i) => { const d = new Date(ws); d.setDate(d.getDate() + i); return d; });
      })() : [new Date(currentDate)];
      const scrollTarget = findSmartScrollTarget(events, days, compressNight);
      requestAnimationFrame(() => {
        timeGridRef.current?.scrollTo({ top: scrollTarget, behavior: 'auto' });
      });
    }
  }, [viewMode, currentDate, events, compressNight]);

  // Navigation
  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const goPrev = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
      else if (viewMode === 'week') d.setDate(d.getDate() - 7);
      else d.setDate(d.getDate() - 1);
      return d;
    });
  }, [viewMode]);

  const goNext = useCallback(() => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
      else if (viewMode === 'week') d.setDate(d.getDate() + 7);
      else d.setDate(d.getDate() + 1);
      return d;
    });
  }, [viewMode]);

  const handleClickDay = useCallback((date: Date) => {
    setCurrentDate(date);
    setViewMode('day');
  }, []);

  // Header title
  const headerTitle = useMemo(() => {
    if (viewMode === 'month') {
      return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    }
    if (viewMode === 'week') {
      const ws = getWeekStart(currentDate);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      if (ws.getMonth() === we.getMonth()) {
        return `${ws.getFullYear()}年${ws.getMonth() + 1}月${ws.getDate()}日 — ${we.getDate()}日`;
      }
      return `${ws.getMonth() + 1}月${ws.getDate()}日 — ${we.getMonth() + 1}月${we.getDate()}日`;
    }
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日 星期${dayNames[currentDate.getDay()]}`;
  }, [currentDate, viewMode]);

  const weekDays = useMemo(() => {
    const ws = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const dayArray = useMemo(() => [new Date(currentDate)], [currentDate]);

  const isToday = isSameDay(currentDate, new Date());

  const VIEW_MODES: { key: ViewMode; label: string; icon: React.FC<any> }[] = [
    { key: 'day', label: '日', icon: AlignJustify },
    { key: 'week', label: '周', icon: Columns3 },
    { key: 'month', label: '月', icon: LayoutGrid },
  ];

  if (events.length === 0 && recurringEvents.filter(r => r.isActive).length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400">
        <CalendarIcon className="w-12 h-12 mb-3 text-gray-300" />
        <p className="text-sm">暂无日程事件</p>
        <p className="text-xs mt-1">给待办事项设置时间或创建重复事件即可在此显示</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white/80 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-800">日程表</h3>
          <span className="text-xs text-gray-400">({todoEvents.length} 待办事件{recurringEvents.filter(r=>r.isActive).length > 0 ? `, ${recurringEvents.filter(r=>r.isActive).length} 重复` : ''})</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-semibold text-gray-700 min-w-[170px] text-center">{headerTitle}</h3>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={goToday}
              className={`ml-1 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors
                ${isToday ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}
            >
              今天
            </button>
          </div>

          {/* View mode switcher */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {VIEW_MODES.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200
                  ${viewMode === key ? 'bg-white shadow-sm text-gray-800 ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Settings button */}
          {(viewMode === 'week' || viewMode === 'day') && (
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setShowSettings(v => !v)}
                className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-gray-200 text-gray-700' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}
                title="视图设置"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-30 w-52">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
                    <input
                      type="checkbox"
                      checked={compressNight}
                      onChange={toggleCompress}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="font-medium text-xs">压缩凌晨时段</div>
                      <div className="text-[10px] text-gray-400">将 0:00–6:00 缩小显示</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900 mt-2">
                    <input
                      type="checkbox"
                      checked={showTimeLine}
                      onChange={toggleTimeLine}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="font-medium text-xs">显示当前时间线</div>
                      <div className="text-[10px] text-gray-400">在今天列显示时刻指示线</div>
                    </div>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'month' && (
          <div className="h-full overflow-auto">
            <MonthView currentDate={currentDate} events={events} onClickEvent={onEditTodo} onClickRecurring={onEditRecurring} onClickDay={handleClickDay} />
          </div>
        )}
        {viewMode === 'week' && (
          <TimeGrid days={weekDays} events={events} onClickEvent={onEditTodo} onClickRecurring={onEditRecurring} scrollRef={timeGridRef} compressNight={compressNight} showTimeLine={showTimeLine} />
        )}
        {viewMode === 'day' && (
          <TimeGrid days={dayArray} events={events} onClickEvent={onEditTodo} onClickRecurring={onEditRecurring} scrollRef={timeGridRef} compressNight={compressNight} showTimeLine={showTimeLine} />
        )}
      </div>
    </div>
  );
};
