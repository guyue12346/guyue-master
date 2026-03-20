import React, { useState, useEffect } from 'react';
import { RecurringEvent, RecurringCategory } from '../types';
import { X, Repeat2, Calendar, Clock, Palette, Tag, AlignLeft } from 'lucide-react';

interface RecurringEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<RecurringEvent>) => void;
  initialData?: RecurringEvent | null;
  categories: RecurringCategory[];
}

const COLOR_OPTIONS = [
  { value: '', label: '默认', bg: 'bg-violet-100', ring: 'ring-violet-300' },
  { value: '#3b82f6', label: '蓝', bg: 'bg-blue-500', ring: 'ring-blue-400' },
  { value: '#8b5cf6', label: '紫', bg: 'bg-violet-500', ring: 'ring-violet-400' },
  { value: '#ec4899', label: '粉', bg: 'bg-pink-500', ring: 'ring-pink-400' },
  { value: '#ef4444', label: '红', bg: 'bg-red-500', ring: 'ring-red-400' },
  { value: '#f97316', label: '橙', bg: 'bg-orange-500', ring: 'ring-orange-400' },
  { value: '#eab308', label: '黄', bg: 'bg-yellow-500', ring: 'ring-yellow-400' },
  { value: '#22c55e', label: '绿', bg: 'bg-green-500', ring: 'ring-green-400' },
  { value: '#14b8a6', label: '青', bg: 'bg-teal-500', ring: 'ring-teal-400' },
  { value: '#6b7280', label: '灰', bg: 'bg-gray-500', ring: 'ring-gray-400' },
];

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

const LUNAR_MONTH_NAMES = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY_NAMES = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];

