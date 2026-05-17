import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { LayoutGrid, StickyNote, Settings, Terminal, Webhook, ListTodo, FolderOpen, FileText, CheckSquare, Sparkles, Lightbulb, BookOpen, Book, Bot, Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { AppMode, ModuleConfig } from '../types';

interface NavRailProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenSettings: () => void;
  onOpenAgent: () => void;
  isAgentOpen?: boolean;
  agentActivity?: {
    stage: string;
    status: string;
    title: string;
    active: boolean;
    isProcessing?: boolean;
  };
  statusIsland?: {
    kind: 'music' | 'agent' | 'generic';
    active: boolean;
    open: boolean;
    progress: number;
    title: string;
    subtitle?: string;
    cover?: string;
    lyricLines?: string[];
    accent?: string;
    isPlaying?: boolean;
    disabled?: boolean;
    onOpen?: () => void;
    onTogglePlay?: () => void;
    onPrev?: () => void;
    onNext?: () => void;
  };
  onToggleStatusIsland?: () => void;
  moduleConfig: ModuleConfig[];
  onReorderModules?: (reordered: ModuleConfig[]) => void;
}

const ICON_MAP: Record<string, any> = {
  'LayoutGrid': LayoutGrid,
  'FileText': FileText, 
  'StickyNote': StickyNote,
  'Terminal': Terminal,
  'Webhook': Webhook,
  'CheckSquare': ListTodo, 
  'ListTodo': ListTodo,
  'FolderOpen': FolderOpen,
  'Sparkles': Sparkles,
  'Lightbulb': Lightbulb,
  'BookOpen': BookOpen,
  'Book': Book,
  'Bot': Bot,
};

