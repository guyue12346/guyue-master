
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
    <div className="theme-sidebar-surface w-60 h-full flex-shrink-0 flex flex-col pt-6 pb-4 px-3 z-20">
      {/* Header */}
      <div className="px-2 mb-6" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--t-text)' }}>TodoMaster</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--t-text-muted)' }}>任务与日程</p>
      </div>

      {/* Sub-mode navigation */}
      <div className="flex-1 px-1">
        <p className="text-xs font-bold uppercase tracking-wider px-2 mb-2" style={{ color: 'var(--t-text-muted)' }}>模块</p>
        <div className="space-y-0.5">
          {SUB_MODES.map(({ key, label, icon: Icon, desc }) => {
            const isActive = subMode === key;
            return (
              <button
                key={key}
                onClick={() => onSubModeChange(key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-200 group relative ${isActive ? 'theme-list-item theme-list-item-active font-medium' : 'theme-list-item'}`}
              >
                <Icon className="w-4 h-4 transition-colors" style={{ color: isActive ? 'var(--t-accent)' : 'var(--t-text-muted)' }} />
                <div className="flex-1 text-left">
                  <div className="truncate">{label}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: isActive ? 'var(--t-text-secondary)' : 'var(--t-text-muted)' }}>{desc}</div>
                </div>
                {key === 'recurring' && recurringCount > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isActive ? 'theme-muted-badge' : ''}`} style={!isActive ? { background: 'var(--t-chip-bg)', color: 'var(--t-chip-text)' } : undefined}>{recurringCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
