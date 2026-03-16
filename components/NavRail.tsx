
import React, { useMemo } from 'react';
import { LayoutGrid, StickyNote, Settings, Terminal, Webhook, ListTodo, FolderOpen, FileText, CheckSquare, Sparkles, Lightbulb, BookOpen, Book, Bot } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { AppMode, ModuleConfig } from '../types';

interface NavRailProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenSettings: () => void;
  onOpenAgent: () => void;
  isAgentOpen?: boolean;
  moduleConfig: ModuleConfig[];
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
  moduleConfig
}) => {
  
  // Helper to dynamically get the icon component
  const getIcon = (iconName: string) => {
    // First check our explicit map
    if (ICON_MAP[iconName]) return ICON_MAP[iconName];
    
    // Then try to find it in lucide-react exports
    const DynamicIcon = (LucideIcons as any)[iconName];
    return DynamicIcon || LayoutGrid;
  };
  
  const sortedModules = useMemo(() => {
    return [...moduleConfig]
      .filter(m => m.enabled)
      .sort((a, b) => a.priority - b.priority);
  }, [moduleConfig]);

  const NavItem = ({ mode, icon: Icon, label }: { mode: AppMode; icon: any; label: string }) => {
    const isActive = currentMode === mode;
    return (
      <button
        onClick={() => onModeChange(mode)}
        className={`relative group w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300
          ${isActive 
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
            : 'text-gray-400 hover:bg-white/10 hover:text-white'
          }
        `}
        title={label}
      >
        <Icon className={`w-6 h-6 ${isActive ? 'scale-100' : 'scale-90 group-hover:scale-100 transition-transform'}`} />
        
        {/* Tooltip-ish indicator for inactive */}
        {!isActive && (
          <div className="absolute left-full ml-3 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            {label}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="w-20 h-full flex-shrink-0 bg-[#1E1E1E] flex flex-col items-center py-6 z-30 shadow-xl" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Top Logo */}
      <div 
        className="mb-8 relative" 
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-slate-700 to-slate-900 flex items-center justify-center shadow-lg shadow-black/20 overflow-hidden border border-white/10 transition-all duration-300">
           {/* Characters */}
           <div className="flex flex-col items-center justify-center leading-none z-10 text-gray-200">
             <span className="font-serif text-sm font-bold -mb-0.5 tracking-widest text-shadow-sm">古</span>
             <span className="font-serif text-sm font-bold -mt-0.5 tracking-widest text-shadow-sm">月</span>
           </div>
        </div>
      </div>

      {/* Main Nav Items */}
      <div className="flex-1 flex flex-col gap-4 w-full items-center overflow-y-auto no-scrollbar min-h-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {sortedModules.map(module => {
          const Icon = getIcon(module.icon);
          const label = module.name;

          if (module.id === 'agent') {
            return (
              <NavItem
                key="agent"
                mode="agent"
                icon={Icon}
                label={label}
              />
            );
          }

          return (
            <NavItem 
              key={module.id}
              mode={module.id} 
              icon={Icon} 
              label={label} 
            />
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col gap-4 pt-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onOpenSettings}
          className="w-12 h-12 flex items-center justify-center rounded-2xl text-gray-500 hover:bg-white/10 hover:text-white transition-all"
          title="设置"
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
