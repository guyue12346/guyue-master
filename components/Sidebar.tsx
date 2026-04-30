
import React from 'react';
import { Settings2, FileText } from 'lucide-react';
import { Category, AppMode, FileRecord } from '../types';
import * as LucideIcons from 'lucide-react';

interface SidebarProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (categoryName: string) => void;
  onOpenManager: () => void;
  totalCount: number;
  appMode: AppMode;
  // New props for Renderer mode
  files?: FileRecord[];
  activeFileId?: string | null;
  onSelectFile?: (fileId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  categories, 
  selectedCategory, 
  onSelectCategory, 
  onOpenManager,
  totalCount,
  appMode,
  files = [],
  activeFileId,
  onSelectFile
}) => {
  
  // Helper to dynamically get the icon component
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName] || LucideIcons.Folder;
    return Icon;
  };

  // Separate System ("All") and User categories
  const systemCategory = categories.find(c => c.id === 'all' || c.name === '全部');
  const userCategories = categories.filter(c => c.id !== 'all' && c.name !== '全部' && !c.isSystem);

  const renderFileItems = (categoryName: string) => {
    if (appMode !== 'renderer' || !files || !onSelectFile) return null;
    
    // Don't show files under 'All' category
    if (categoryName === '全部') return null;

    const categoryFiles = files.filter(f => 
      (categoryName === '全部' || f.category === categoryName) &&
      ['md', 'txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'pdf'].includes(f.type.toLowerCase().replace('.', ''))
    );

    if (categoryFiles.length === 0) return null;

    // Only show files if the category is selected
    // if (selectedCategory !== categoryName) return null;

    return (
      <div className="ml-4 mt-1 space-y-0.5 pl-2" style={{ borderLeft: '1px solid var(--t-border-light)' }}>
        {categoryFiles.map(file => (
          <button
            key={file.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectFile(file.id);
            }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors truncate ${activeFileId === file.id ? 'theme-list-item-active font-medium' : 'theme-list-item'}`}
            title={file.name}
          >
            <FileText className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{file.name}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderCategoryItem = (cat: Category) => {
    const IconComponent = getIcon(cat.icon);
    const isSelected = selectedCategory === cat.name;
    const iconColor = cat.color
      ? { color: cat.color }
      : undefined;

    return (
      <div key={cat.id} className="mb-1">
        <button
          onClick={() => onSelectCategory(cat.name)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-200 group relative ${isSelected ? 'theme-list-item theme-list-item-active font-medium' : 'theme-list-item'}`}
        >
          <IconComponent
            className="w-4 h-4 transition-colors"
            style={iconColor ?? (!cat.color ? { color: isSelected ? 'var(--t-accent)' : 'var(--t-text-muted)' } : undefined)}
          />
          <span className="flex-1 text-left truncate">{cat.name}</span>
          {(cat.id === 'all' || cat.isSystem) && (
            <span className={`text-[10px] py-0.5 px-2 rounded-md transition-colors ${isSelected ? 'theme-muted-badge' : ''}`} style={!isSelected ? { color: 'var(--t-text-muted)' } : undefined}>
              {totalCount}
            </span>
          )}
        </button>
        {renderFileItems(cat.name)}
      </div>
    );
  };

  const isNotes = appMode === 'notes';
  const isPrompts = appMode === 'prompts';
  
  const getModeTitle = () => {
    switch (appMode) {
      case 'notes': return 'NoteMaster';
      case 'ssh': return 'SSHManager';
      case 'api': return 'APIManager';
      case 'todo': return 'TodoMaster';
      case 'files': return 'FileManager';
      case 'prompts': return 'Skills';
      case 'renderer': return 'Reader';
      case 'image-hosting': return 'ImageHost';
      default: return 'LinkMaster';
    }
  };

  const getModeSubtitle = () => {
    switch (appMode) {
      case 'notes': return '灵感与记录';
      case 'ssh': return '终端与连接';
      case 'api': return '接口与密钥';
      case 'todo': return '任务与日程';
      case 'files': return '文件管理';
      case 'prompts': return '提示词库';
      case 'renderer': return '文件其它';
      case 'image-hosting': return '图床管理';
      default: return '收藏与管理';
    }
  };

  return (
    <div className="theme-sidebar-surface w-60 h-full flex-shrink-0 flex flex-col pt-6 pb-4 px-3 z-20">

      {/* Context Header - Draggable Area */}
      <div className="px-2 mb-6" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--t-text)' }}>
          {getModeTitle()}
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--t-text-muted)' }}>
          {getModeSubtitle()}
        </p>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 transition-all duration-300">
        
        {/* Header / Actions */}
        <div className="flex items-center justify-between px-3 mb-2 group shrink-0 h-6">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--t-text-muted)' }}>
            {isNotes ? '月份归档' : isPrompts ? 'Prompt 分类' : '分类'}
          </p>
          
          {/* Only show manager for non-note modes, as notes use auto-generated dates */}
          {!isNotes && (
            <button 
              onClick={onOpenManager}
              className="theme-icon-btn opacity-0 group-hover:opacity-100 transition-all p-1"
              title="管理 & 排序"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        
        {/* Category List */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-0.5 pr-1 overscroll-y-contain">
          {userCategories.length > 0 ? (
            userCategories.map(renderCategoryItem)
          ) : (
            <div className="text-xs text-center py-8" style={{ color: 'var(--t-text-muted)' }}>
              {isNotes ? '暂无历史便签' : isPrompts ? '暂无 Prompt 分类' : '暂无分类'}
            </div>
          )}
        </div>

        {/* System Category at Bottom */}
        <div className="mt-4 pt-2" style={{ borderTop: '1px solid var(--t-border-light)' }}>
          <div className="space-y-1">
             {systemCategory && renderCategoryItem(systemCategory)}
          </div>
        </div>
      </div>
    </div>
  );
};
