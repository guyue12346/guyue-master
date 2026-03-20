import React, { useState, useMemo } from 'react';
import { RecurringEvent, RecurringCategory } from '../types';
import { RecurringEventModal } from './RecurringEventModal';
import { RecurringCategoryManagerModal } from './RecurringCategoryManagerModal';
import { ConfirmDialog } from './ConfirmDialog';
import { Plus, Repeat2, Pencil, Trash2, ToggleLeft, ToggleRight, Search, Calendar, Settings2 } from 'lucide-react';

interface RecurringEventManagerProps {
  events: RecurringEvent[];
  categories: RecurringCategory[];
  onCreate: (data: Partial<RecurringEvent>) => void;
  onUpdate: (id: string, data: Partial<RecurringEvent>) => void;
  onDelete: (id: string) => void;
  onUpdateCategories: (cats: RecurringCategory[]) => void;
}

const RECURRENCE_LABELS: Record<RecurringEvent['recurrence'], string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
};

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function describeRecurrence(event: RecurringEvent): string {
  let base = '';
  if (event.interval === 1) {
    base = RECURRENCE_LABELS[event.recurrence];
  } else {
    const unit = { daily: '天', weekly: '周', monthly: '月', yearly: '年' }[event.recurrence];
    base = `每 ${event.interval} ${unit}`;
  }
  if (event.recurrence === 'weekly' && event.weekDays && event.weekDays.length > 0) {
    const days = [...event.weekDays].sort((a, b) => a - b).map(d => '周' + WEEKDAY_LABELS[d]).join('、');
    base += `（${days}）`;
  }
  return base;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function getNextOccurrence(event: RecurringEvent): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  // Search for next occurrence in next 400 days
  for (let i = 0; i <= 400; i++) {
    const candidate = new Date(now.getTime() + i * 86400000);
    if (checkOccurs(event, candidate)) {
      if (i === 0) return '今天';
      if (i === 1) return '明天';
      const d = candidate;
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    }
  }
  return '无安排';
}

function getLunarMonthDay(date: Date): { month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('zh-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(date);
    const mRaw = parts.find(p => p.type === 'month')?.value ?? '';
    const dRaw = parts.find(p => p.type === 'day')?.value ?? '';
    const CM: Record<string, number> = {'正':1,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'冬':11,'腊':12};
    const CD: Record<string, number> = {'初一':1,'初二':2,'初三':3,'初四':4,'初五':5,'初六':6,'初七':7,'初八':8,'初九':9,'初十':10,'十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20,'廿一':21,'廿二':22,'廿三':23,'廿四':24,'廿五':25,'廿六':26,'廿七':27,'廿八':28,'廿九':29,'三十':30};
    const mStr = mRaw.replace(/月|闰|\s/g, '');
    const dStr = dRaw.replace(/日|\s/g, '');
    const m = parseInt(mStr) || CM[mStr] || 0;
    const d = parseInt(dStr) || CD[dStr] || 0;
    return (m >= 1 && m <= 13 && d >= 1 && d <= 30) ? { month: m, day: d } : null;
  } catch { return null; }
}

function checkOccurs(event: RecurringEvent, date: Date): boolean {
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
      if (event.lunarRecurrence && event.lunarDay) {
        const lunar = getLunarMonthDay(day);
        return !!lunar && lunar.day === event.lunarDay;
      }
      return day.getDate() === start.getDate();
    }
    case 'yearly': {
      const yDiff = day.getFullYear() - start.getFullYear();
      if (yDiff < 0 || yDiff % event.interval !== 0) return false;
      if (event.lunarRecurrence && event.lunarMonth && event.lunarDay) {
        const lunar = getLunarMonthDay(day);
        return !!lunar && lunar.month === event.lunarMonth && lunar.day === event.lunarDay;
      }
      return day.getMonth() === start.getMonth() && day.getDate() === start.getDate();
    }
    default: return false;
  }
}

const EVENT_COLORS: Record<string, string> = {
  '#3b82f6': 'bg-blue-500',
  '#8b5cf6': 'bg-violet-500',
  '#ec4899': 'bg-pink-500',
  '#ef4444': 'bg-red-500',
  '#f97316': 'bg-orange-500',
  '#eab308': 'bg-yellow-500',
  '#22c55e': 'bg-green-500',
  '#14b8a6': 'bg-teal-500',
  '#6b7280': 'bg-gray-500',
};

