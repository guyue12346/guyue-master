
import React, { useState, useEffect } from 'react';
import { TodoItem, SubTask } from '../types';
import { X, Calendar, Flag, Tag, CheckSquare, Plus, Trash2, AlignLeft, Clock, MapPin, ArrowRight, Palette, Sun } from 'lucide-react';

interface TodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (todo: Partial<TodoItem>) => void;
  onAutoSave?: (id: string, subtasks: SubTask[]) => void;
  initialData?: TodoItem | null;
  categories: string[];
}

/** Convert a timestamp to a `datetime-local` string in local time */
const toLocalDatetime = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const TodoModal: React.FC<TodoModalProps> = ({ isOpen, onClose, onSave, onAutoSave, initialData, categories }) => {
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');

  // Time mode states
  const [timeMode, setTimeMode] = useState<'none' | 'allday' | 'point' | 'range'>('none');
  const [allDayDateValue, setAllDayDateValue] = useState('');
  const [timePointValue, setTimePointValue] = useState('');
  const [timeStartValue, setTimeStartValue] = useState('');
  const [timeEndValue, setTimeEndValue] = useState('');
  const [eventColor, setEventColor] = useState('');

  useEffect(() => {
    if (initialData) {
      setContent(initialData.content);
      setDescription(initialData.description || '');
      setCategory(initialData.category);
      setPriority(initialData.priority);
      setSubtasks(initialData.subtasks || []);
      setEventColor(initialData.color || '');
      // Restore time mode from existing data
      if (initialData.timeType === 'range' && initialData.timeStart) {
        setTimeMode('range');
        setTimeStartValue(toLocalDatetime(initialData.timeStart));
        setTimeEndValue(initialData.timeEnd ? toLocalDatetime(initialData.timeEnd) : '');
        setTimePointValue('');
        setAllDayDateValue('');
      } else if (initialData.timeType === 'allday' && initialData.dueDate) {
        setTimeMode('allday');
        const d = new Date(initialData.dueDate);
        const pad = (n: number) => String(n).padStart(2, '0');
        setAllDayDateValue(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        setTimePointValue('');
        setTimeStartValue('');
        setTimeEndValue('');
      } else if (initialData.timeType === 'point' && initialData.dueDate) {
        setTimeMode('point');
        setTimePointValue(toLocalDatetime(initialData.dueDate));
        setAllDayDateValue('');
        setTimeStartValue('');
        setTimeEndValue('');
      } else if (initialData.dueDate) {
        // Legacy date-only item → show as point
        setTimeMode('point');
        setTimePointValue(toLocalDatetime(initialData.dueDate));
        setAllDayDateValue('');
        setTimeStartValue('');
        setTimeEndValue('');
      } else {
        setTimeMode('none');
        setAllDayDateValue('');
        setTimePointValue('');
        setTimeStartValue('');
        setTimeEndValue('');
      }
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setContent('');
    setDescription('');
    setCategory('');
    setPriority('medium');
    setTimeMode('none');
    setAllDayDateValue('');
    setTimePointValue('');
    setTimeStartValue('');
    setTimeEndValue('');
    setEventColor('');
    setSubtasks([]);
    setNewSubtask('');
  };

  /** When switching time mode, carry values over for convenience */
  const handleTimeModeChange = (mode: 'none' | 'allday' | 'point' | 'range') => {
    if (mode === 'point' && timeMode === 'range' && timeStartValue) {
      setTimePointValue(timeStartValue);
    } else if (mode === 'range' && timeMode === 'point' && timePointValue) {
      setTimeStartValue(timePointValue);
      if (!timeEndValue) {
        const start = new Date(timePointValue);
        start.setHours(start.getHours() + 1);
        setTimeEndValue(toLocalDatetime(start.getTime()));
      }
    } else if (mode === 'allday' && (timePointValue || timeStartValue)) {
      // Carry over date portion
      const src = timePointValue || timeStartValue;
      setAllDayDateValue(src.split('T')[0]);
    }
    setTimeMode(mode);
  };

  const handleAddSubtask = () => {
    const text = newSubtask.trim();
    if (!text) return;
    const newItem: SubTask = { id: crypto.randomUUID(), content: text, isCompleted: false };
    const next = [...subtasks, newItem];
    setSubtasks(next);
    setNewSubtask('');
    if (initialData?.id) onAutoSave?.(initialData.id, next);
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAddSubtask();
    }
  };

  const handleRemoveSubtask = (id: string) => {
    const next = subtasks.filter(s => s.id !== id);
    setSubtasks(next);
    if (initialData?.id) onAutoSave?.(initialData.id, next);
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, isCompleted: !s.isCompleted } : s));
  };

  const handleSubtaskContentChange = (id: string, value: string) => {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, content: value } : s));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let timeFields: Partial<TodoItem> = {};
    if (timeMode === 'allday' && allDayDateValue) {
      const d = new Date(allDayDateValue + 'T00:00:00');
      timeFields = { timeType: 'allday', dueDate: d.getTime(), timeStart: undefined, timeEnd: undefined };
    } else if (timeMode === 'point' && timePointValue) {
      timeFields = { timeType: 'point', dueDate: new Date(timePointValue).getTime(), timeStart: undefined, timeEnd: undefined };
    } else if (timeMode === 'range' && timeStartValue) {
      timeFields = { timeType: 'range', dueDate: undefined, timeStart: new Date(timeStartValue).getTime(), timeEnd: timeEndValue ? new Date(timeEndValue).getTime() : undefined };
    } else {
      timeFields = { timeType: undefined, dueDate: undefined, timeStart: undefined, timeEnd: undefined };
    }

    onSave({
      id: initialData?.id,
      content,
      description: description.trim() || undefined,
      category,
      priority,
      color: eventColor || undefined,
      ...timeFields,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  const completedCount = subtasks.filter(s => s.isCompleted).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg border border-white/50 overflow-hidden transform transition-all scale-100 max-h-[85vh] flex flex-col">
        
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {initialData ? '编辑待办' : '新增待办'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Content */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">任务内容</label>
              <div className="relative">
                <div className="absolute top-2.5 left-3 pointer-events-none">
                  <CheckSquare className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="要做什么..."
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                  autoFocus
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">描述 (可选)</label>
              <div className="relative">
                <div className="absolute top-3 left-3 pointer-events-none">
                  <AlignLeft className="h-4 w-4 text-gray-400" />
                </div>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="添加详细描述或备注..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">分类</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Tag className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    list="categories"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="选择或输入"
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                  />
                  <datalist id="categories">
                    {categories.filter(c => c !== '全部').map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">优先级</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Flag className="h-4 w-4 text-gray-400" />
                  </div>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm appearance-none"
                  >
                    <option value="high">高优先级</option>
                    <option value="medium">中优先级</option>
                    <option value="low">低优先级</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* ───── Time Settings ───── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />时间设置</span>
              </label>

              {/* Segmented control */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
                {([['none', '无时间', X], ['allday', '全天', Sun], ['point', '时间点', MapPin], ['range', '时间段', ArrowRight]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTimeModeChange(key as any)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-lg transition-all duration-200
                      ${timeMode === key ? 'bg-white shadow-sm text-gray-800 ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* All-day Date Input */}
              {timeMode === 'allday' && (
                <div>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 pointer-events-none">
                      <Sun className="h-4 w-4 text-amber-400" />
                    </div>
                    <input
                      type="date"
                      value={allDayDateValue}
                      onChange={(e) => setAllDayDateValue(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-amber-50/50 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 ml-1">该事件将占据一整天</p>
                </div>
              )}

              {/* Time Point Input */}
              {timeMode === 'point' && (
                <div>
                  <div className="relative flex items-center">
                    <div className="absolute left-3 pointer-events-none">
                      <Calendar className="h-4 w-4 text-blue-400" />
                    </div>
                    <input
                      type="datetime-local"
                      value={timePointValue}
                      onChange={(e) => setTimePointValue(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-blue-50/50 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 ml-1">选择一个具体的日期和时间</p>
                </div>
              )}

              {/* Time Range Input */}
              {timeMode === 'range' && (
                <div className="space-y-2">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <div className="w-4 h-4 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-emerald-500" /></div>
                    </div>
                    <input type="datetime-local" value={timeStartValue} onChange={(e) => setTimeStartValue(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" />
                  </div>
                  <div className="flex items-center gap-2 px-4">
                    <div className="flex-1 border-t border-dashed border-gray-200" />
                    <span className="text-[10px] text-gray-400 font-medium">至</span>
                    <div className="flex-1 border-t border-dashed border-gray-200" />
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <div className="w-4 h-4 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-rose-500" /></div>
                    </div>
                    <input type="datetime-local" value={timeEndValue} onChange={(e) => setTimeEndValue(e.target.value)} min={timeStartValue}
                      className="w-full pl-9 pr-3 py-2.5 bg-rose-50/50 border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all text-sm" />
                  </div>
                  <p className="text-[10px] text-gray-400 ml-1">选择开始和结束的日期时间</p>
                </div>
              )}
            </div>

            {/* ───── Event Color ───── */}
            {timeMode !== 'none' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  <span className="flex items-center gap-1.5"><Palette className="w-3.5 h-3.5" />事件颜色 (可选)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: '', label: '默认', bg: 'bg-gray-100', ring: 'ring-gray-300' },
                    { value: '#3b82f6', label: '蓝', bg: 'bg-blue-500', ring: 'ring-blue-400' },
                    { value: '#8b5cf6', label: '紫', bg: 'bg-violet-500', ring: 'ring-violet-400' },
                    { value: '#ec4899', label: '粉', bg: 'bg-pink-500', ring: 'ring-pink-400' },
                    { value: '#ef4444', label: '红', bg: 'bg-red-500', ring: 'ring-red-400' },
                    { value: '#f97316', label: '橙', bg: 'bg-orange-500', ring: 'ring-orange-400' },
                    { value: '#eab308', label: '黄', bg: 'bg-yellow-500', ring: 'ring-yellow-400' },
                    { value: '#22c55e', label: '绿', bg: 'bg-green-500', ring: 'ring-green-400' },
                    { value: '#14b8a6', label: '青', bg: 'bg-teal-500', ring: 'ring-teal-400' },
                    { value: '#6b7280', label: '灰', bg: 'bg-gray-500', ring: 'ring-gray-400' },
                  ].map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEventColor(c.value)}
                      className={`w-7 h-7 rounded-full transition-all duration-150 flex items-center justify-center
                        ${c.value === '' ? (eventColor === '' ? 'ring-2 ring-offset-2 ' + c.ring + ' ' + c.bg : c.bg + ' hover:scale-110') : (eventColor === c.value ? 'ring-2 ring-offset-2 ' + c.ring + ' ' + c.bg : c.bg + ' hover:scale-110')}`}
                      title={c.label}
                    >
                      {((c.value === '' && eventColor === '') || eventColor === c.value) && (
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Subtasks */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                子任务 {subtasks.length > 0 && <span className="text-gray-400 normal-case">({completedCount}/{subtasks.length})</span>}
              </label>
              
              <div className="space-y-1.5 bg-gray-50 border border-gray-200 rounded-xl p-3">
                {subtasks.map((st) => (
                  <div key={st.id} className="flex items-center gap-2 group">
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(st.id)}
                      className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                        ${st.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400'}
                      `}
                    >
                      {st.isCompleted && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </button>
                    <input
                      type="text"
                      value={st.content}
                      onChange={(e) => handleSubtaskContentChange(st.id, e.target.value)}
                      className={`flex-1 text-sm bg-transparent border-none outline-none py-0.5 ${st.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(st.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={handleSubtaskKeyDown}
                    placeholder="添加子任务，按 Enter 确认"
                    className="flex-1 text-sm bg-transparent border-none outline-none py-0.5 text-gray-600 placeholder-gray-400"
                  />
                  {newSubtask.trim() && (
                    <button
                      type="button"
                      onClick={handleAddSubtask}
                      className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                    >
                      添加
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-xl shadow-lg shadow-gray-900/20 hover:bg-black hover:scale-105 active:scale-95 transition-all"
              >
                保存
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
