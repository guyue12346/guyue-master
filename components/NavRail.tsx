
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { LayoutGrid, StickyNote, Settings, Terminal, Webhook, ListTodo, FolderOpen, FileText, CheckSquare, Sparkles, Lightbulb, BookOpen, Book, Bot } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { AppMode, ModuleConfig } from '../types';

type SidebarTheme = 'default' | 'vscode' | 'minimal' | 'glass' | 'candy';

interface NavRailProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenSettings: () => void;
  onOpenAgent: () => void;
  isAgentOpen?: boolean;
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
  moduleConfig,
  onReorderModules
}) => {
  
  const [sidebarTheme, setSidebarTheme] = useState<SidebarTheme>(() => (localStorage.getItem('guyue_sidebar_theme') as SidebarTheme) || 'default');

  useEffect(() => {
    const handler = () => setSidebarTheme((localStorage.getItem('guyue_sidebar_theme') as SidebarTheme) || 'default');
    window.addEventListener('storage', handler);
    window.addEventListener('sidebar-theme-change', handler);
    return () => { window.removeEventListener('storage', handler); window.removeEventListener('sidebar-theme-change', handler); };
  }, []);

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

    const btnClass = (() => {
      if (sidebarTheme === 'vscode') {
        return `relative group w-10 h-10 flex items-center justify-center rounded-none transition-all duration-300
          ${isActive ? 'border-l-2 border-white bg-transparent text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}
          ${isBeingDragged ? 'opacity-40 scale-90' : ''}`;
      }
      if (sidebarTheme === 'minimal') {
        return `relative group w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300
          ${isActive ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:bg-gray-200/60 hover:text-gray-700'}
          ${isBeingDragged ? 'opacity-40 scale-90' : ''}`;
      }
      if (sidebarTheme === 'glass') {
        return `relative group w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-300
          ${isActive ? 'bg-white/15 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]' : 'text-gray-400 hover:text-gray-200 hover:bg-white/8'}
          ${isBeingDragged ? 'opacity-40 scale-90' : ''}`;
      }
      if (sidebarTheme === 'candy') {
        return `relative group w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300
          ${isActive ? 'bg-white/25 text-white ring-2 ring-white/40' : 'text-white/70 hover:text-white hover:bg-white/15'}
          ${isBeingDragged ? 'opacity-40 scale-90' : ''}`;
      }
      return `relative group w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300
        ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:bg-white/10 hover:text-white'}
        ${isBeingDragged ? 'opacity-40 scale-90' : ''}`;
    })();

    return (
      <div
        ref={el => { itemRefs.current[idx] = el; }}
        onPointerDown={e => handlePointerDown(e, idx)}
        className="relative cursor-grab active:cursor-grabbing select-none"
      >
        {isDropTarget && <div className="absolute -top-1 left-2 right-2 h-0.5 bg-blue-400 rounded-full z-10" />}
        <button
          onClick={() => { if (!didDrag.current) onModeChange(mode); }}
          className={btnClass}
          title={label}
        >
          <Icon className={`${sidebarTheme === 'default' ? 'w-6 h-6' : 'w-5 h-5'} ${isActive ? 'scale-100' : 'scale-90 group-hover:scale-100 transition-transform'}`} />
          {!isActive && (
            <div className="absolute left-full ml-3 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {label}
            </div>
          )}
        </button>
      </div>
    );
  };

  const railWidth = sidebarTheme === 'vscode' ? 'w-14' : sidebarTheme === 'minimal' ? 'w-16' : sidebarTheme === 'candy' ? 'w-[72px]' : 'w-20';
  const railBg = (() => {
    if (sidebarTheme === 'vscode') return 'bg-[#252526]';
    if (sidebarTheme === 'minimal') return 'bg-[#F3F4F6]';
    if (sidebarTheme === 'glass') return 'bg-[#0f172a]/85 backdrop-blur-2xl border-r border-white/[0.06]';
    if (sidebarTheme === 'candy') return 'bg-gradient-to-b from-pink-500 via-purple-500 to-indigo-600';
    return 'bg-[#1E1E1E]';
  })();

  const settingsBtnClass = (() => {
    if (sidebarTheme === 'vscode') return 'w-10 h-10 flex items-center justify-center rounded-none text-gray-400 hover:bg-white/5 hover:text-white transition-all';
    if (sidebarTheme === 'minimal') return 'w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-200/60 hover:text-gray-700 transition-all';
    if (sidebarTheme === 'glass') return 'w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-all';
    if (sidebarTheme === 'candy') return 'w-10 h-10 flex items-center justify-center rounded-2xl text-white/70 hover:bg-white/15 hover:text-white transition-all';
    return 'w-12 h-12 flex items-center justify-center rounded-2xl text-gray-500 hover:bg-white/10 hover:text-white transition-all';
  })();

  return (
    <div className={`${railWidth} h-full flex-shrink-0 ${railBg} flex flex-col items-center py-6 z-30 shadow-xl transition-all duration-300`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Top Logo — completely outside drag system */}
      <button 
        onClick={() => onModeChange(sortedModules[0]?.id as AppMode || 'todo')}
        className={`${sidebarTheme === 'default' || sidebarTheme === 'glass' ? 'mb-5' : 'mb-8'} relative cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="返回首页"
      >
        {sidebarTheme === 'minimal' ? (
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm overflow-hidden border border-gray-200">
            <div className="flex flex-col items-center justify-center leading-none text-gray-700">
              <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
              <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
            </div>
          </div>
        ) : sidebarTheme === 'glass' ? (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400/25 to-blue-500/25 flex items-center justify-center border border-cyan-400/20 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
            <div className="flex flex-col items-center justify-center leading-none text-cyan-300">
              <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
              <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
            </div>
          </div>
        ) : sidebarTheme === 'candy' ? (
          <div className="w-10 h-10 rounded-2xl bg-white/25 flex items-center justify-center ring-2 ring-white/30">
            <div className="flex flex-col items-center justify-center leading-none text-white">
              <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
              <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
            </div>
          </div>
        ) : (
          <div className={`${sidebarTheme === 'vscode' ? 'w-10 h-10 rounded-md' : 'w-12 h-12 rounded-xl'} bg-gradient-to-b from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-black/20 border border-white/10`}>
            <div className="flex flex-col items-center justify-center leading-none text-gray-200">
              <span className={`font-serif ${sidebarTheme === 'vscode' ? 'text-xs' : 'text-sm'} font-bold -mb-0.5 tracking-widest`}>古</span>
              <span className={`font-serif ${sidebarTheme === 'vscode' ? 'text-xs' : 'text-sm'} font-bold -mt-0.5 tracking-widest`}>月</span>
            </div>
          </div>
        )}
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

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-4 pt-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={onOpenSettings} className={settingsBtnClass} title="设置">
          <Settings className={`${sidebarTheme === 'default' ? 'w-6 h-6' : 'w-5 h-5'}`} />
        </button>
      </div>
    </div>
  );
};