export const RecurringEventManager: React.FC<RecurringEventManagerProps> = ({
  events, categories, onCreate, onUpdate, onDelete, onUpdateCategories,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<RecurringEvent | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(e => {
      // Category filter: match by category name against selected category's name
      if (selectedCatId !== 'all') {
        const selCat = categories.find(c => c.id === selectedCatId);
        if (selCat && e.category !== selCat.name) return false;
      }
      return !q || e.title.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    });
  }, [events, query, selectedCatId, categories]);

  const handleSave = (data: Partial<RecurringEvent>) => {
    if (data.id) {
      onUpdate(data.id, data);
    } else {
      onCreate(data);
    }
  };

  const handleEdit = (event: RecurringEvent) => {
    setEditingEvent(event);
    setModalOpen(true);
  };

  const handleToggleActive = (event: RecurringEvent) => {
    onUpdate(event.id, { isActive: !event.isActive });
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <Repeat2 className="w-5 h-5 text-violet-500" />
          <h2 className="text-lg font-bold text-gray-800">重复事件</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {events.filter(e => e.isActive).length} 个激活
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditingEvent(null); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
            title="新建重复事件"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-gray-100 shrink-0 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setCatModalOpen(true)}
          className="shrink-0 p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
          title="管理分类"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-200 shrink-0" />
        <button
          onClick={() => setSelectedCatId('all')}
          className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
            selectedCatId === 'all'
              ? 'bg-violet-100 text-violet-700'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          全部
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCatId(cat.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              selectedCatId === cat.id
                ? 'text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            style={selectedCatId === cat.id ? { backgroundColor: cat.color } : {}}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: selectedCatId === cat.id ? 'rgba(255,255,255,0.8)' : cat.color }}
            />
            {cat.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-5 py-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索重复事件..."
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 py-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
            <Repeat2 className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm font-medium">暂无重复事件</p>
            <p className="text-xs mt-1">点击「新建」创建每日/每周等重复事件</p>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {filtered.map(event => {
              const next = event.isActive ? getNextOccurrence(event) : null;
              const dotColor = event.color || categories.find(c => c.name === event.category)?.color || '#8b5cf6';
              const catColor = categories.find(c => c.name === event.category)?.color;
              const timeDesc = event.allDay
                ? '全天'
                : (() => {
                    const m = event.startTime ?? 0;
                    const h = Math.floor(m / 60);
                    const min = m % 60;
                    const dur = event.duration ?? 60;
                    const endM = m + dur;
                    const eh = Math.floor(endM / 60) % 24;
                    const em = endM % 60;
                    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')} – ${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
                  })();

              return (
                <div
                  key={event.id}
                  className={`group flex items-start gap-3 p-4 rounded-2xl border transition-all duration-200 ${
                    event.isActive
                      ? 'bg-white border-gray-200 hover:border-violet-200 hover:shadow-sm'
                      : 'bg-gray-50 border-gray-100 opacity-60'
                  }`}
                >
                  {/* Color dot */}
                  <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: dotColor }} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-gray-800 text-sm truncate">{event.title}</div>
                      {event.category && (
                        <span
                          className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={catColor
                            ? { backgroundColor: catColor + '22', color: catColor }
                            : { backgroundColor: '#f3f4f6', color: '#9ca3af' }}
                        >{event.category}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-0.5">
                        <Repeat2 className="w-3 h-3" />
                        {describeRecurrence(event)}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>{timeDesc}</span>
                      {event.endDate && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="flex items-center gap-0.5">
                            <Calendar className="w-3 h-3" />
                            至 {formatDate(event.endDate)}
                          </span>
                        </>
                      )}
                    </div>
                    {next && (
                      <div className="mt-1 text-[11px] text-violet-500 font-medium">
                        下次: {next}
                      </div>
                    )}
                    {event.description && (
                      <div className="mt-1 text-xs text-gray-400 truncate">{event.description}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleToggleActive(event)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title={event.isActive ? '暂停' : '激活'}
                    >
                      {event.isActive
                        ? <ToggleRight className="w-4 h-4 text-violet-500" />
                        : <ToggleLeft className="w-4 h-4" />
                      }
                    </button>
                    <button
                      onClick={() => handleEdit(event)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(event.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <RecurringEventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={editingEvent}
        categories={categories}
      />

      <RecurringCategoryManagerModal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        categories={categories}
        onUpdateCategories={onUpdateCategories}
        onDeleteEventsByCategory={(catName) => {
          events.filter(e => e.category === catName).forEach(e => onDelete(e.id));
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="删除重复事件"
        message="确认删除这个重复事件吗？所有未来的出现都将被取消。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={() => { if (deleteConfirmId) { onDelete(deleteConfirmId); setDeleteConfirmId(null); } }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};
