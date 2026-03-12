import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { TodoItem } from '../types';
import { ChevronLeft, ChevronRight, Check, Clock, Calendar as CalendarIcon, LayoutGrid, Columns3, AlignJustify } from 'lucide-react';

/* ─────────────────── Types ─────────────────── */

type ViewMode = 'day' | 'week' | 'month';

interface ScheduleViewProps {
  todos: TodoItem[];
  onEditTodo: (todo: TodoItem) => void;
  onToggleTodo: (id: string) => void;
}

interface CalendarEvent {
  todo: TodoItem;
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
const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const PRIORITY_COLORS: Record<string, { bar: string; block: string; dot: string }> = {
  high:   { bar: 'bg-rose-100 text-rose-700', block: 'bg-rose-50 border-l-[3px] border-l-rose-500 text-rose-800', dot: 'bg-rose-500' },
  medium: { bar: 'bg-amber-100 text-amber-700', block: 'bg-amber-50 border-l-[3px] border-l-amber-500 text-amber-800', dot: 'bg-amber-500' },
  low:    { bar: 'bg-sky-100 text-sky-700', block: 'bg-sky-50 border-l-[3px] border-l-sky-500 text-sky-800', dot: 'bg-sky-500' },
};
const COMPLETED_COLORS = { bar: 'bg-gray-100 text-gray-400 line-through', block: 'bg-gray-50 border-l-[3px] border-l-gray-300 text-gray-400 line-through', dot: 'bg-gray-300' };

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

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
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
  if (todo.dueDate && !todo.timeType) {
    const start = new Date(todo.dueDate);
    start.setHours(0, 0, 0, 0);
    return { todo, start, end: start, isAllDay: true };
  }
  return null;
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

  const columns: number[] = []; // end times per column
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

function getColors(todo: TodoItem) {
  return todo.isCompleted ? COMPLETED_COLORS : (PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS.medium);
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
    // If all remaining cells would be next month and we have at least 5 rows, stop
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
  onClick: (todo: TodoItem) => void;
  colWidth?: number; // percentage width of parent column
}> = ({ le, onClick }) => {
  const { event, column, totalColumns } = le;
  const colors = getColors(event.todo);

  const startMinutes = event.start.getHours() * 60 + event.start.getMinutes();
  const endMinutes = event.end.getHours() * 60 + event.end.getMinutes();
  const durationMinutes = Math.max(endMinutes - startMinutes, 20); // at least 20min visual height

  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 22);
  const width = `calc(${(1 / totalColumns) * 100}% - 4px)`;
  const left = `calc(${(column / totalColumns) * 100}% + 2px)`;

