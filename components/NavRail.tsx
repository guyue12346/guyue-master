
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

  // Pointer-based vertical-only drag reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragCloneRef = useRef<HTMLDivElement | null>(null);
  const didDrag = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragIdx(idx);
    setOverIdx(idx);
    didDrag.current = false;

    const el = itemRefs.current[idx];
    if (el) {
      const rect = el.getBoundingClientRect();
      const clone = el.cloneNode(true) as HTMLDivElement;
      clone.style.position = 'fixed';
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '9999';
      clone.style.opacity = '0.85';
      clone.style.transition = 'none';
      document.body.appendChild(clone);
      dragCloneRef.current = clone;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx === null) return;
    didDrag.current = true;
    const clone = dragCloneRef.current;
    if (clone) {
      const el = itemRefs.current[dragIdx];
      if (el) clone.style.left = `${el.getBoundingClientRect().left}px`;
      clone.style.top = `${e.clientY - 24}px`;
    }
    for (let i = 0; i < itemRefs.current.length; i++) {
      const ref = itemRefs.current[i];
      if (ref) {
        const rect = ref.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          setOverIdx(i);
          break;
        }
      }
    }
  }, [dragIdx]);

  const handlePointerUp = useCallback(() => {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx && onReorderModules) {
      const reordered = [...sortedModules];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(overIdx, 0, moved);
      const updated = moduleConfig.map(m => {
        const newIndex = reordered.findIndex(r => r.id === m.id);
        return newIndex >= 0 ? { ...m, priority: newIndex + 1 } : m;
      });
      onReorderModules(updated);
    }
    if (dragCloneRef.current) {
      dragCloneRef.current.remove();
      dragCloneRef.current = null;
    }
    setDragIdx(null);
    setOverIdx(null);
  }, [dragIdx, overIdx, sortedModules, moduleConfig, onReorderModules]);

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
          ${isActive ? 'bg-white/30 border-l-2 border-blue-400 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}
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
  const railBg = sidebarTheme === 'vscode' ? 'bg-[#252526]' : sidebarTheme === 'minimal' ? 'bg-[#F3F4F6]' : sidebarTheme === 'glass' ? 'bg-white/20 backdrop-blur-xl' : sidebarTheme === 'candy' ? 'bg-gradient-to-b from-pink-500 via-purple-500 to-indigo-600' : 'bg-[#1E1E1E]';

  const settingsBtnClass = (() => {
    if (sidebarTheme === 'vscode') return 'w-10 h-10 flex items-center justify-center rounded-none text-gray-400 hover:bg-white/5 hover:text-white transition-all';
    if (sidebarTheme === 'minimal') return 'w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-200/60 hover:text-gray-700 transition-all';
    if (sidebarTheme === 'glass') return 'w-10 h-10 flex items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-all';
    if (sidebarTheme === 'candy') return 'w-10 h-10 flex items-center justify-center rounded-2xl text-white/70 hover:bg-white/15 hover:text-white transition-all';
    return 'w-12 h-12 flex items-center justify-center rounded-2xl text-gray-500 hover:bg-white/10 hover:text-white transition-all';
  })();

  return (
    <div className={`${railWidth} h-full flex-shrink-0 ${railBg} flex flex-col items-center py-6 z-30 shadow-xl transition-all duration-300`}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Top Logo */}
      <button 
        onClick={() => onModeChange(sortedModules[0]?.id as AppMode || 'todo')}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={`${sidebarTheme === 'default' ? 'mb-5' : 'mb-8'} relative cursor-pointer hover:scale-105 transition-transform duration-200`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="返回首页"
      >
        {sidebarTheme === 'minimal' ? (
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm overflow-hidden border border-gray-200 transition-all duration-300">
            <div className="flex flex-col items-center justify-center leading-none z-10 text-gray-700">
              <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
              <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
            </div>
          </div>
        ) : sidebarTheme === 'glass' ? (
          <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden border border-white/30 transition-all duration-300">
            <div className="flex flex-col items-center justify-center leading-none z-10 text-white">
              <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
              <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
            </div>
          </div>
        ) : sidebarTheme === 'candy' ? (
          <div className="w-10 h-10 rounded-2xl bg-white/25 flex items-center justify-center overflow-hidden ring-2 ring-white/30 transition-all duration-300">
            <div className="flex flex-col items-center justify-center leading-none z-10 text-white">
              <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
              <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
            </div>
          </div>
        ) : (
          <div className={`${sidebarTheme === 'vscode' ? 'w-10 h-10 rounded-md' : 'w-12 h-12 rounded-xl'} bg-gradient-to-b from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-black/20 overflow-hidden border border-white/10 transition-all duration-300`}>
            <div className="flex flex-col items-center justify-center leading-none z-10 text-gray-200">
              <span className={`font-serif ${sidebarTheme === 'vscode' ? 'text-xs' : 'text-sm'} font-bold -mb-0.5 tracking-widest text-shadow-sm`}>古</span>
              <span className={`font-serif ${sidebarTheme === 'vscode' ? 'text-xs' : 'text-sm'} font-bold -mt-0.5 tracking-widest text-shadow-sm`}>月</span>
            </div>
          </div>
        )}
      </button>

      {/* Main Nav Items */}
      <div className="flex-1 flex flex-col gap-2 w-full items-center overflow-y-auto no-scrollbar min-h-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {sortedModules.map((module, idx) => {
          const Icon = getIcon(module.icon);
          const label = module.name;
          return (
            <NavItem 
              key={module.id}
              mode={module.id as AppMode}
              icon={Icon} 
              label={label}
              idx={idx}
            />
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-4 pt-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onOpenSettings}
          className={settingsBtnClass}
          title="设置"
        >
          <Settings className={`${sidebarTheme === 'default' ? 'w-6 h-6' : 'w-5 h-5'}`} />
        </button>
      </div>
    </div>
  );
};
