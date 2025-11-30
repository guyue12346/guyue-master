
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
      <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
        {categoryFiles.map(file => (
          <button
            key={file.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectFile(file.id);
            }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors truncate
              ${activeFileId === file.id
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}
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

    return (
      <div key={cat.id} className="mb-1">
        <button
          onClick={() => onSelectCategory(cat.name)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group relative
            ${isSelected
              ? 'bg-white shadow-sm text-gray-900 font-medium' 
              : 'text-gray-600 hover:bg-black/5 hover:text-gray-900'
            }`}
        >
          <IconComponent className={`w-4 h-4 transition-colors ${isSelected ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}`} />
          <span className="flex-1 text-left truncate">{cat.name}</span>
          {(cat.id === 'all' || cat.isSystem) && (
            <span className={`text-[10px] py-0.5 px-2 rounded-md transition-colors ${isSelected ? 'bg-gray-100 text-gray-600' : 'bg-transparent text-gray-400 group-hover:bg-white/50'}`}>
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
      case 'prompts': return 'PromptLab';
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
      case 'files': return '重要文件归档';
      case 'prompts': return '提示词库';
      case 'renderer': return '文件阅读';
      case 'image-hosting': return '图床管理';
      default: return '收藏与管理';
    }
  };

  return (
    <div className="w-60 h-full flex-shrink-0 bg-macOS-sidebar backdrop-blur-xl border-r border-macOS-border flex flex-col pt-6 pb-4 px-3 z-20">

      {/* Context Header - Draggable Area */}
      <div className="px-2 mb-6" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-xl font-bold text-gray-800 tracking-tight">
          {getModeTitle()}
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          {getModeSubtitle()}
        </p>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 transition-all duration-300">
        
        {/* Header / Actions */}
        <div className="flex items-center justify-between px-3 mb-2 group shrink-0 h-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            {isNotes ? '月份归档' : isPrompts ? 'Prompt 分类' : '分类'}
          </p>
          
          {/* Only show manager for non-note modes, as notes use auto-generated dates */}
          {!isNotes && (
            <button 
              onClick={onOpenManager}
              className="text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-gray-200/50 rounded"
              title="管理 & 排序"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        
        {/* Category List */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300 pr-1 overscroll-y-contain">
          {userCategories.length > 0 ? (
            userCategories.map(renderCategoryItem)
          ) : (
            <div className="text-xs text-gray-400 text-center py-8">
              {isNotes ? '暂无历史便签' : isPrompts ? '暂无 Prompt 分类' : '暂无分类'}
            </div>
          )}
        </div>

        {/* System Category at Bottom */}
        <div className="mt-4 pt-2 border-t border-gray-200/50">
          <div className="space-y-1">
             {systemCategory && renderCategoryItem(systemCategory)}
          </div>
        </div>
      </div>
    </div>
  );
};
