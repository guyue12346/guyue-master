
import React from 'react';
import { FileText, Calendar, ListChecks, Repeat2 } from 'lucide-react';

export type TodoSubMode = 'plan' | 'schedule' | 'tasks' | 'recurring';

interface TodoSidebarProps {
  subMode: TodoSubMode;
  onSubModeChange: (mode: TodoSubMode) => void;
  recurringCount?: number;
}

const SUB_MODES: { key: TodoSubMode; label: string; icon: React.FC<any>; desc: string }[] = [
  { key: 'plan', label: '总体规划', icon: FileText, desc: '目标与蓝图' },
  { key: 'schedule', label: '日程表', icon: Calendar, desc: '日 / 周 / 月视图' },
  { key: 'tasks', label: '具体事项', icon: ListChecks, desc: '待办任务列表' },
  { key: 'recurring', label: '重复事件', icon: Repeat2, desc: '循环日程管理' },
];

export const TodoSidebar: React.FC<TodoSidebarProps> = ({
  subMode,
  onSubModeChange,
  recurringCount = 0,
}) => {
  return (
    <div className="w-60 h-full flex-shrink-0 bg-macOS-sidebar backdrop-blur-xl border-r border-macOS-border flex flex-col pt-6 pb-4 px-3 z-20">
      {/* Header */}
      <div className="px-2 mb-6" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-xl font-bold text-gray-800 tracking-tight">TodoMaster</h2>
        <p className="text-xs text-gray-400 mt-1">任务与日程</p>
      </div>

      {/* Sub-mode navigation */}
      <div className="flex-1 px-1">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">模块</p>
        <div className="space-y-0.5">
          {SUB_MODES.map(({ key, label, icon: Icon, desc }) => {
            const isActive = subMode === key;
            return (
              <button
                key={key}
                onClick={() => onSubModeChange(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group relative
                  ${isActive
                    ? 'bg-white shadow-sm text-gray-900 font-medium'
                    : 'text-gray-600 hover:bg-black/5 hover:text-gray-900'
                  }`}
              >
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <div className="flex-1 text-left">
                  <div className="truncate">{label}</div>
                  <div className={`text-[10px] mt-0.5 ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>{desc}</div>
                </div>
                {key === 'recurring' && recurringCount > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
                  }`}>{recurringCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