export const NavRail: React.FC<NavRailProps> = ({ 
  currentMode, 
  onModeChange,
  onOpenSettings,
  onOpenAgent,
  isAgentOpen = false,
  agentActivity,
  statusIsland,
  onToggleStatusIsland,
  moduleConfig,
  onReorderModules
}) => {
  const getIcon = (iconName: string) => {
    if (ICON_MAP[iconName]) return ICON_MAP[iconName];
    const DynamicIcon = (LucideIcons as any)[iconName];
    return DynamicIcon || LayoutGrid;
  };
  
  const sortedModules = useMemo(() => {
    return [...moduleConfig]
      .filter(m => m.enabled)
      .sort((a, b) => a.priority - b.priority);
  }, [moduleConfig]);

  const agentIsActive = Boolean(agentActivity?.active || agentActivity?.isProcessing);
  const agentGlowColor = (() => {
    const stage = String(agentActivity?.stage || '').toLowerCase();
    const status = String(agentActivity?.status || '').toLowerCase();
    if (status.includes('error') || stage.includes('error')) return '#ef4444';
    if (stage.includes('approval') || status.includes('user')) return '#f97316';
    if (stage.includes('execution')) return '#3b82f6';
    if (stage.includes('verification') || stage.includes('inspection') || stage.includes('reporting')) return '#10b981';
    if (stage.includes('reflection')) return '#f59e0b';
    if (stage.includes('routing') || stage.includes('planning') || stage.includes('decision')) return '#8b5cf6';
    return isAgentOpen ? '#6366f1' : '#94a3b8';
  })();
  const clampProgress = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const statusProgress = clampProgress(statusIsland?.progress || 0);
  const statusAccent = statusIsland?.accent || '#22d3ee';
  const isStatusRailOpen = Boolean(statusIsland?.open && statusIsland.active);
  const StatusIcon = statusIsland?.kind === 'agent' ? Bot : statusIsland?.kind === 'music' ? Music : Sparkles;
  const statusLyricLines = (statusIsland?.lyricLines || [])
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  // Pointer-based vertical-only drag reorder with threshold
  const DRAG_THRESHOLD = 8;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragCloneRef = useRef<HTMLDivElement | null>(null);
  const didDrag = useRef(false);
  const dragStartLeft = useRef<number>(0);
  const dragStartY = useRef<number>(0);
  const dragPending = useRef(false);
  const dragPendingIdx = useRef<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const overIdxRef = useRef<number | null>(null);
  const sortedModulesRef = useRef(sortedModules);
  sortedModulesRef.current = sortedModules;
  const moduleConfigRef = useRef(moduleConfig);
  moduleConfigRef.current = moduleConfig;
  const onReorderRef = useRef(onReorderModules);
  onReorderRef.current = onReorderModules;

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    // Do NOT call e.preventDefault() — it suppresses click events in Chromium
    dragStartY.current = e.clientY;
    dragPending.current = true;
    dragPendingIdx.current = idx;
    didDrag.current = false;
    const el = itemRefs.current[idx];
    if (el) dragStartLeft.current = el.getBoundingClientRect().left;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Active drag — update clone position & drop target
      if (dragIdxRef.current !== null) {
        const clone = dragCloneRef.current;
        if (clone) {
          clone.style.left = `${dragStartLeft.current}px`;
          clone.style.top = `${e.clientY - 24}px`;
        }
        for (let i = 0; i < itemRefs.current.length; i++) {
          const ref = itemRefs.current[i];
          if (ref) {
            const rect = ref.getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
              overIdxRef.current = i;
              setOverIdx(i);
              break;
            }
          }
        }
        return;
      }
      // Pending — check if threshold exceeded to start drag
      if (dragPending.current && dragPendingIdx.current !== null) {
        if (Math.abs(e.clientY - dragStartY.current) < DRAG_THRESHOLD) return;
        const idx = dragPendingIdx.current;
        didDrag.current = true;
        dragIdxRef.current = idx;
        overIdxRef.current = idx;
        setDragIdx(idx);
        setOverIdx(idx);
        dragPending.current = false;
        const el = itemRefs.current[idx];
        if (el) {
          const rect = el.getBoundingClientRect();
          const clone = el.cloneNode(true) as HTMLDivElement;
          Object.assign(clone.style, {
            position: 'fixed', left: `${dragStartLeft.current}px`, top: `${rect.top}px`,
            width: `${rect.width}px`, pointerEvents: 'none', zIndex: '9999',
            opacity: '0.85', transition: 'none',
          });
          document.body.appendChild(clone);
          dragCloneRef.current = clone;
        }
      }
    };
    const onUp = () => {
      const di = dragIdxRef.current;
      const oi = overIdxRef.current;
      if (di !== null && oi !== null && di !== oi && onReorderRef.current) {
        const reordered = [...sortedModulesRef.current];
        const [moved] = reordered.splice(di, 1);
        reordered.splice(oi, 0, moved);
        const updated = moduleConfigRef.current.map(m => {
          const newIndex = reordered.findIndex(r => r.id === m.id);
          return newIndex >= 0 ? { ...m, priority: newIndex + 1 } : m;
        });
        onReorderRef.current(updated);
      }
      if (dragCloneRef.current) { dragCloneRef.current.remove(); dragCloneRef.current = null; }
      dragIdxRef.current = null;
      overIdxRef.current = null;
      dragPending.current = false;
      dragPendingIdx.current = null;
      setDragIdx(null);
      setOverIdx(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
  }, []);

  const NavItem = ({ mode, icon: Icon, label, idx }: { mode: AppMode; icon: any; label: string; idx: number }) => {
    const isActive = currentMode === mode;
    const isBeingDragged = dragIdx === idx;
    const isDropTarget = overIdx === idx && dragIdx !== null && dragIdx !== idx;

    return (
      <div
        ref={el => { itemRefs.current[idx] = el; }}
        onPointerDown={e => handlePointerDown(e, idx)}
        className="relative cursor-grab active:cursor-grabbing select-none"
      >
        {isDropTarget && <div className="absolute -top-1 left-2 right-2 h-0.5 rounded-full z-10" style={{ background: 'var(--t-accent)' }} />}
        <button
          onClick={() => { if (!didDrag.current) onModeChange(mode); }}
          className={`theme-rail-item group transition-all duration-300 ${isActive ? 'theme-rail-item-active' : ''} ${isBeingDragged ? 'opacity-40 scale-90' : ''}`}
          title={label}
        >
          <Icon
            className={`w-5 h-5 ${isActive ? 'scale-100' : 'scale-90 group-hover:scale-100 transition-transform'}`}
          />
          {!isActive && (
            <div className="theme-tooltip absolute left-full ml-3 px-2 py-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {label}
            </div>
          )}
        </button>
      </div>
    );
  };

  const StatusRailContent = () => (
    <>
      <div
        className="flex-1 min-h-0 w-full flex flex-col items-center gap-3"
        style={{ WebkitAppRegion: 'no-drag', '--status-progress': `${statusProgress * 100}%`, '--status-accent': statusAccent } as React.CSSProperties}
      >
        <button
          onClick={statusIsland?.onOpen}
          className="theme-rail-status-cover"
          title={statusIsland?.title || '打开状态模块'}
        >
          {statusIsland?.cover ? (
            <img src={statusIsland.cover} alt="" className="h-full w-full rounded-[inherit] object-cover" />
          ) : (
            <StatusIcon className="w-5 h-5" />
          )}
        </button>

        <div className="theme-rail-status-pipe" title={`${Math.round(statusProgress * 100)}%`}>
          <div className={`theme-rail-status-pipe-fill ${statusProgress <= 0 ? 'is-empty' : ''}`}>
            <span className="theme-rail-status-pipe-wave" />
            <span className="theme-rail-status-pipe-stream" />
          </div>
        </div>

        <div className="theme-rail-status-caption" title={statusIsland?.title || ''}>
          <span>{statusIsland?.title || '状态'}</span>
        </div>

        {statusLyricLines.length > 0 && (
          <div className="theme-rail-status-lyrics" aria-label="当前歌词">
            {statusLyricLines.map((line, index) => (
              <span
                key={`${index}-${line}`}
                className={index === 0 ? 'is-current' : ''}
                title={line}
              >
                {line}
              </span>
            ))}
          </div>
        )}

        <div className="theme-rail-status-controls">
          <button onClick={statusIsland?.onPrev} disabled={!statusIsland?.onPrev} title="上一首">
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button onClick={statusIsland?.onTogglePlay} disabled={!statusIsland?.onTogglePlay} title={statusIsland?.isPlaying ? '暂停' : '播放'}>
            {statusIsland?.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <button onClick={statusIsland?.onNext} disabled={!statusIsland?.onNext} title="下一首">
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="theme-rail-shell h-full flex-shrink-0 flex flex-col items-center py-6 z-30 transition-all duration-300"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {isStatusRailOpen ? (
        <StatusRailContent />
      ) : (
        <>
          {/* Top Logo — completely outside drag system */}
          <button
            onClick={() => agentIsActive || isAgentOpen ? onOpenAgent() : onModeChange(sortedModules[0]?.id as AppMode || 'todo')}
            className="mb-6 relative cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200"
            style={{ WebkitAppRegion: 'no-drag', '--agent-glow-color': agentGlowColor } as React.CSSProperties}
            title={agentIsActive || isAgentOpen ? (agentActivity?.title || '打开 Agent') : '返回首页'}
          >
            <div className={`theme-logo-mark ${agentIsActive ? 'agent-logo-active' : isAgentOpen ? 'agent-logo-open' : ''}`}>
              <div className="theme-logo-glyph text-sm">
                <span>古</span>
                <span>月</span>
              </div>
            </div>
          </button>

          {/* Main Nav Items */}
          <div className="flex-1 flex flex-col gap-2 w-full items-center overflow-y-auto overflow-x-hidden min-h-0" style={{ WebkitAppRegion: 'no-drag', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            {sortedModules.map((module, idx) => {
              const Icon = getIcon(module.icon);
              return (
                <NavItem key={module.id} mode={module.id as AppMode} icon={Icon} label={module.name} idx={idx} />
              );
            })}
          </div>
        </>
      )}

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-4 pt-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {statusIsland && onToggleStatusIsland && (
          <button
            onClick={onToggleStatusIsland}
            disabled={statusIsland.disabled}
            className={`theme-rail-status-island ${statusIsland.open ? 'is-open' : ''} ${statusIsland.active ? 'is-live' : ''}`}
            style={{ '--status-progress': `${Math.max(0, Math.min(1, statusIsland.progress || 0)) * 100}%` } as React.CSSProperties}
            title={statusIsland.open ? '收起状态岛' : statusIsland.title}
          >
            <span className="theme-rail-status-glow" />
            {statusIsland.open ? <LayoutGrid className="w-4 h-4 relative z-10" /> : <StatusIcon className="w-4 h-4 relative z-10" />}
            <span className="theme-rail-status-level" />
          </button>
        )}
        <button onClick={onOpenSettings} className="theme-rail-item transition-all duration-300" title="设置">
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