function getLunarMonthDay(date: Date): { month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('zh-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(date);
    const mRaw = parts.find(p => p.type === 'month')?.value ?? '';
    const dRaw = parts.find(p => p.type === 'day')?.value ?? '';
    const CM: Record<string, number> = { '正':1,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'冬':11,'腊':12 };
    const CD: Record<string, number> = { '初一':1,'初二':2,'初三':3,'初四':4,'初五':5,'初六':6,'初七':7,'初八':8,'初九':9,'初十':10,'十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20,'廿一':21,'廿二':22,'廿三':23,'廿四':24,'廿五':25,'廿六':26,'廿七':27,'廿八':28,'廿九':29,'三十':30 };
    const mStr = mRaw.replace(/月|闰|\s/g, '');
    const dStr = dRaw.replace(/日|\s/g, '');
    const m = parseInt(mStr) || CM[mStr] || 0;
    const d = parseInt(dStr) || CD[dStr] || 0;
    return (m >= 1 && m <= 13 && d >= 1 && d <= 30) ? { month: m, day: d } : null;
  } catch { return null; }
}

const toDateString = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toTimeString = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const RECURRENCE_UNITS: Record<string, string> = {
  daily: '天',
  weekly: '周',
  monthly: '月',
  yearly: '年',
};

export const RecurringEventModal: React.FC<RecurringEventModalProps> = ({
  isOpen, onClose, onSave, initialData, categories,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [color, setColor] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(() => toDateString(Date.now()));
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState(60); // minutes
  const [recurrence, setRecurrence] = useState<RecurringEvent['recurrence']>('weekly');
  const [interval, setInterval] = useState(1);
  const [weekDays, setWeekDays] = useState<number[]>([new Date().getDay()]);
  const [useLunar, setUseLunar] = useState(false);
  const [lunarMonth, setLunarMonth] = useState(1);
  const [lunarDay, setLunarDay] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setTitle(initialData.title);
      setDescription(initialData.description || '');
      setCategory(initialData.category || (categories[0]?.id ?? ''));
      // Handle existing events that may store category name instead of id
      const byId = categories.find(c => c.id === initialData.category);
      const byName = categories.find(c => c.name === initialData.category);
      setCategory(byId?.id ?? byName?.id ?? categories[0]?.id ?? '');
      setColor(initialData.color || '');
      setAllDay(initialData.allDay);
      setStartDate(toDateString(initialData.startDate));
      setEndDate(initialData.endDate ? toDateString(initialData.endDate) : '');
      setStartTime(initialData.startTime !== undefined ? toTimeString(initialData.startTime) : '09:00');
      setDuration(initialData.duration ?? 60);
      setRecurrence(initialData.recurrence);
      setInterval(initialData.interval);
      setWeekDays(initialData.weekDays ?? [new Date(initialData.startDate).getDay()]);
      setUseLunar(initialData.lunarRecurrence ?? false);
      setLunarMonth(initialData.lunarMonth ?? 1);
      setLunarDay(initialData.lunarDay ?? 1);
    } else {
      setTitle('');
      setDescription('');
      setCategory(categories[0]?.id ?? '');
      setColor('');
      setAllDay(true);
      setStartDate(toDateString(Date.now()));
      setEndDate('');
      setStartTime('09:00');
      setDuration(60);
      setRecurrence('weekly');
      setInterval(1);
      setWeekDays([new Date().getDay()]);
      setUseLunar(false);
      setLunarMonth(1);
      setLunarDay(1);
    }
  }, [isOpen, initialData]);

  const toggleWeekDay = (d: number) => {
    setWeekDays(prev =>
      prev.includes(d) ? (prev.length > 1 ? prev.filter(x => x !== d) : prev) : [...prev, d]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startMs = new Date(startDate + 'T00:00:00').getTime();
    const endMs = endDate ? new Date(endDate + 'T23:59:59').getTime() : undefined;
    const [sh, sm] = startTime.split(':').map(Number);
    const startTimeMin = sh * 60 + sm;

    const selectedCat = categories.find(c => c.id === category);
    onSave({
      id: initialData?.id,
      title: title.trim(),
      description: description.trim() || undefined,
      category: selectedCat?.name || category || '未分类',
      color: color || undefined,
      allDay,
      startDate: startMs,
      endDate: endMs,
      startTime: allDay ? undefined : startTimeMin,
      duration: allDay ? undefined : Math.max(duration, 15),
      recurrence,
      interval: Math.max(interval, 1),
      weekDays: recurrence === 'weekly' ? weekDays : undefined,
      lunarRecurrence: (useLunar && (recurrence === 'monthly' || recurrence === 'yearly')) ? true : undefined,
      lunarMonth: (useLunar && recurrence === 'yearly' && lunarMonth > 0) ? lunarMonth : undefined,
      lunarDay: (useLunar && lunarDay > 0) ? lunarDay : undefined,
      isActive: initialData?.isActive ?? true,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg border border-white/50 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Repeat2 className="w-5 h-5 text-violet-500" />
            {initialData ? '编辑重复事件' : '新建重复事件'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">事件名称</label>
              <input
                required
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例如：晨跑、周例会..."
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all text-sm"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><AlignLeft className="w-3.5 h-3.5" />描述（可选）</span>
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="添加备注..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all text-sm resize-none"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />分类</span>
              </label>
              {categories.length > 0 ? (
                <div className="relative">
                  {/* Color dot preview */}
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none"
                    style={{ backgroundColor: categories.find(c => c.id === category)?.color ?? '#8b5cf6' }}
                  />
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all text-sm appearance-none"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-2">暂无分类，请先在重复事件管理页面创建分类</p>
              )}
            </div>

            {/* ─── Recurrence Rule ─── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Repeat2 className="w-3.5 h-3.5" />重复规则</span>
              </label>

              {/* Recurrence type */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecurrence(r)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all duration-200
                      ${recurrence === r ? 'bg-white shadow-sm text-gray-800 ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {r === 'daily' ? '每天' : r === 'weekly' ? '每周' : r === 'monthly' ? '每月' : '每年'}
                  </button>
                ))}
              </div>

              {/* Interval */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-600">每</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={interval}
                  onChange={e => setInterval(Number(e.target.value))}
                  className="w-16 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-center text-sm outline-none focus:border-violet-400"
                />
                <span className="text-sm text-gray-600">{RECURRENCE_UNITS[recurrence]}</span>
              </div>

              {/* Weekday selector (only for weekly) */}
              {recurrence === 'weekly' && (
                <div className="flex gap-1.5 mb-3">
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleWeekDay(idx)}
                      className={`w-9 h-9 rounded-full text-xs font-medium transition-all duration-200
                        ${weekDays.includes(idx)
                          ? 'bg-violet-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Lunar recurrence option (monthly / yearly) */}
              {(recurrence === 'monthly' || recurrence === 'yearly') && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={useLunar}
                      onChange={e => {
                        const v = e.target.checked;
                        setUseLunar(v);
                        if (v) {
                          const lunar = getLunarMonthDay(new Date(startDate + 'T00:00:00'));
                          if (lunar) {
                            setLunarDay(lunar.day);
                            if (recurrence === 'yearly') setLunarMonth(lunar.month);
                          }
                        }
                      }}
                      className="w-3.5 h-3.5 rounded border-gray-300 accent-violet-600"
                    />
                    <span className="text-sm text-gray-700">按农历计算</span>
                    <span className="text-xs text-gray-400">（适合生日、节日等）</span>
                  </label>
                  {useLunar && (
                    <div className={recurrence === 'yearly' ? 'grid grid-cols-2 gap-3' : ''}>
                      {recurrence === 'yearly' && (
                        <div>
                          <p className="text-[10px] text-gray-400 mb-1">农历月份</p>
                          <select
                            value={lunarMonth}
                            onChange={e => setLunarMonth(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400"
                          >
                            {LUNAR_MONTH_NAMES.slice(1).map((n, i) => (
                              <option key={i + 1} value={i + 1}>{n}月（第{i + 1}月）</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-gray-400 mb-1">农历日期</p>
                        <select
                          value={lunarDay}
                          onChange={e => setLunarDay(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400"
                        >
                          {LUNAR_DAY_NAMES.slice(1).map((n, i) => (
                            <option key={i + 1} value={i + 1}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Date Range ─── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />日期范围</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">开始日期</p>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 mb-1">结束日期（可选）</p>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400"
                  />
                </div>
              </div>
            </div>

            {/* ─── Time ─── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />时间</span>
              </label>
              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={e => setAllDay(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                  />
                  全天事件
                </label>
              </div>
              {!allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">开始时间</p>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">持续时长（分钟）</p>
                    <input
                      type="number"
                      min={15}
                      max={1440}
                      step={15}
                      value={duration}
                      onChange={e => setDuration(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-violet-400"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ─── Color ─── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" />颜色</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`w-7 h-7 rounded-full ${c.bg} transition-all ${color === c.value ? `ring-2 ${c.ring} ring-offset-1 scale-110` : 'hover:scale-105'}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-white/50 shrink-0 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors shadow-sm"
            >
              {initialData ? '保存修改' : '创建事件'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