  return (
    <button
      onClick={() => onClick(event.todo)}
      className={`absolute rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer transition-opacity hover:opacity-80 text-left ${colors.block}`}
      style={{ top, height, width, left, zIndex: 10 + column }}
      title={`${event.todo.content}\n${formatHM(event.start)} – ${formatHM(event.end)}`}
    >
      <div className="text-[11px] font-medium truncate leading-tight">{event.todo.content}</div>
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
  onClickDay: (date: Date) => void;
}> = ({ currentDate, events, onClickEvent, onClickDay }) => {
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
            return (
              <div
                key={di}
                className={`min-h-[80px] border-r border-gray-50 last:border-r-0 p-1 cursor-pointer transition-colors hover:bg-gray-50/50
                  ${!cell.isCurrentMonth ? 'bg-gray-50/30' : ''}
                `}
                onClick={() => onClickDay(cell.date)}
              >
                <div className={`text-[11px] font-medium mb-0.5 w-6 h-6 flex items-center justify-center rounded-full
                  ${isToday ? 'bg-blue-600 text-white' : cell.isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}
                  ${di >= 5 && !isToday ? (cell.isCurrentMonth ? 'text-gray-400' : 'text-gray-300') : ''}
                `}>
                  {cell.date.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, MAX_VISIBLE).map(ev => {
                    const colors = getColors(ev.todo);
                    return (
                      <button
                        key={ev.todo.id}
                        onClick={(e) => { e.stopPropagation(); onClickEvent(ev.todo); }}
                        className={`w-full text-left text-[10px] px-1 py-[1px] rounded truncate leading-tight font-medium ${colors.bar}`}
                        title={ev.todo.content}
                      >
                        {!ev.isAllDay && <span className="opacity-60">{formatHM(ev.start)} </span>}
                        {ev.todo.content}
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
  scrollRef: React.RefObject<HTMLDivElement | null>;
}> = ({ days, events, onClickEvent, scrollRef }) => {
  const today = new Date();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Current-time indicator position
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

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

  return (
    <div className="flex flex-col">
      {/* Day headers */}
      <div className="flex border-b border-gray-100 sticky top-0 bg-white z-20">
        <div className="w-12 shrink-0" />
        <div className={`flex-1 grid`} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, today);
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            return (
              <div key={i} className="text-center py-2 border-l border-gray-50 first:border-l-0">
                <div className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                  周{dayNames[day.getDay()]}
                </div>
                <div className={`text-lg font-bold leading-tight mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full
                  ${isToday ? 'bg-blue-600 text-white' : 'text-gray-800'}
                `}>
                  {day.getDate()}
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
                  const colors = getColors(ev.todo);
                  return (
                    <button
                      key={ev.todo.id}
                      onClick={() => onClickEvent(ev.todo)}
                      className={`w-full text-left text-[10px] px-1 py-[1px] rounded truncate font-medium ${colors.bar}`}
                      title={ev.todo.content}
                    >
                      {ev.todo.content}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="overflow-y-auto flex-1" style={{ maxHeight: '480px' }}>
        <div className="flex relative" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Hour labels */}
          <div className="w-12 shrink-0 relative">
            {hours.map(h => (
              <div key={h} className="absolute right-2 text-[10px] text-gray-400 font-medium -translate-y-1/2" style={{ top: h * HOUR_HEIGHT }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 relative grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {/* Hour grid lines */}
            {hours.map(h => (
              <div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: h * HOUR_HEIGHT }} />
            ))}
            {/* Half-hour grid lines */}
            {hours.map(h => (
              <div key={`h${h}`} className="absolute left-0 right-0 border-t border-gray-50" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
            ))}

            {/* Current-time indicator */}
            {days.some(d => isSameDay(d, today)) && (
              <>
                <div
                  className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                  style={{ top: nowTop }}
                />
                {/* Red dot on the left edge of the "today" column */}
                {days.map((d, i) => isSameDay(d, today) ? (
                  <div
                    key={`dot${i}`}
                    className="absolute w-2.5 h-2.5 rounded-full bg-red-500 z-20 pointer-events-none -translate-y-1/2"
                    style={{ top: nowTop, left: `calc(${(i / days.length) * 100}%)` }}
                  />
                ) : null)}
              </>
            )}

            {/* Event blocks per column */}
            {dayLayouts.map((layouted, colIdx) => (
              <div key={colIdx} className="relative border-l border-gray-100 first:border-l-0">
                {layouted.map(le => (
                  <EventBlock key={le.event.todo.id} le={le} onClick={onClickEvent} />
                ))}
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

export const ScheduleView: React.FC<ScheduleViewProps> = ({ todos, onEditTodo, onToggleTodo }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const timeGridRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to ~7am when switching to day/week view
  useEffect(() => {
    if ((viewMode === 'week' || viewMode === 'day') && timeGridRef.current) {
      requestAnimationFrame(() => {
        timeGridRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT, behavior: 'auto' });
      });
    }
  }, [viewMode, currentDate]);

  // Convert todos → calendar events
  const events = useMemo(() => {
    return todos.map(t => todoToEvent(t)).filter((e): e is CalendarEvent => e !== null);
  }, [todos]);

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

  // Week days array
  const weekDays = useMemo(() => {
    const ws = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Day array (single element for day view)
  const dayArray = useMemo(() => [new Date(currentDate)], [currentDate]);

  const isToday = isSameDay(currentDate, new Date());

  // View mode buttons config
  const VIEW_MODES: { key: ViewMode; label: string; icon: React.FC<any> }[] = [
    { key: 'day', label: '日', icon: AlignJustify },
    { key: 'week', label: '周', icon: Columns3 },
    { key: 'month', label: '月', icon: LayoutGrid },
  ];

  if (events.length === 0) {
    return null; // Don't render the schedule if there are no time-based events
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white/80">
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-semibold text-gray-700 min-w-[180px] text-center select-none">
            {headerTitle}
          </h3>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className={`ml-2 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors
              ${isToday
                ? 'border-blue-200 bg-blue-50 text-blue-600'
                : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
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
                ${viewMode === key
                  ? 'bg-white shadow-sm text-gray-800 ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Content ─── */}
      {viewMode === 'month' && (
        <MonthView
          currentDate={currentDate}
          events={events}
          onClickEvent={onEditTodo}
          onClickDay={handleClickDay}
        />
      )}
      {viewMode === 'week' && (
        <TimeGrid
          days={weekDays}
          events={events}
          onClickEvent={onEditTodo}
          scrollRef={timeGridRef}
        />
      )}
      {viewMode === 'day' && (
        <TimeGrid
          days={dayArray}
          events={events}
          onClickEvent={onEditTodo}
          scrollRef={timeGridRef}
        />
      )}
    </div>
  );
};
