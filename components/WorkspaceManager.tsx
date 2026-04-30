import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  ArrowRightLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns,
  Edit2,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  GripVertical,
  Layers,
  Link,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Square,
  TerminalSquare,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MarkdownEditor } from './MarkdownEditor';
import { Terminal as TerminalComponent } from './Terminal';
import { MiniBrowser } from './MiniBrowser';
import { ConfirmDialog } from './ConfirmDialog';
import { FloatingChatWindow } from './FloatingChatWindow';
import { MarkdownNote } from '../types';
import { AVAILABLE_COLORS, AVAILABLE_ICONS, colorMap, getCategoryIcon } from './LearningConstants';

const KnowledgeBase = React.lazy(() => import('./KnowledgeBase').then(m => ({ default: m.KnowledgeBase })));

type WorkspaceItemType = 'markdown' | 'link' | 'links' | 'file';

interface WorkspaceLinkEntry {
  id: string;
  title: string;
  url: string;
}

interface WorkspaceItem {
  id: string;
  title: string;
  type: WorkspaceItemType;
  content: string;
  icon?: string;
  color?: string;
  updatedAt: number;
}

interface WorkspaceModule {
  id: string;
  title: string;
  description: string;
  icon?: string;
  color?: string;
  items: WorkspaceItem[];
}

interface WorkspaceSection {
  id: string;
  title: string;
  icon: string;
  color: string;
  modules: WorkspaceModule[];
}

interface WorkspaceCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  priority?: number;
}

interface WorkspaceData {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  modules: WorkspaceModule[];
  customSections?: WorkspaceSection[];
  primarySectionTitle?: string;
  primarySectionIcon?: string;
  primarySectionColor?: string;
  primarySectionEnabled?: boolean;
  icon?: string;
  color?: string;
  priority?: number;
}

interface WorkspacePaneContent {
  type: 'item' | 'module' | 'terminal' | 'markdown';
  id?: string;
  moduleId?: string;
  itemId?: string;
  data?: MarkdownNote;
}

interface ConfirmState {
  title: string;
  message: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
}

const STORAGE_KEY_WORKSPACE_CATEGORIES = 'workspace_categories_v1';
const STORAGE_KEY_WORKSPACES = 'workspace_spaces_v1';
const STORAGE_KEY_WORKSPACE_SIDEBAR_WIDTH = 'workspace_sidebar_width_v1';
const STORAGE_KEY_WORKSPACE_SIDEBAR_COLLAPSED = 'workspace_sidebar_collapsed_v1';

const DEFAULT_WORKSPACE_CATEGORIES: WorkspaceCategory[] = [
  {
    id: 'workspace-default',
    name: '工作台',
    description: '项目、方案与执行内容',
    icon: 'Layers',
    color: 'blue',
    priority: 1,
  },
];

const DEFAULT_WORKSPACES: WorkspaceData[] = [
  {
    id: 'workspace-default-space',
    title: '默认工作空间',
    description: '在这里整理项目文档、链接、文件与执行内容。',
    categoryId: 'workspace-default',
    icon: 'Layers',
    color: 'blue',
    priority: 1,
    modules: [],
    customSections: [],
    primarySectionTitle: '工作目录',
    primarySectionIcon: 'FolderOpen',
    primarySectionColor: 'blue',
    primarySectionEnabled: true,
  },
];

const createDefaultMarkdown = (title: string) => `# ${title}\n\n`;

const createLinkEntry = (): WorkspaceLinkEntry => ({
  id: `workspace-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  url: '',
});

const isLikelyMarkdownFilePath = (value: string) =>
  value.startsWith('/') || value.startsWith('file://') || /^[A-Za-z]:[\\/]/.test(value) || value.toLowerCase().endsWith('.md');

const getColorPalette = (color?: string) => colorMap[color || 'blue'] || colorMap.blue;

const getDefaultItemIcon = (type: WorkspaceItemType) => {
  switch (type) {
    case 'markdown':
      return 'FileCode';
    case 'file':
      return 'Box';
    case 'links':
      return 'Layers';
    default:
      return 'Globe';
  }
};

const parseWorkspaceLinks = (content: string): WorkspaceLinkEntry[] => {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry, index) => ({
        id: String(entry?.id || `workspace-link-imported-${index}`),
        title: String(entry?.title || ''),
        url: String(entry?.url || ''),
      }))
      .filter(entry => entry.title || entry.url);
  } catch {
    return [];
  }
};

const serializeWorkspaceLinks = (links: WorkspaceLinkEntry[]) =>
  JSON.stringify(
    links.map(link => ({
      id: link.id,
      title: link.title.trim(),
      url: link.url.trim(),
    })),
  );

const getItemUrl = (item: WorkspaceItem) => (item.type === 'file' ? `file://${item.content}` : item.content);

const getItemIcon = (item: WorkspaceItem) => {
  if (item.type === 'markdown') return FileText;
  if (item.icon) return getCategoryIcon(item.icon);
  switch (item.type) {
    case 'markdown':
      return FileText;
    case 'file':
      return Upload;
    case 'links':
      return Layers;
    default:
      return Globe;
  }
};

interface DropdownPortalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}

const DropdownPortal: React.FC<DropdownPortalProps> = ({ isOpen, onClose, triggerRef, children }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 160,
      });
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);

      if (isOutsideTrigger && isOutsideDropdown) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[9999] w-40 rounded-lg border border-gray-200 bg-white shadow-lg"
      style={{ top: position.top, left: position.left }}
      onClick={event => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
};

interface SortableModuleItemProps {
  id: string;
  disabled?: boolean;
  children: (dragHandle: React.ReactNode, isDragging: boolean) => React.ReactNode;
}

const SortableModuleItem: React.FC<SortableModuleItemProps> = ({ id, disabled = false, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  const dragHandle = disabled ? null : (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={event => event.stopPropagation()}
      className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
      title="拖拽排序目录"
    >
      <GripVertical className="h-3.5 w-3.5 cursor-grab active:cursor-grabbing" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-90' : ''}>
      {children(dragHandle, isDragging)}
    </div>
  );
};

interface SortableWorkspaceItemProps {
  id: string;
  disabled?: boolean;
  children: (dragHandle: React.ReactNode, isDragging: boolean) => React.ReactNode;
}

const SortableWorkspaceItem: React.FC<SortableWorkspaceItemProps> = ({ id, disabled = false, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const dragHandle = disabled ? null : (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={event => event.stopPropagation()}
      className={`-ml-5 mr-1 flex h-5 w-5 flex-shrink-0 items-center justify-center text-gray-300 transition-opacity hover:text-gray-500 cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0 group-hover/item:pointer-events-auto group-hover/item:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100'
      }`}
      title="拖拽排序条目"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} className="relative group/item">
      {children(dragHandle, isDragging)}
    </div>
  );
};

interface WorkspaceCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: WorkspaceCategory) => void;
  initialData?: WorkspaceCategory;
}

const WorkspaceCategoryModal: React.FC<WorkspaceCategoryModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Layers');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [priority, setPriority] = useState(50);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialData?.name || '');
    setDescription(initialData?.description || '');
    setSelectedIcon(initialData?.icon || 'Layers');
    setSelectedColor(initialData?.color || 'blue');
    setPriority(initialData?.priority || 50);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initialData?.id || `workspace-cat-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      icon: selectedIcon,
      color: selectedColor,
      priority,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-800">{initialData ? '编辑工作分组' : '新建工作分组'}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-6 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">分组名称</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：客户端、产品设计、商务协作"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">备注说明</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="简要描述这组工作的方向..."
              className="h-24 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">选择图标</label>
            <div className="grid grid-cols-8 gap-2">
              {AVAILABLE_ICONS.map(({ name: iconName, icon: Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setSelectedIcon(iconName)}
                  className={`flex items-center justify-center rounded-lg p-2 transition-all ${
                    selectedIcon === iconName ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500 ring-offset-1' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">主题颜色</label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_COLORS.map(color => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => setSelectedColor(color.name)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${color.bg} ${
                    selectedColor === color.name ? 'scale-110 border-gray-600' : 'border-transparent hover:scale-105'
                  } transition-all`}
                >
                  {selectedColor === color.name && <Check className={`h-4 w-4 ${color.text}`} />}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">优先级</label>
              <span className="text-sm text-gray-500">{priority}</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={priority}
              onChange={e => setPriority(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (workspace: Partial<WorkspaceData>) => void;
  categoryId: string;
  initialData?: WorkspaceData;
}

const WorkspaceModal: React.FC<WorkspaceModalProps> = ({ isOpen, onClose, onSave, categoryId, initialData }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Layers');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [priority, setPriority] = useState(50);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialData?.title || '');
    setDescription(initialData?.description || '');
    setSelectedIcon(initialData?.icon || 'Layers');
    setSelectedColor(initialData?.color || 'blue');
    setPriority(initialData?.priority || 50);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: initialData?.id,
      title: title.trim(),
      description: description.trim(),
      icon: selectedIcon,
      color: selectedColor,
      priority,
      categoryId,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-800">{initialData ? '编辑工作空间' : '新建工作空间'}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-6 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">空间名称</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：古月官网重构、客户端发布节奏"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">备注说明</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="简要描述当前空间的目标与范围..."
              className="h-24 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">选择图标</label>
            <div className="grid grid-cols-8 gap-2">
              {AVAILABLE_ICONS.map(({ name: iconName, icon: Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setSelectedIcon(iconName)}
                  className={`flex items-center justify-center rounded-lg p-2 transition-all ${
                    selectedIcon === iconName ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500 ring-offset-1' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">主题颜色</label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_COLORS.map(color => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => setSelectedColor(color.name)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${color.bg} ${
                    selectedColor === color.name ? 'scale-110 border-gray-600' : 'border-transparent hover:scale-105'
                  } transition-all`}
                >
                  {selectedColor === color.name && <Check className={`h-4 w-4 ${color.text}`} />}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">优先级</label>
              <span className="text-sm text-gray-500">{priority}</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={priority}
              onChange={e => setPriority(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface ModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (module: WorkspaceModule) => void;
  initialData?: WorkspaceModule;
}

const ModuleModal: React.FC<ModuleModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialData?.title || '');
    setDescription(initialData?.description || '');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: initialData?.id || `workspace-module-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      icon: initialData?.icon,
      color: initialData?.color,
      items: initialData?.items || [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-800">{initialData ? '编辑章节' : '新建章节'}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">章节标题</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：需求整理、设计方案、上线执行"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">备注说明</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="这个章节主要放什么..."
              className="h-24 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface ItemModalState {
  moduleId: string;
  item?: WorkspaceItem;
  initialType?: WorkspaceItemType;
}

interface WorkspaceSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (section: WorkspaceSection) => void;
  initialData?: WorkspaceSection;
}

const WorkspaceSectionModal: React.FC<WorkspaceSectionModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [title, setTitle] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('FolderOpen');
  const [selectedColor, setSelectedColor] = useState('gray');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialData?.title || '');
    setSelectedIcon(initialData?.icon || 'FolderOpen');
    setSelectedColor(initialData?.color || 'gray');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: initialData?.id || `workspace-section-${Date.now()}`,
      title: title.trim(),
      icon: selectedIcon,
      color: selectedColor,
      modules: initialData?.modules || [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-800">{initialData ? '编辑自定义目录区' : '新建自定义目录区'}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">目录区名称</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：其它目录、参考资料、执行清单"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">选择图标</label>
            <div className="grid grid-cols-8 gap-2">
              {AVAILABLE_ICONS.map(({ name: iconName, icon: Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setSelectedIcon(iconName)}
                  className={`flex items-center justify-center rounded-lg p-2 transition-all ${
                    selectedIcon === iconName ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500 ring-offset-1' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">主题颜色</label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_COLORS.map(color => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => setSelectedColor(color.name)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${color.bg} ${
                    selectedColor === color.name ? 'scale-110 border-gray-600' : 'border-transparent hover:scale-105'
                  } transition-all`}
                >
                  {selectedColor === color.name && <Check className={`h-4 w-4 ${color.text}`} />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialState: ItemModalState | null;
  onSave: (moduleId: string, item: WorkspaceItem) => void;
}

const ItemModal: React.FC<ItemModalProps> = ({ isOpen, onClose, initialState, onSave }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkspaceItemType>('markdown');
  const [content, setContent] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(getDefaultItemIcon('markdown'));
  const [selectedColor, setSelectedColor] = useState('blue');
  const [links, setLinks] = useState<WorkspaceLinkEntry[]>([createLinkEntry()]);
  const [isPickingFile, setIsPickingFile] = useState(false);

  useEffect(() => {
    if (!isOpen || !initialState) return;
    setTitle(initialState.item?.title || '');
    const nextType = initialState.item?.type || initialState.initialType || 'markdown';
    setType(nextType);
    setContent(initialState.item?.content || '');
    setSelectedIcon(initialState.item?.icon || getDefaultItemIcon(nextType));
    setSelectedColor(initialState.item?.color || 'blue');
    setLinks(
      nextType === 'links'
        ? (() => {
            const parsedLinks = parseWorkspaceLinks(initialState.item?.content || '');
            return parsedLinks.length > 0 ? parsedLinks : [createLinkEntry()];
          })()
        : [createLinkEntry()],
    );
  }, [initialState, isOpen]);

  if (!isOpen || !initialState) return null;

  const handlePickFile = async () => {
    if (!window.electronAPI || isPickingFile) return;
    setIsPickingFile(true);
    try {
      const file = await window.electronAPI.selectFile();
      if (file?.path) {
        setContent(file.path);
        if (!title.trim()) {
          setTitle(file.name.replace(/\.[^.]+$/, ''));
        }
      }
    } finally {
      setIsPickingFile(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) return;
    if ((type === 'link' || type === 'file') && !content.trim()) return;

    if (type === 'links') {
      const normalizedLinks = links
        .map(link => ({
          ...link,
          title: link.title.trim(),
          url: link.url.trim(),
        }))
        .filter(link => link.title || link.url);

      if (normalizedLinks.length === 0 || normalizedLinks.some(link => !link.url)) return;

      onSave(initialState.moduleId, {
        id: initialState.item?.id || `workspace-item-${Date.now()}`,
        title: title.trim(),
        type,
        content: serializeWorkspaceLinks(normalizedLinks),
        icon: selectedIcon,
        color: selectedColor,
        updatedAt: Date.now(),
      });
      onClose();
      return;
    }

    onSave(initialState.moduleId, {
      id: initialState.item?.id || `workspace-item-${Date.now()}`,
      title: title.trim(),
      type,
      content:
        type === 'markdown'
          ? initialState.item?.content || content.trim() || createDefaultMarkdown(title.trim())
          : content.trim(),
      icon: type === 'markdown' ? undefined : selectedIcon,
      color: type === 'markdown' ? undefined : selectedColor,
      updatedAt: Date.now(),
    });
    onClose();
  };

  const typeButton = (value: WorkspaceItemType, label: string) => (
    <button
      type="button"
      onClick={() => setType(value)}
      className={`rounded-lg px-3 py-2 text-sm transition-colors ${type === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-800">{initialState.item ? '编辑条目' : '新建条目'}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">条目标题</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：需求文档、会议纪要、PR 链接"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">条目类型</label>
            <div className="flex flex-wrap gap-2">
              {typeButton('markdown', 'MD 文稿')}
              {typeButton('link', '网页链接')}
              {typeButton('links', '多链接')}
              {typeButton('file', '本地文件')}
            </div>
          </div>

          {type !== 'markdown' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">图标与颜色</label>
              <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-8 gap-2">
                  {AVAILABLE_ICONS.map(({ name: iconName, icon: Icon }) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setSelectedIcon(iconName)}
                      className={`flex items-center justify-center rounded-lg p-2 transition-all ${
                        selectedIcon === iconName ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500 ring-offset-1' : 'bg-white text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COLORS.map(color => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setSelectedColor(color.name)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${color.bg} ${
                        selectedColor === color.name ? 'scale-110 border-gray-600' : 'border-transparent hover:scale-105'
                      } transition-all`}
                    >
                      {selectedColor === color.name && <Check className={`h-4 w-4 ${color.text}`} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {type === 'markdown' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">文稿说明</label>
              {initialState.item && isLikelyMarkdownFilePath(initialState.item.content) ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
                  这是一个 `.md` 文件条目，内容请在右侧编辑器中直接修改。
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="可以先留空，保存后直接进入编辑。"
                  className="h-40 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
              )}
            </div>
          ) : type === 'links' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">链接列表</label>
                <button
                  type="button"
                  onClick={() => setLinks(prev => [...prev, createLinkEntry()])}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
                >
                  添加链接
                </button>
              </div>
              <div className="space-y-3">
                {links.map((link, index) => (
                  <div key={link.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">链接 {index + 1}</span>
                      {links.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLinks(prev => prev.filter(entry => entry.id !== link.id))}
                          className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          title="删除链接"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        value={link.title}
                        onChange={e => setLinks(prev => prev.map(entry => (entry.id === link.id ? { ...entry, title: e.target.value } : entry)))}
                        placeholder="链接标题，例如：Figma 设计稿"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                      />
                      <input
                        value={link.url}
                        onChange={e => setLinks(prev => prev.map(entry => (entry.id === link.id ? { ...entry, url: e.target.value } : entry)))}
                        placeholder="https://example.com"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">{type === 'link' ? '链接地址' : '文件路径'}</label>
              <div className="flex gap-2">
                <input
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder={type === 'link' ? 'https://example.com' : '/path/to/file'}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                />
                {type === 'file' && (
                  <button
                    type="button"
                    onClick={handlePickFile}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    {isPickingFile ? '选择中…' : '选择文件'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

interface MarkdownCreateModalProps {
  isOpen: boolean;
  moduleTitle?: string;
  onClose: () => void;
  onCreate: (title: string) => void;
}

const MarkdownCreateModal: React.FC<MarkdownCreateModalProps> = ({ isOpen, moduleTitle, onClose, onCreate }) => {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    onCreate(nextTitle);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">新建 MD</h2>
            <p className="mt-1 text-xs text-gray-400">{moduleTitle ? `添加到「${moduleTitle}」` : '输入文稿名称后创建'}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-6">
          <label className="text-sm font-medium text-gray-700">文稿名称</label>
          <input
            autoFocus
            value={title}
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                handleCreate();
              }
            }}
            placeholder="例如：需求分析、会议纪要、执行方案"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
};

interface MarkdownRenameState {
  moduleId: string;
  itemId: string;
  currentTitle: string;
  filePath: string;
}

const MarkdownRenameModal: React.FC<{
  isOpen: boolean;
  initialState: MarkdownRenameState | null;
  onClose: () => void;
  onConfirm: (nextTitle: string) => void;
}> = ({ isOpen, initialState, onClose, onConfirm }) => {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialState?.currentTitle || '');
  }, [initialState, isOpen]);

  if (!isOpen || !initialState) return null;

  const handleConfirm = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    onConfirm(nextTitle);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-800">修改文件名</h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-6">
          <label className="text-sm font-medium text-gray-700">MD 文件名</label>
          <input
            autoFocus
            value={title}
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                handleConfirm();
              }
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
          />
          <div className="text-xs text-gray-400">保存时会自动保留 `.md` 后缀。</div>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export const WorkspaceManager: React.FC = () => {
  const [categories, setCategories] = useState<WorkspaceCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WORKSPACE_CATEGORIES);
      return saved ? JSON.parse(saved) : DEFAULT_WORKSPACE_CATEGORIES;
    } catch {
      return DEFAULT_WORKSPACE_CATEGORIES;
    }
  });
  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WORKSPACES);
      return saved ? JSON.parse(saved) : DEFAULT_WORKSPACES;
    } catch {
      return DEFAULT_WORKSPACES;
    }
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<WorkspaceCategory | undefined>(undefined);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceData | undefined>(undefined);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<WorkspaceSection | undefined>(undefined);
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<WorkspaceModule | undefined>(undefined);
  const [moduleParentSectionId, setModuleParentSectionId] = useState<string | null>(null);
  const [itemModalState, setItemModalState] = useState<ItemModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [addingLinkModuleId, setAddingLinkModuleId] = useState<string | null>(null);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [markdownModalState, setMarkdownModalState] = useState<{ moduleId: string; moduleTitle: string } | null>(null);
  const [markdownRenameState, setMarkdownRenameState] = useState<MarkdownRenameState | null>(null);

  const [layoutMode, setLayoutMode] = useState<'single' | 'split'>('single');
  const [activePane, setActivePane] = useState<'primary' | 'secondary'>('primary');
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [primaryContent, setPrimaryContent] = useState<WorkspacePaneContent | null>(null);
  const [secondaryContent, setSecondaryContent] = useState<WorkspacePaneContent | null>(null);
  const [isImmersive, setIsImmersive] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [landingSearchQuery, setLandingSearchQuery] = useState('');

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const savedWidth = Number(localStorage.getItem(STORAGE_KEY_WORKSPACE_SIDEBAR_WIDTH));
    return Number.isFinite(savedWidth) ? Math.min(420, Math.max(280, savedWidth)) : 320;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => localStorage.getItem(STORAGE_KEY_WORKSPACE_SIDEBAR_COLLAPSED) === '1');
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [isSidebarSearchVisible, setIsSidebarSearchVisible] = useState(false);
  const [showPrimaryDirectorySection, setShowPrimaryDirectorySection] = useState(true);
  const [addingModuleSectionId, setAddingModuleSectionId] = useState<string | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');
  const [expandedCustomSections, setExpandedCustomSections] = useState<Record<string, boolean>>({});
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [moveTarget, setMoveTarget] = useState<{
    itemId: string;
    sourceModuleId: string;
    sectionId: string | null;
  } | null>(null);

  const layoutRootRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WORKSPACE_CATEGORIES, JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WORKSPACES, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WORKSPACE_SIDEBAR_WIDTH, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WORKSPACE_SIDEBAR_COLLAPSED, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    setPrimaryContent(null);
    setSecondaryContent(null);
    setSelectedItemId(null);
    setLayoutMode('single');
    setActivePane('primary');
    setSidebarSearchQuery('');
    setIsSidebarSearchVisible(false);
    setShowPrimaryDirectorySection(true);
    setAddingModuleSectionId(null);
    setNewModuleTitle('');
    setNewModuleDesc('');
    setOpenDropdownId(null);
    setAddingLinkModuleId(null);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setMarkdownModalState(null);
    setMarkdownRenameState(null);
  }, [selectedWorkspaceId]);

  const selectedCategory = categories.find(category => category.id === selectedCategoryId) || null;
  const selectedWorkspace = workspaces.find(workspace => workspace.id === selectedWorkspaceId) || null;

  const categoryWorkspaces = useMemo(
    () =>
      workspaces
        .filter(workspace => workspace.categoryId === selectedCategoryId)
        .sort((a, b) => (a.priority || 50) - (b.priority || 50)),
    [selectedCategoryId, workspaces],
  );

  const filteredModules = useMemo(() => {
    if (!selectedWorkspace) return [];
    const sq = sidebarSearchQuery.trim().toLowerCase();
    return selectedWorkspace.modules.reduce<Array<{ module: WorkspaceModule; items: WorkspaceItem[] }>>((acc, module) => {
      if (!sq) {
        acc.push({ module, items: module.items });
        return acc;
      }

      const moduleMatches = [module.title, module.description].some(value => value?.toLowerCase().includes(sq));
      const items = moduleMatches
        ? module.items
        : module.items.filter(item => [item.title, item.content].some(value => value?.toLowerCase().includes(sq)));

      if (moduleMatches || items.length > 0) {
        acc.push({ module, items });
      }

      return acc;
    }, []);
  }, [selectedWorkspace, sidebarSearchQuery]);

  const filteredCustomSections = useMemo(() => {
    if (!selectedWorkspace) return [];
    const sq = sidebarSearchQuery.trim().toLowerCase();
    return (selectedWorkspace.customSections || []).reduce<Array<{ section: WorkspaceSection; modules: Array<{ module: WorkspaceModule; items: WorkspaceItem[] }> }>>(
      (acc, section) => {
        const sectionMatches = [section.title].some(value => value?.toLowerCase().includes(sq));
        const modules = section.modules.reduce<Array<{ module: WorkspaceModule; items: WorkspaceItem[] }>>((moduleAcc, module) => {
          if (!sq || sectionMatches) {
            moduleAcc.push({ module, items: module.items });
            return moduleAcc;
          }

          const moduleMatches = [module.title, module.description].some(value => value?.toLowerCase().includes(sq));
          const items = moduleMatches
            ? module.items
            : module.items.filter(item => [item.title, item.content].some(value => value?.toLowerCase().includes(sq)));

          if (moduleMatches || items.length > 0) {
            moduleAcc.push({ module, items });
          }

          return moduleAcc;
        }, []);

        if (sectionMatches || modules.length > 0 || !sq) {
          acc.push({ section, modules });
        }
        return acc;
      },
      [],
    );
  }, [selectedWorkspace, sidebarSearchQuery]);

  const updateWorkspace = useCallback((workspaceId: string, updater: (workspace: WorkspaceData) => WorkspaceData) => {
    setWorkspaces(prev => prev.map(workspace => (workspace.id === workspaceId ? updater(workspace) : workspace)));
  }, []);

  const updateWorkspaceModuleTree = useCallback(
    (workspace: WorkspaceData, moduleId: string, updater: (module: WorkspaceModule) => WorkspaceModule): WorkspaceData => {
      let matched = false;
      const modules = workspace.modules.map(module => {
        if (module.id !== moduleId) return module;
        matched = true;
        return updater(module);
      });
      if (matched) {
        return { ...workspace, modules };
      }
      return {
        ...workspace,
        customSections: (workspace.customSections || []).map(section => ({
          ...section,
          modules: section.modules.map(module => {
            if (module.id !== moduleId) return module;
            matched = true;
            return updater(module);
          }),
        })),
      };
    },
    [],
  );

  const findItem = useCallback(
    (content: WorkspacePaneContent | null) => {
      if (!selectedWorkspace || !content?.moduleId || !content?.itemId) return null;
      const module =
        selectedWorkspace.modules.find(entry => entry.id === content.moduleId) ||
        (selectedWorkspace.customSections || []).flatMap(section => section.modules).find(entry => entry.id === content.moduleId);
      const item = module?.items.find(entry => entry.id === content.itemId);
      return module && item ? { module, item } : null;
    },
    [selectedWorkspace],
  );

  const findModule = useCallback(
    (moduleId?: string | null) => {
      if (!selectedWorkspace || !moduleId) return null;
      return (
        selectedWorkspace.modules.find(entry => entry.id === moduleId) ||
        (selectedWorkspace.customSections || []).flatMap(section => section.modules).find(entry => entry.id === moduleId) ||
        null
      );
    },
    [selectedWorkspace],
  );

  const setActiveWorkspacePane = useCallback(
    (nextContent: WorkspacePaneContent) => {
      if (layoutMode === 'split' && activePane === 'secondary') {
        setSecondaryContent(nextContent);
      } else {
        setPrimaryContent(nextContent);
      }
    },
    [activePane, layoutMode],
  );

  const loadWorkspaceMarkdown = useCallback(
    async (moduleId: string, item: WorkspaceItem): Promise<WorkspacePaneContent> => {
      let noteContent = item.content;
      let noteId = item.id;

      if (isLikelyMarkdownFilePath(item.content) && window.electronAPI) {
        try {
          noteContent = (await window.electronAPI.readFile(item.content)) || '';
          noteId = item.content;
        } catch (error) {
          console.error('Failed to load workspace markdown file:', error);
        }
      }

      return {
        type: 'markdown',
        id: noteId,
        moduleId,
        itemId: item.id,
        data: {
          id: noteId,
          title: item.title,
          content: noteContent,
          category: 'Workspace',
          createdAt: item.updatedAt,
          updatedAt: item.updatedAt,
        },
      };
    },
    [],
  );

  const handleSelectItem = async (moduleId: string, itemId: string) => {
    const module = findModule(moduleId);
    const item = module?.items.find(entry => entry.id === itemId);
    if (!item) return;

    setSelectedItemId(itemId);

    if (item.type === 'markdown') {
      const nextContent = await loadWorkspaceMarkdown(moduleId, item);
      setActiveWorkspacePane(nextContent);
      return;
    }

    setActiveWorkspacePane({ type: 'item', moduleId, itemId });
  };

  const upsertWorkspaceItem = (moduleId: string, itemData: WorkspaceItem, options?: { select?: boolean }) => {
    if (!selectedWorkspace) return;
    updateWorkspace(selectedWorkspace.id, workspace =>
      updateWorkspaceModuleTree(workspace, moduleId, module => ({
        ...module,
        items: module.items.some(item => item.id === itemData.id)
          ? module.items.map(item => (item.id === itemData.id ? itemData : item))
          : [...module.items, itemData],
      })),
    );
    if (options?.select) {
      handleSelectItem(moduleId, itemData.id);
    }
  };

  const cancelAddLink = () => {
    setAddingLinkModuleId(null);
    setNewLinkTitle('');
    setNewLinkUrl('');
  };

  const startAddLink = (moduleId: string) => {
    setOpenDropdownId(null);
    setExpandedModules(prev => ({ ...prev, [moduleId]: true }));
    if (addingLinkModuleId === moduleId) {
      cancelAddLink();
      return;
    }
    setAddingLinkModuleId(moduleId);
    setNewLinkTitle('');
    setNewLinkUrl('');
  };

  const confirmAddLink = () => {
    if (!addingLinkModuleId || !newLinkUrl.trim()) return;
    const nextUrl = newLinkUrl.trim();
    const nextTitle = newLinkTitle.trim() || nextUrl;

    upsertWorkspaceItem(
      addingLinkModuleId,
      {
        id: `workspace-item-${Date.now()}`,
        title: nextTitle,
        type: 'link',
        content: nextUrl,
        updatedAt: Date.now(),
      },
      { select: false },
    );
    cancelAddLink();
  };

  const handleUploadFile = async (moduleId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenDropdownId(null);
    setExpandedModules(prev => ({ ...prev, [moduleId]: true }));
    if (!window.electronAPI || !selectedWorkspace) {
      alert('请在桌面端使用此功能');
      return;
    }

    const file = await window.electronAPI.selectFile();
    if (!file?.path) return;

    const sectionId = !selectedWorkspace
      ? null
      : selectedWorkspace.modules.some(module => module.id === moduleId)
        ? null
        : (selectedWorkspace.customSections || []).find(section => section.modules.some(module => module.id === moduleId))?.id || null;

    const { copyWorkspaceFileToModule } = await import('../utils/workspaceStorage');
    const destinationPath = await copyWorkspaceFileToModule(
      file.path,
      file.name,
      selectedWorkspace.categoryId,
      selectedWorkspace.id,
      sectionId,
      moduleId,
    );
    if (!destinationPath) {
      alert('上传文件失败');
      return;
    }

    upsertWorkspaceItem(
      moduleId,
      {
        id: `workspace-item-${Date.now()}`,
        title: file.name.replace(/\.[^.]+$/, '') || file.name,
        type: 'file',
        content: destinationPath,
        updatedAt: Date.now(),
      },
      { select: false },
    );
  };

  const handleOpenMarkdownModal = (moduleId: string, moduleTitle: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenDropdownId(null);
    setExpandedModules(prev => ({ ...prev, [moduleId]: true }));
    setMarkdownModalState({ moduleId, moduleTitle });
  };

  const handleCreateMarkdown = (title: string) => {
    const create = async () => {
      if (!markdownModalState || !selectedWorkspace) return;

      const sectionId = selectedWorkspace.modules.some(module => module.id === markdownModalState.moduleId)
        ? null
        : (selectedWorkspace.customSections || []).find(section =>
            section.modules.some(module => module.id === markdownModalState.moduleId),
          )?.id || null;

      const { createWorkspaceMarkdownFile } = await import('../utils/workspaceStorage');
      const filePath = await createWorkspaceMarkdownFile(
        selectedWorkspace.categoryId,
        selectedWorkspace.id,
        sectionId,
        markdownModalState.moduleId,
        title.trim(),
        createDefaultMarkdown(title.trim()),
      );

      if (!filePath) {
        alert('创建 MD 失败');
        return;
      }

      upsertWorkspaceItem(
        markdownModalState.moduleId,
        {
          id: `workspace-item-${Date.now()}`,
          title: title.trim(),
          type: 'markdown',
          content: filePath,
          updatedAt: Date.now(),
        },
        { select: false },
      );
      setMarkdownModalState(null);
    };

    void create();
  };

  const handleRenameMarkdown = async (nextTitle: string) => {
    if (!markdownRenameState || !selectedWorkspace || !window.electronAPI) return;

    const targetModule = findModule(markdownRenameState.moduleId);
    const targetItem = targetModule?.items.find(item => item.id === markdownRenameState.itemId);
    if (!targetItem) return;

    const normalizedPath = markdownRenameState.filePath.replace(/\\/g, '/');
    const separatorIndex = normalizedPath.lastIndexOf('/');
    const parentPath = separatorIndex === -1 ? '' : normalizedPath.slice(0, separatorIndex);
    const nextFileName = `${nextTitle.trim()}.md`;
    const nextPath = await window.electronAPI.pathJoin(parentPath, nextFileName);
    const success = await window.electronAPI.renameFile(markdownRenameState.filePath, nextPath);

    if (!success) {
      alert('修改文件名失败');
      return;
    }

    updateWorkspace(selectedWorkspace.id, workspace =>
      updateWorkspaceModuleTree(workspace, markdownRenameState.moduleId, module => ({
        ...module,
        items: module.items.map(item =>
          item.id === markdownRenameState.itemId
            ? {
                ...item,
                title: nextTitle.trim(),
                content: nextPath,
                updatedAt: Date.now(),
              }
            : item,
        ),
      })),
    );
    setMarkdownRenameState(null);
  };

  const handleUpdateMarkdownItem = async (itemId: string, updates: Partial<MarkdownNote>) => {
    if (!selectedWorkspace) return;
    const ownerModuleId =
      selectedWorkspace.modules.find(module => module.items.some(item => item.id === itemId || (item.type === 'markdown' && item.content === itemId)))?.id ||
      (selectedWorkspace.customSections || [])
        .flatMap(section => section.modules)
        .find(module => module.items.some(item => item.id === itemId || (item.type === 'markdown' && item.content === itemId)))?.id;
    if (!ownerModuleId) return;
    const targetModule = findModule(ownerModuleId);
    const targetItem = targetModule?.items.find(item => item.id === itemId || (item.type === 'markdown' && item.content === itemId));
    if (!targetItem) return;

    if (targetItem.type === 'markdown' && isLikelyMarkdownFilePath(targetItem.content) && updates.content !== undefined && window.electronAPI) {
      const success = await window.electronAPI.writeFile(targetItem.content, updates.content);
      if (!success) {
        console.error('Failed to save workspace markdown file:', targetItem.content);
        return;
      }
    }

    updateWorkspace(selectedWorkspace.id, workspace =>
      updateWorkspaceModuleTree(workspace, ownerModuleId, module => ({
        ...module,
        items: module.items.map(item => {
          const isTarget = item.id === itemId || (item.type === 'markdown' && item.content === itemId);
          if (!isTarget) return item;
          return {
            ...item,
            title: updates.title ?? item.title,
            content:
              item.type === 'markdown' && isLikelyMarkdownFilePath(item.content)
                ? item.content
                : updates.content ?? item.content,
            updatedAt: updates.updatedAt ?? Date.now(),
          };
        }),
      })),
    );

    const persistedNoteId =
      targetItem.type === 'markdown' && isLikelyMarkdownFilePath(targetItem.content) ? targetItem.content : targetItem.id;
    const nextUpdatedAt = updates.updatedAt ?? Date.now();
    const updatePaneContent = (content: WorkspacePaneContent | null): WorkspacePaneContent | null => {
      if (!content || content.type !== 'markdown' || content.itemId !== targetItem.id || !content.data) {
        return content;
      }

      return {
        ...content,
        id: persistedNoteId,
        data: {
          ...content.data,
          ...updates,
          id: persistedNoteId,
          title: updates.title ?? content.data.title,
          content: updates.content ?? content.data.content,
          updatedAt: nextUpdatedAt,
        },
      };
    };

    setPrimaryContent(prev => updatePaneContent(prev));
    setSecondaryContent(prev => updatePaneContent(prev));
  };

  const handleSaveCategory = (category: WorkspaceCategory) => {
    setCategories(prev => {
      const exists = prev.some(entry => entry.id === category.id);
      return exists ? prev.map(entry => (entry.id === category.id ? category : entry)) : [...prev, category];
    });
  };

  const handleSaveWorkspace = (workspaceData: Partial<WorkspaceData>) => {
    if (!selectedCategoryId) return;
    const nextWorkspace: WorkspaceData = {
      id: workspaceData.id || `workspace-${Date.now()}`,
      title: workspaceData.title || '未命名工作空间',
      description: workspaceData.description || '',
      categoryId: workspaceData.categoryId || selectedCategoryId,
      icon: workspaceData.icon || editingWorkspace?.icon || 'Layers',
      color: workspaceData.color || editingWorkspace?.color || selectedCategory?.color || 'blue',
      priority: workspaceData.priority || 50,
      modules: editingWorkspace?.modules || [],
      customSections: editingWorkspace?.customSections || [],
      primarySectionTitle: editingWorkspace?.primarySectionTitle || '工作目录',
      primarySectionIcon: editingWorkspace?.primarySectionIcon || 'FolderOpen',
      primarySectionColor: editingWorkspace?.primarySectionColor || editingWorkspace?.color || selectedCategory?.color || 'blue',
      primarySectionEnabled: editingWorkspace?.primarySectionEnabled ?? true,
    };

    setWorkspaces(prev => {
      const exists = prev.some(entry => entry.id === nextWorkspace.id);
      return exists ? prev.map(entry => (entry.id === nextWorkspace.id ? nextWorkspace : entry)) : [...prev, nextWorkspace];
    });
  };

  const handleSaveModule = (moduleData: WorkspaceModule) => {
    if (!selectedWorkspace) return;
    updateWorkspace(selectedWorkspace.id, workspace => {
      if (moduleParentSectionId) {
        return {
          ...workspace,
          customSections: (workspace.customSections || []).map(section => {
            if (section.id !== moduleParentSectionId) return section;
            const exists = section.modules.some(module => module.id === moduleData.id);
            return {
              ...section,
              modules: exists
                ? section.modules.map(module => (module.id === moduleData.id ? moduleData : module))
                : [...section.modules, moduleData],
            };
          }),
        };
      }
      const exists = workspace.modules.some(module => module.id === moduleData.id);
      return {
        ...workspace,
        modules: exists
          ? workspace.modules.map(module => (module.id === moduleData.id ? moduleData : module))
          : [...workspace.modules, moduleData],
      };
    });
  };

  const startAddModule = (sectionId: string | null) => {
    setAddingModuleSectionId(sectionId ?? '__primary__');
    setNewModuleTitle('');
    setNewModuleDesc('');
    if (!sectionId) {
      setShowPrimaryDirectorySection(true);
    } else {
      setExpandedCustomSections(prev => ({ ...prev, [sectionId]: true }));
    }
  };

  const cancelAddModule = () => {
    setAddingModuleSectionId(null);
    setNewModuleTitle('');
    setNewModuleDesc('');
  };

  const confirmAddModule = () => {
    if (!selectedWorkspace || !newModuleTitle.trim()) return;

    const newModule: WorkspaceModule = {
      id: `workspace-module-${Date.now()}`,
      title: newModuleTitle.trim(),
      description: newModuleDesc.trim(),
      items: [],
    };

    updateWorkspace(selectedWorkspace.id, workspace => {
      if (addingModuleSectionId && addingModuleSectionId !== '__primary__') {
        return {
          ...workspace,
          customSections: (workspace.customSections || []).map(section =>
            section.id === addingModuleSectionId
              ? { ...section, modules: [...section.modules, newModule] }
              : section,
          ),
        };
      }

      return {
        ...workspace,
        modules: [...workspace.modules, newModule],
      };
    });

    setExpandedModules(prev => ({ ...prev, [newModule.id]: true }));
    cancelAddModule();
  };

  const handleSaveCustomSection = (sectionData: WorkspaceSection) => {
    if (!selectedWorkspace) return;
    if (sectionData.id === '__primary__') {
      updateWorkspace(selectedWorkspace.id, workspace => ({
        ...workspace,
        primarySectionTitle: sectionData.title,
        primarySectionIcon: sectionData.icon,
        primarySectionColor: sectionData.color,
        primarySectionEnabled: true,
      }));
      return;
    }
    updateWorkspace(selectedWorkspace.id, workspace => {
      const exists = (workspace.customSections || []).some(section => section.id === sectionData.id);
      return {
        ...workspace,
        customSections: exists
          ? (workspace.customSections || []).map(section => (section.id === sectionData.id ? sectionData : section))
          : [...(workspace.customSections || []), sectionData],
      };
    });
    setExpandedCustomSections(prev => ({ ...prev, [sectionData.id]: true }));
  };

  const handleDeletePrimarySection = () => {
    if (!selectedWorkspace) return;
    setConfirmState({
      title: '删除工作目录',
      message: '确定删除「工作目录」吗？其中的章节和内容也会一起删除。',
      variant: 'danger',
      onConfirm: () => {
        updateWorkspace(selectedWorkspace.id, workspace => ({
          ...workspace,
          modules: [],
          primarySectionEnabled: false,
        }));
        setPrimaryContent(prev => {
          if (!prev?.moduleId) return prev;
          return selectedWorkspace.modules.some(module => module.id === prev.moduleId) ? null : prev;
        });
        setSecondaryContent(prev => {
          if (!prev?.moduleId) return prev;
          return selectedWorkspace.modules.some(module => module.id === prev.moduleId) ? null : prev;
        });
        setSelectedItemId(prev => {
          if (!prev) return null;
          return selectedWorkspace.modules.some(module => module.items.some(item => item.id === prev)) ? null : prev;
        });
        setConfirmState(null);
      },
    });
  };

  const handleSaveItem = (moduleId: string, itemData: WorkspaceItem) => {
    upsertWorkspaceItem(moduleId, itemData, { select: true });
  };

  const handleModuleDragEnd = (event: DragEndEvent) => {
    if (!selectedWorkspace || sidebarSearchQuery.trim()) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = selectedWorkspace.modules.findIndex(module => module.id === active.id);
    const newIndex = selectedWorkspace.modules.findIndex(module => module.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    updateWorkspace(selectedWorkspace.id, workspace => ({
      ...workspace,
      modules: arrayMove(workspace.modules, oldIndex, newIndex),
    }));
  };

  const handleCustomSectionModuleDragEnd = (sectionId: string) => (event: DragEndEvent) => {
    if (!selectedWorkspace || sidebarSearchQuery.trim()) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const section = (selectedWorkspace.customSections || []).find(entry => entry.id === sectionId);
    if (!section) return;

    const oldIndex = section.modules.findIndex(module => module.id === active.id);
    const newIndex = section.modules.findIndex(module => module.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    updateWorkspace(selectedWorkspace.id, workspace => ({
      ...workspace,
      customSections: (workspace.customSections || []).map(entry =>
        entry.id === sectionId ? { ...entry, modules: arrayMove(entry.modules, oldIndex, newIndex) } : entry,
      ),
    }));
  };

  const handleItemDragEnd = (moduleId: string) => (event: DragEndEvent) => {
    if (!selectedWorkspace || sidebarSearchQuery.trim()) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const module = findModule(moduleId);
    if (!module) return;

    const oldIndex = module.items.findIndex(item => item.id === active.id);
    const newIndex = module.items.findIndex(item => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    updateWorkspace(selectedWorkspace.id, workspace =>
      updateWorkspaceModuleTree(workspace, moduleId, entry => ({ ...entry, items: arrayMove(entry.items, oldIndex, newIndex) })),
    );
  };

  const handleDeleteCategory = (category: WorkspaceCategory) => {
    setConfirmState({
      title: '删除工作分组',
      message: `确定删除「${category.name}」吗？分组内的工作空间也会一并删除。`,
      variant: 'danger',
      onConfirm: () => {
        setCategories(prev => prev.filter(entry => entry.id !== category.id));
        setWorkspaces(prev => prev.filter(entry => entry.categoryId !== category.id));
        if (selectedCategoryId === category.id) {
          setSelectedCategoryId(null);
          setSelectedWorkspaceId(null);
        }
        setConfirmState(null);
      },
    });
  };

  const handleDeleteWorkspace = (workspace: WorkspaceData) => {
    setConfirmState({
      title: '删除工作空间',
      message: `确定删除「${workspace.title}」吗？空间中的目录与内容也会一起清除。`,
      variant: 'danger',
      onConfirm: () => {
        setWorkspaces(prev => prev.filter(entry => entry.id !== workspace.id));
        if (selectedWorkspaceId === workspace.id) {
          setSelectedWorkspaceId(null);
          setSelectedItemId(null);
        }
        setConfirmState(null);
      },
    });
  };

  const handleDeleteCustomSection = (section: WorkspaceSection) => {
    if (!selectedWorkspace) return;
    setConfirmState({
      title: '删除目录区',
      message: `确定删除「${section.title}」吗？其中的目录和内容也会一起删除。`,
      variant: 'danger',
      onConfirm: () => {
        updateWorkspace(selectedWorkspace.id, workspace => ({
          ...workspace,
          customSections: (workspace.customSections || []).filter(entry => entry.id !== section.id),
        }));
        setPrimaryContent(prev => (prev?.moduleId && section.modules.some(module => module.id === prev.moduleId) ? null : prev));
        setSecondaryContent(prev => (prev?.moduleId && section.modules.some(module => module.id === prev.moduleId) ? null : prev));
        setSelectedItemId(prev => {
          if (!prev) return null;
          return section.modules.some(module => module.items.some(item => item.id === prev)) ? null : prev;
        });
        setConfirmState(null);
      },
    });
  };

  const handleDeleteModule = (module: WorkspaceModule, sectionId?: string | null) => {
    if (!selectedWorkspace) return;
    setConfirmState({
      title: '删除目录',
      message: `确定删除「${module.title}」吗？其中的条目也会一起删除。`,
      variant: 'danger',
      onConfirm: () => {
        updateWorkspace(selectedWorkspace.id, workspace => {
          if (sectionId) {
            return {
              ...workspace,
              customSections: (workspace.customSections || []).map(section =>
                section.id === sectionId ? { ...section, modules: section.modules.filter(entry => entry.id !== module.id) } : section,
              ),
            };
          }
          return {
            ...workspace,
            modules: workspace.modules.filter(entry => entry.id !== module.id),
          };
        });
        setPrimaryContent(prev => (prev?.moduleId === module.id ? null : prev));
        setSecondaryContent(prev => (prev?.moduleId === module.id ? null : prev));
        setSelectedItemId(prev => {
          if (!prev) return null;
          return module.items.some(item => item.id === prev) ? null : prev;
        });
        setConfirmState(null);
      },
    });
  };

  const handleDeleteItem = (moduleId: string, item: WorkspaceItem) => {
    if (!selectedWorkspace) return;
    setConfirmState({
      title: '删除条目',
      message: `确定删除「${item.title}」吗？`,
      variant: 'danger',
      onConfirm: async () => {
        if ((item.type === 'markdown' || item.type === 'file') && window.electronAPI && item.content) {
          try {
            await window.electronAPI.deleteFile(item.content);
          } catch (error) {
            console.error('Failed to delete workspace file:', error);
          }
        }
        updateWorkspace(selectedWorkspace.id, workspace =>
          updateWorkspaceModuleTree(workspace, moduleId, module => ({
            ...module,
            items: module.items.filter(entry => entry.id !== item.id),
          })),
        );
        setSelectedItemId(prev => (prev === item.id ? null : prev));
        setPrimaryContent(prev => (prev?.itemId === item.id ? null : prev));
        setSecondaryContent(prev => (prev?.itemId === item.id ? null : prev));
        setConfirmState(null);
      },
    });
  };

  const getSectionModules = useCallback((sectionId: string | null) => {
    if (!selectedWorkspace) return [];
    if (!sectionId) return selectedWorkspace.modules;
    return (selectedWorkspace.customSections || []).find(section => section.id === sectionId)?.modules || [];
  }, [selectedWorkspace]);

  const handleStartMove = (
    itemId: string,
    sourceModuleId: string,
    sectionId: string | null,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    setMoveTarget({ itemId, sourceModuleId, sectionId });
  };

  const handleConfirmMove = (targetModuleId: string) => {
    if (!selectedWorkspace || !moveTarget || targetModuleId === moveTarget.sourceModuleId) {
      setMoveTarget(null);
      return;
    }

    const sourceModule = getSectionModules(moveTarget.sectionId).find(module => module.id === moveTarget.sourceModuleId);
    const item = sourceModule?.items.find(entry => entry.id === moveTarget.itemId);
    if (!item) {
      setMoveTarget(null);
      return;
    }

    updateWorkspace(selectedWorkspace.id, workspace => {
      if (!moveTarget.sectionId) {
        return {
          ...workspace,
          modules: workspace.modules.map(module => {
            if (module.id === moveTarget.sourceModuleId) {
              return { ...module, items: module.items.filter(entry => entry.id !== moveTarget.itemId) };
            }
            if (module.id === targetModuleId) {
              return { ...module, items: [...module.items, item] };
            }
            return module;
          }),
        };
      }

      return {
        ...workspace,
        customSections: (workspace.customSections || []).map(section => {
          if (section.id !== moveTarget.sectionId) return section;
          return {
            ...section,
            modules: section.modules.map(module => {
              if (module.id === moveTarget.sourceModuleId) {
                return { ...module, items: module.items.filter(entry => entry.id !== moveTarget.itemId) };
              }
              if (module.id === targetModuleId) {
                return { ...module, items: [...module.items, item] };
              }
              return module;
            }),
          };
        }),
      };
    });

    setMoveTarget(null);
  };

  const toggleSplitLayout = () => {
    if (layoutMode === 'single') {
      setLayoutMode('split');
      return;
    }
    if (activePane === 'secondary' && secondaryContent) {
      setPrimaryContent(secondaryContent);
    }
    setSecondaryContent(null);
    setActivePane('primary');
    setLayoutMode('single');
  };

  const openWorkspaceTerminal = () => {
    const terminalContent: WorkspacePaneContent = { type: 'terminal' };
    setSelectedItemId(null);
    if (layoutMode === 'split' && activePane === 'secondary') setSecondaryContent(terminalContent);
    else setPrimaryContent(terminalContent);
  };

  const focusWorkspaceSearch = () => {
    if (isSidebarCollapsed) setIsSidebarCollapsed(false);
    setIsSidebarSearchVisible(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const handleSidebarResizeMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    setIsDraggingSidebar(true);
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(280, Math.min(420, startWidth + moveEvent.clientX - startX));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDividerMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    setIsDraggingSplit(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const bounds = splitContainerRef.current.getBoundingClientRect();
      const nextRatio = (moveEvent.clientX - bounds.left) / bounds.width;
      setSplitRatio(Math.min(0.74, Math.max(0.26, nextRatio)));
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const renderModuleOverview = (module: WorkspaceModule) => {
    const itemTypeLabelMap: Record<WorkspaceItemType, string> = {
      markdown: 'MD 文稿',
      link: '网页链接',
      links: '多链接',
      file: '本地文件',
    };

    return (
      <div className="h-full overflow-y-auto bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold text-gray-900">{module.title}</h2>
                <p className="mt-2 text-sm text-gray-500">{module.description || '在这里整理这个目录下的工作内容。'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => startAddLink(module.id)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                >
                  添加链接
                </button>
                <button
                  ref={element => {
                    dropdownRefs.current[`overview-${module.id}`] = element;
                  }}
                  onClick={() => setOpenDropdownId(openDropdownId === `overview-${module.id}` ? null : `overview-${module.id}`)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                >
                  新建
                </button>
                <DropdownPortal
                  isOpen={openDropdownId === `overview-${module.id}`}
                  onClose={() => setOpenDropdownId(null)}
                  triggerRef={{ current: dropdownRefs.current[`overview-${module.id}`] }}
                >
                  <button
                    onClick={event => handleUploadFile(module.id, event)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    上传文件
                  </button>
                  <button
                    onClick={event => handleOpenMarkdownModal(module.id, module.title, event)}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    新建 MD
                  </button>
                </DropdownPortal>
              </div>
            </div>
          </div>

          {module.items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
              <div className="text-base font-medium text-gray-700">当前目录还没有内容</div>
              <div className="mt-2 text-sm text-gray-400">从上面的按钮添加链接、上传文件或新建 MD。</div>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd(module.id)}>
              <SortableContext items={module.items.map(item => item.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {module.items.map(item => {
                    const ItemIcon = getItemIcon(item);
                    const itemPalette = getColorPalette(item.color || module.color || selectedWorkspace?.color || selectedCategory?.color);
                    const isActive = selectedItemId === item.id;
                    const isMarkdownItem = item.type === 'markdown';

                    return (
                      <SortableWorkspaceItem key={item.id} id={item.id}>
                        {(itemDragHandle, isDragging) => (
                          <div
                            className={`group/item rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all ${
                              isDragging ? 'ring-1 ring-gray-200' : ''
                            } ${isActive ? 'border-blue-200 ring-1 ring-blue-100' : 'hover:border-gray-300 hover:shadow-md'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                onClick={() => handleSelectItem(module.id, item.id)}
                                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                              >
                                {isMarkdownItem ? (
                                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
                                    <FileText className="h-5 w-5 text-gray-500" />
                                  </div>
                                ) : (
                                  <div
                                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                                    style={{ backgroundColor: itemPalette.bgColor }}
                                  >
                                    <ItemIcon className="h-5 w-5" style={{ color: itemPalette.textColor }} />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-base font-semibold text-gray-900">{item.title}</div>
                                  {!isMarkdownItem && <div className="mt-1 text-xs text-gray-400">{itemTypeLabelMap[item.type]}</div>}
                                  <div className="mt-2 line-clamp-2 text-sm text-gray-500">
                                    {item.type === 'markdown'
                                      ? 'Markdown 文稿'
                                      : item.type === 'links'
                                        ? `${parseWorkspaceLinks(item.content).length} 个链接`
                                        : item.content}
                                  </div>
                                </div>
                              </button>
                              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100">
                                {itemDragHandle}
                                <button
                                  onClick={event => {
                                    event.stopPropagation();
                                    if (isMarkdownItem) {
                                      setMarkdownRenameState({
                                        moduleId: module.id,
                                        itemId: item.id,
                                        currentTitle: item.title,
                                        filePath: item.content,
                                      });
                                      return;
                                    }
                                    setItemModalState({ moduleId: module.id, item });
                                  }}
                                  className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
                                  title={isMarkdownItem ? '修改文件名' : '编辑内容'}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={event => {
                                    event.stopPropagation();
                                    handleDeleteItem(module.id, item);
                                  }}
                                  className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  title="删除内容"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </SortableWorkspaceItem>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    );
  };

  const renderPaneContent = (content: WorkspacePaneContent | null, paneId: 'primary' | 'secondary') => {
    if (!selectedWorkspace) return null;

    if (!content) {
      return (
        <div className="flex h-full items-center justify-center bg-gray-50 px-6">
          <div className="max-w-xl rounded-3xl border border-gray-200 bg-white px-8 py-10 text-center shadow-sm">
            <Layers className="mx-auto mb-4 h-16 w-16 text-blue-200" />
            <p className="text-xl font-semibold text-gray-800">工作空间已就绪</p>
            <p className="mt-2 text-sm text-gray-500">从左侧选择一个目录后，右侧会进入该目录的工作页。</p>
          </div>
        </div>
      );
    }

    if (content.type === 'terminal') {
      return (
        <div className="h-full w-full">
          <TerminalComponent isVisible={true} initialTitle="Workspace Terminal" />
        </div>
      );
    }

    if (content.type === 'module') {
      const module = findModule(content.moduleId);
      if (!module) {
        return (
          <div className="flex h-full items-center justify-center text-gray-400">
            当前目录不存在或已被删除
          </div>
        );
      }
      return renderModuleOverview(module);
    }

    if (content.type === 'markdown') {
      if (!content.data) {
        return <div className="flex h-full items-center justify-center text-gray-400">文稿读取失败</div>;
      }

      return (
        <MarkdownEditor
          key={`workspace-note-${content.id || content.itemId}`}
          note={content.data}
          onUpdate={handleUpdateMarkdownItem}
          isFullscreen={isImmersive}
          onToggleFullscreen={() => setIsImmersive(prev => !prev)}
          showViewToggle={false}
          viewMode="split"
          hideCategory={true}
          initialEditMode={false}
          tocSide="right"
        />
      );
    }

    const resolved = findItem(content);
    if (!resolved) {
      return (
        <div className="flex h-full items-center justify-center text-gray-400">
          当前内容不存在或已被删除
        </div>
      );
    }

    const { item } = resolved;
    if (item.type === 'links') {
      const palette = getColorPalette(item.color || resolved.module.color || selectedWorkspace.color || selectedCategory?.color);
      const Icon = getItemIcon(item);
      const links = parseWorkspaceLinks(item.content);

      return (
        <div className="h-full overflow-y-auto bg-gray-50 p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: palette.bgColor }}
                >
                  <Icon className="h-7 w-7" style={{ color: palette.textColor }} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-bold text-gray-900">{item.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">{links.length} 个链接，适合整理工作中常用入口。</p>
                </div>
              </div>
            </div>

            {links.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-400">
                当前还没有可用链接，请在左侧编辑条目后补充。
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {links.map(link => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div
                      className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ backgroundColor: palette.bgColor }}
                    >
                      <Icon className="h-5 w-5" style={{ color: palette.textColor }} />
                    </div>
                    <div className="truncate text-base font-semibold text-gray-900">{link.title || link.url}</div>
                    <div className="mt-2 line-clamp-2 text-sm text-gray-500">{link.url}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <MiniBrowser
        key={`workspace-browser-${item.id}`}
        url={getItemUrl(item)}
        title={item.title}
        onClose={() => {
          if (paneId === 'primary') setPrimaryContent(null);
          else setSecondaryContent(null);
        }}
      />
    );
  };

  const renderWorkspaceDirectory = () => {
    const sq = sidebarSearchQuery.trim().toLowerCase();
    const hasSearchResults =
      !sq ||
      filteredModules.length > 0 ||
      filteredCustomSections.some(section => section.modules.length > 0 || section.section.title.toLowerCase().includes(sq));
    const isPrimarySectionExpanded = !!sq || showPrimaryDirectorySection;
    const renderAddModuleInline = (sectionId: string | null) => {
      const currentSectionKey = sectionId ?? '__primary__';
      if (addingModuleSectionId !== currentSectionKey) return null;

      return (
        <div className="border-b border-gray-100 bg-blue-50/40 p-2">
          <div className="mb-2 flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={newModuleTitle}
              onChange={event => setNewModuleTitle(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  confirmAddModule();
                }
                if (event.key === 'Escape') {
                  cancelAddModule();
                }
              }}
              placeholder="输入章节名称..."
              className="flex-1 rounded border border-blue-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
            />
            <button
              onClick={confirmAddModule}
              className="rounded p-1 text-blue-600 transition-colors hover:bg-blue-100"
              title="确认新建"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={cancelAddModule}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100"
              title="取消"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            value={newModuleDesc}
            onChange={event => setNewModuleDesc(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                confirmAddModule();
              }
            }}
            placeholder="输入章节备注（可选）..."
            className="w-full rounded border border-blue-200 px-2 py-1 text-xs text-gray-600 focus:border-blue-400 focus:outline-none"
          />
        </div>
      );
    };

    const renderModuleList = (
      entries: Array<{ module: WorkspaceModule; items: WorkspaceItem[] }>,
      options?: { sectionId?: string | null; sectionColor?: string; emptyLabel?: string },
    ) => {
      const sectionId = options?.sectionId || null;
      const emptyLabel = options?.emptyLabel || '暂无目录，点击 + 添加';
      const sectionModules = getSectionModules(sectionId);

      if (entries.length === 0) {
        return <div className="text-xs text-gray-400 text-center py-4">{sq ? '没有匹配的目录内容' : emptyLabel}</div>;
      }

      const onDragEnd = sectionId ? handleCustomSectionModuleDragEnd(sectionId) : handleModuleDragEnd;

      return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map(({ module }) => module.id)} strategy={verticalListSortingStrategy}>
            {entries.map(({ module, items }) => {
              const expanded = !!sq || !!expandedModules[module.id];

              return (
                <SortableModuleItem key={module.id} id={module.id} disabled={!!sq}>
                  {(moduleDragHandle, isModuleDragging) => (
                    <div className={`group/module border-b border-gray-100 last:border-0 ${isModuleDragging ? 'bg-white shadow-sm' : ''}`}>
                      <div className="flex items-center justify-between pr-2 transition-colors hover:bg-gray-50">
                        <button
                          onClick={() => setExpandedModules(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                          className="flex flex-1 items-center justify-between px-3 py-2.5 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-800">{module.title}</div>
                            {module.description ? <div className="truncate text-xs text-gray-400">{module.description}</div> : null}
                          </div>
                          {expanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/module:opacity-100 group-focus-within/module:opacity-100">
                          {moduleDragHandle}
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              startAddLink(module.id);
                            }}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-200"
                            title="添加链接"
                          >
                            <Link className="h-3.5 w-3.5" />
                          </button>
                          <button
                            ref={element => {
                              dropdownRefs.current[module.id] = element;
                            }}
                            onClick={event => {
                              event.stopPropagation();
                              setOpenDropdownId(openDropdownId === module.id ? null : module.id);
                            }}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-200"
                            title="新建内容"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <DropdownPortal
                            isOpen={openDropdownId === module.id}
                            onClose={() => setOpenDropdownId(null)}
                            triggerRef={{ current: dropdownRefs.current[module.id] }}
                          >
                            <button
                              onClick={event => handleUploadFile(module.id, event)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              上传文件
                            </button>
                            <button
                              onClick={event => handleOpenMarkdownModal(module.id, module.title, event)}
                              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              新建 MD
                            </button>
                          </DropdownPortal>
                          <button
                            onClick={() => {
                              setEditingModule(module);
                              setModuleParentSectionId(sectionId);
                              setIsModuleModalOpen(true);
                            }}
                            className="rounded p-1.5 text-gray-400 hover:bg-blue-100 hover:text-blue-500"
                            title="编辑目录"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteModule(module, sectionId)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-500"
                            title="删除目录"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="bg-gray-50/50 pb-2 pl-6">
                          {addingLinkModuleId === module.id && (
                            <div className="mb-2 border-b border-blue-100 bg-blue-50/30 px-3 py-2">
                              <div className="space-y-2">
                                <input
                                  autoFocus
                                  type="text"
                                  value={newLinkTitle}
                                  onChange={event => setNewLinkTitle(event.target.value)}
                                  placeholder="链接标题"
                                  className="w-full rounded border border-blue-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={newLinkUrl}
                                  onChange={event => setNewLinkUrl(event.target.value)}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                      confirmAddLink();
                                    }
                                  }}
                                  placeholder="链接 URL (http://...)"
                                  className="w-full rounded border border-blue-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
                                />
                                <div className="flex justify-end gap-2">
                                  <button onClick={cancelAddLink} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">
                                    取消
                                  </button>
                                  <button onClick={confirmAddLink} className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600">
                                    添加
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                          {items.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-400">暂无内容，点击右上角 + 添加</div>
                          ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd(module.id)}>
                              <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
                                {items.map(item => {
                                  const isActive = selectedItemId === item.id;
                                  const isMarkdownItem = item.type === 'markdown';
                                  const ItemIcon = isMarkdownItem
                                    ? FileText
                                    : item.icon
                                      ? getCategoryIcon(item.icon)
                                      : item.type === 'link'
                                        ? Link
                                        : item.type === 'links'
                                          ? Layers
                                          : FileText;

                                  return (
                                    <SortableWorkspaceItem key={item.id} id={item.id} disabled={!!sq}>
                                      {(itemDragHandle) => (
                                        <div
                                          className={`flex cursor-pointer items-center justify-between pr-2 pl-0 py-1.5 transition-colors ${
                                            isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                                          }`}
                                          onClick={() => handleSelectItem(module.id, item.id)}
                                        >
                                          <div className="flex min-w-0 flex-1 items-center gap-2">
                                            {itemDragHandle}
                                            <ItemIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                            <span className="truncate text-sm">{item.title}</span>
                                          </div>
                                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/item:opacity-100">
                                            <button
                                              onClick={event => {
                                                event.stopPropagation();
                                                if (isMarkdownItem) {
                                                  setMarkdownRenameState({
                                                    moduleId: module.id,
                                                    itemId: item.id,
                                                    currentTitle: item.title,
                                                    filePath: item.content,
                                                  });
                                                  return;
                                                }
                                                setItemModalState({ moduleId: module.id, item });
                                              }}
                                              className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
                                              title={isMarkdownItem ? '修改文件名' : '编辑内容'}
                                            >
                                              <Edit2 className="h-3 w-3" />
                                            </button>
                                            {sectionModules.length > 1 && (
                                              <button
                                                onClick={event => handleStartMove(item.id, module.id, sectionId, event)}
                                                className="rounded p-1 text-gray-400 hover:bg-orange-50 hover:text-orange-500"
                                                title="移动到其它章节"
                                              >
                                                <ArrowRightLeft className="h-3 w-3" />
                                              </button>
                                            )}
                                            <button
                                              onClick={event => {
                                                event.stopPropagation();
                                                handleDeleteItem(module.id, item);
                                              }}
                                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                              title="删除内容"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </SortableWorkspaceItem>
                                  );
                                })}
                              </SortableContext>
                            </DndContext>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </SortableModuleItem>
              );
            })}
          </SortableContext>
        </DndContext>
      );
    };

    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-gray-50">
        <div className="border-b border-gray-200 bg-white p-4">
          <div className="min-w-0">
            <h2 className="truncate font-bold text-gray-800">{selectedWorkspace?.title}</h2>
            <p className="mt-1 text-xs text-gray-500">{selectedWorkspace?.description}</p>
          </div>

          {isSidebarSearchVisible && (
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  value={sidebarSearchQuery}
                  onChange={e => setSidebarSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setSidebarSearchQuery('');
                      setIsSidebarSearchVisible(false);
                    }
                  }}
                  placeholder="搜索目录..."
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-7 pr-3 text-xs focus:border-blue-400 focus:outline-none"
                />
              </div>
              <button
                onClick={() => {
                  setSidebarSearchQuery('');
                  setIsSidebarSearchVisible(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title="收起搜索"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {isSidebarSearchVisible && sq && (
            <div className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
              hasSearchResults ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}>
              <span>{hasSearchResults ? '已筛出相关目录' : `没有找到与 “${sidebarSearchQuery}” 相关的目录`}</span>
              <button
                onClick={() => {
                  setSidebarSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="rounded px-2 py-1 text-[11px] font-medium hover:bg-white/80"
              >
                清空
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {selectedWorkspace?.primarySectionEnabled !== false && (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="group/psection flex items-center justify-between border-b border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowPrimaryDirectorySection(prev => !prev)}
                  className="flex flex-1 items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  <Folder className="h-4 w-4 text-blue-500" />
                  {selectedWorkspace?.primarySectionTitle || '工作目录'}
                  {isPrimarySectionExpanded ? <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" /> : <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />}
                </button>
                <div className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover/psection:opacity-100 group-focus-within/psection:opacity-100">
                  <button
                    onClick={() => startAddModule(null)}
                    className="p-2 text-gray-500 transition-colors hover:bg-gray-200"
                    title="新建章节"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingSection({
                        id: '__primary__',
                        title: selectedWorkspace?.primarySectionTitle || '工作目录',
                        icon: selectedWorkspace?.primarySectionIcon || 'FolderOpen',
                        color: selectedWorkspace?.primarySectionColor || selectedWorkspace?.color || 'blue',
                        modules: selectedWorkspace?.modules || [],
                      });
                      setIsSectionModalOpen(true);
                    }}
                    className="p-1.5 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-500"
                    title="编辑目录区"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleDeletePrimarySection}
                    className="p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-500"
                    title="删除目录区"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {renderAddModuleInline(null)}
              {isPrimarySectionExpanded && renderModuleList(filteredModules, { emptyLabel: '暂无目录，点击 + 添加' })}
            </div>
          )}

          {filteredCustomSections.map(({ section, modules }) => {
            const sectionPalette = getColorPalette(section.color);
            const SectionIcon = getCategoryIcon(section.icon);
            const isExpanded = !!sq || !!expandedCustomSections[section.id];
            return (
              <div key={section.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 group/csection">
                  <button
                    onClick={() => setExpandedCustomSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                    className="flex flex-1 items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <SectionIcon className="h-4 w-4" style={{ color: sectionPalette.textColor }} />
                    {section.title}
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" /> : <ChevronRight className="h-4 w-4 text-gray-400 ml-auto" />}
                  </button>
                  <div className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover/csection:opacity-100 group-focus-within/csection:opacity-100">
                    <button
                      onClick={() => startAddModule(section.id)}
                      className="p-2 text-gray-500 transition-colors hover:bg-gray-200"
                      title="新建章节"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingSection(section);
                        setIsSectionModalOpen(true);
                      }}
                      className="p-1.5 text-gray-400 transition-colors hover:bg-blue-100 hover:text-blue-500"
                      title="编辑目录区"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCustomSection(section)}
                      className="p-1.5 text-gray-400 transition-colors hover:bg-red-100 hover:text-red-500"
                      title="删除目录区"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {renderAddModuleInline(section.id)}
                {isExpanded && renderModuleList(modules, { sectionId: section.id, sectionColor: section.color, emptyLabel: '暂无目录，点击 + 添加' })}
              </div>
            );
          })}

          <button
            onClick={() => {
              setEditingSection(undefined);
              setIsSectionModalOpen(true);
            }}
            className="flex w-full items-center justify-center rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-gray-400 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
            title="新建其它目录区"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderCategoriesView = () => {
    const sortedAndFilteredCategories = categories
      .filter((category) => {
        if (!landingSearchQuery) return true;
        const query = landingSearchQuery.toLowerCase();
        const workspacesInCategory = workspaces.filter(workspace => workspace.categoryId === category.id);
        return (
          category.name.toLowerCase().includes(query) ||
          category.description.toLowerCase().includes(query) ||
          workspacesInCategory.some(workspace => workspace.title.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => (a.priority || 50) - (b.priority || 50));

    return (
      <div className="flex h-full w-full min-w-0 flex-1 flex-col p-6" style={{ background: 'var(--t-bg-main)' }}>
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--t-text)' }}>
                <Layers className="w-8 h-8 text-blue-600" />
                工作空间
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={landingSearchQuery}
                  onChange={(e) => setLandingSearchQuery(e.target.value)}
                  placeholder="搜索..."
                  className="w-full pl-10 pr-4 py-2 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                  style={{ background: 'var(--t-input-bg)', color: 'var(--t-text)' }}
                />
              </div>
              <button
                onClick={() => {
                  setEditingCategory(undefined);
                  setIsCategoryModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建分组
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedAndFilteredCategories.map((category) => {
              const palette = colorMap[category.color] || colorMap.blue;
              const Icon = getCategoryIcon(category.icon);
              const workspaceCount = workspaces.filter(workspace => workspace.categoryId === category.id).length;

              return (
                <div key={category.id} className="relative group">
                  <button
                    onClick={() => setSelectedCategoryId(category.id)}
                    className="w-full h-full min-h-[280px] flex flex-col text-left border rounded-xl p-6 hover:shadow-lg transition-all duration-300"
                    style={{ borderColor: palette.borderColor, background: 'var(--t-bg-card)' }}
                  >
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                      style={{ backgroundColor: palette.bgColor }}
                    >
                      <Icon className="w-7 h-7" style={{ color: palette.textColor }} />
                    </div>
                    <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--t-text)' }}>{category.name}</h3>
                    <p className="text-sm line-clamp-2 flex-1" style={{ color: 'var(--t-text-muted)' }}>
                      {category.description || '在这里放置相关工作空间。'}
                    </p>
                    <div className="mt-4 pt-4 border-t text-xs" style={{ borderColor: 'var(--t-border-light)', color: 'var(--t-text-muted)' }}>
                      {workspaceCount} 个工作空间
                    </div>
                  </button>

                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingCategory(category);
                        setIsCategoryModalOpen(true);
                      }}
                      className="p-2 backdrop-blur rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 border shadow-sm"
                      style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteCategory(category);
                      }}
                      className="p-2 backdrop-blur rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 border shadow-sm"
                      style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderWorkspaceCards = () => {
    const colors = colorMap[selectedCategory?.color || 'gray'] || colorMap.gray;
    const IconComponent = getCategoryIcon(selectedCategory?.icon || 'Layers');
    const filteredWorkspaces = categoryWorkspaces.filter(workspace =>
      workspace.title.toLowerCase().includes(landingSearchQuery.toLowerCase()) ||
      workspace.description.toLowerCase().includes(landingSearchQuery.toLowerCase())
    );

    return (
      <div className="flex h-full w-full min-w-0 flex-1 flex-col p-6" style={{ background: 'var(--t-bg-main)' }}>
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => {
                    setSelectedCategoryId(null);
                    setSelectedWorkspaceId(null);
                    setLandingSearchQuery('');
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              <h1 className="text-2xl font-bold flex items-center gap-3" style={{ color: 'var(--t-text)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.bgColor }}>
                  <IconComponent className="w-5 h-5" style={{ color: colors.textColor }} />
                </div>
                {selectedCategory?.name || '工作空间'}
              </h1>
              <p className="mt-1" style={{ color: 'var(--t-text-muted)' }}>{selectedCategory?.description || '选择一个工作空间进入。'}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={landingSearchQuery}
                  onChange={(e) => setLandingSearchQuery(e.target.value)}
                  placeholder="搜索工作空间..."
                  className="w-full pl-10 pr-4 py-2 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 transition-all"
                  style={{ background: 'var(--t-input-bg)', color: 'var(--t-text)' }}
                />
              </div>
              <div
                aria-hidden="true"
                className="invisible flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                导入课程
              </div>
              <button
                onClick={() => {
                  setEditingWorkspace(undefined);
                  setIsWorkspaceModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                新建工作空间
              </button>
            </div>
          </div>

          {filteredWorkspaces.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">该分组下暂无工作空间</p>
              <p className="text-sm mt-2">点击「新建工作空间」开始整理项目</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredWorkspaces.map((workspace) => {
                const Icon = getCategoryIcon(workspace.icon || selectedCategory?.icon || 'Layers');
                const workspaceColors = getColorPalette(workspace.color || selectedCategory?.color || 'gray');
                const itemCount = workspace.modules.reduce((sum, module) => sum + module.items.length, 0);

                return (
                  <div
                    key={workspace.id}
                    className="relative group cursor-pointer"
                    onClick={() => setSelectedWorkspaceId(workspace.id)}
                  >
                    <div
                      className="w-full min-h-[280px] flex flex-col text-left border rounded-xl p-6 hover:shadow-lg transition-all duration-300 h-full"
                      style={{ borderColor: workspaceColors.borderColor, background: 'var(--t-bg-card)' }}
                    >
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"
                        style={{ backgroundColor: workspaceColors.bgColor }}
                      >
                        <Icon className="w-6 h-6" style={{ color: workspaceColors.textColor }} />
                      </div>
                      <h3 className="text-lg font-bold mb-2 transition-colors" style={{ color: 'var(--t-text)' }}>{workspace.title}</h3>
                      <p className="text-sm line-clamp-2 flex-1" style={{ color: 'var(--t-text-muted)' }}>
                        {workspace.description || '进入后可以组织当前工作的目录与内容。'}
                      </p>
                      <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs w-full" style={{ borderColor: 'var(--t-border-light)', color: 'var(--t-text-muted)' }}>
                        <span>{workspace.modules.length} 个目录</span>
                        <span>{itemCount} 条内容</span>
                      </div>
                    </div>

                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingWorkspace(workspace);
                          setIsWorkspaceModalOpen(true);
                        }}
                        className="p-2 backdrop-blur rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 border shadow-sm"
                        style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteWorkspace(workspace);
                        }}
                        className="p-2 backdrop-blur rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 border shadow-sm"
                        style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={layoutRootRef} className="relative flex h-full overflow-hidden" style={{ background: 'var(--t-bg-main)' }}>
      {!selectedCategoryId ? (
        renderCategoriesView()
      ) : !selectedWorkspaceId ? (
        renderWorkspaceCards()
      ) : (
        <>
          {!isImmersive && (
            <>
              <div
                className="flex h-full flex-shrink-0 overflow-hidden transition-[width] duration-300"
                style={{ width: isSidebarCollapsed ? 72 : sidebarWidth }}
              >
                {isSidebarCollapsed ? (
                  <div className="flex w-full flex-col items-center gap-2 border-r px-2 py-3" style={{ borderColor: 'var(--t-border)', background: 'var(--t-header-bg)' }}>
                    <button
                      onClick={() => {
                        setSelectedWorkspaceId(null);
                        setSelectedItemId(null);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-blue-600"
                      title="返回工作空间列表"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setIsSidebarCollapsed(false)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-blue-600"
                      title="展开目录"
                    >
                      <PanelLeftOpen className="h-4.5 w-4.5" />
                    </button>
                    <div className="my-1 h-px w-8" style={{ background: 'var(--t-border)' }} />
                    <button
                      onClick={focusWorkspaceSearch}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-blue-600"
                      title="搜索目录"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setIsAiAssistantOpen(true)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-purple-600"
                      title="打开知识库 AI 助手"
                    >
                      <Bot className="h-4 w-4" />
                    </button>
                    <button
                      onClick={toggleSplitLayout}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-blue-600"
                      title={layoutMode === 'single' ? '开启分屏' : '关闭分屏'}
                    >
                      {layoutMode === 'single' ? <Columns className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={openWorkspaceTerminal}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white hover:text-blue-600"
                      title="新建终端"
                    >
                      <TerminalSquare className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 flex-col border-r" style={{ borderColor: 'var(--t-border)' }}>
                    <div
                      className="flex h-12 items-center justify-between border-b px-3"
                      style={{ WebkitAppRegion: 'drag', borderColor: 'var(--t-border)', background: 'var(--t-header-bg)' } as React.CSSProperties}
                    >
                      <button
                        onClick={() => {
                          setSelectedWorkspaceId(null);
                          setSelectedItemId(null);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-all hover:bg-blue-50 hover:text-blue-600"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        title="返回工作空间列表"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                        <button
                          onClick={() => setIsAiAssistantOpen(true)}
                          className="rounded-lg bg-white p-1.5 text-gray-600 shadow-sm transition-colors hover:text-purple-600"
                          title="打开知识库 AI 助手"
                        >
                          <Bot className="h-4 w-4" />
                        </button>
                        <button
                          onClick={focusWorkspaceSearch}
                          className="rounded-lg bg-white p-1.5 text-gray-600 shadow-sm transition-colors hover:text-blue-600"
                          title="搜索目录"
                        >
                          <Search className="h-4 w-4" />
                        </button>
                        <button
                          onClick={toggleSplitLayout}
                          className="rounded-lg bg-white p-1.5 text-gray-600 shadow-sm transition-colors hover:text-blue-600"
                          title={layoutMode === 'single' ? '开启分屏' : '关闭分屏'}
                        >
                          {layoutMode === 'single' ? <Columns className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={openWorkspaceTerminal}
                          className="rounded-lg bg-white p-1.5 text-gray-600 shadow-sm transition-colors hover:text-blue-600"
                          title="新建终端"
                        >
                          <TerminalSquare className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setIsSidebarCollapsed(true)}
                          className="rounded-lg bg-white p-1.5 text-gray-600 shadow-sm transition-colors hover:text-blue-600"
                          title="折叠目录"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {renderWorkspaceDirectory()}
                  </div>
                )}
              </div>

              {!isSidebarCollapsed && (
                <div
                  onMouseDown={handleSidebarResizeMouseDown}
                  className={`relative flex w-[5px] flex-shrink-0 cursor-col-resize items-center justify-center ${isDraggingSidebar ? 'bg-blue-400/30' : 'hover:bg-blue-200/40'} transition-colors`}
                >
                  <div className="absolute inset-y-0 -left-2 -right-2" />
                  <div className={`h-full w-px ${isDraggingSidebar ? 'bg-blue-400' : 'bg-gray-200'} transition-colors`} />
                </div>
              )}
            </>
          )}

          <div className="relative flex min-w-0 flex-1 flex-col">
            <div ref={splitContainerRef} className="flex flex-1 overflow-hidden">
              <div
                className={`${layoutMode === 'split' ? 'border-r' : 'w-full'} relative flex h-full flex-col ${isDraggingSplit ? '' : 'transition-[width] duration-200'}`}
                style={{ width: layoutMode === 'split' ? `${splitRatio * 100}%` : '100%', flexShrink: 0, ...(layoutMode === 'split' ? { borderColor: 'var(--t-border)' } : {}) }}
              >
                {layoutMode === 'split' && (
                  <div className={`pointer-events-auto absolute left-2 top-2 z-50 transition-all ${activePane === 'primary' ? 'scale-100 opacity-100' : 'scale-95 opacity-50'}`}>
                    <button
                      onClick={() => setActivePane('primary')}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold shadow-md backdrop-blur-sm transition-all ${
                        activePane === 'primary'
                          ? 'border-blue-700 bg-blue-600 text-white shadow-blue-500/30'
                          : 'border-gray-300 bg-gray-50/90 text-gray-500 hover:border-blue-500 hover:bg-white hover:text-blue-600'
                      }`}
                      title={activePane === 'primary' ? '当前选定（左屏）' : '选定左屏'}
                      type="button"
                    >
                      1
                    </button>
                  </div>
                )}
                <div className={`relative flex-1 overflow-hidden ${layoutMode === 'split' && activePane === 'primary' ? 'ring-2 ring-inset ring-blue-500/20' : ''}`}>
                  {renderPaneContent(primaryContent, 'primary')}
                </div>
              </div>

              {layoutMode === 'split' && (
                <div
                  onMouseDown={handleDividerMouseDown}
                  className={`group relative z-10 flex w-[5px] flex-shrink-0 cursor-col-resize items-center justify-center ${isDraggingSplit ? 'bg-blue-400/30' : 'hover:bg-blue-200/40'} transition-colors`}
                >
                  <div className="absolute inset-y-0 -left-2 -right-2" />
                  <div className={`h-full w-px ${isDraggingSplit ? 'bg-blue-400' : 'bg-gray-200 group-hover:bg-blue-300'} transition-colors`} />
                  <div className={`absolute top-1/2 h-8 w-4 -translate-y-1/2 rounded-full border bg-white shadow-sm transition-all ${isDraggingSplit ? 'border-blue-400 opacity-100' : 'border-gray-200 opacity-0 group-hover:opacity-100 group-hover:border-blue-300'}`}>
                    <div className="flex h-full items-center justify-center">
                      <GripVertical className="h-2.5 w-2.5 text-blue-400" />
                    </div>
                  </div>
                </div>
              )}

              {layoutMode === 'split' && (
                <div className={`relative flex h-full min-w-0 flex-1 flex-col ${isDraggingSplit ? '' : 'transition-[flex] duration-200'}`}>
                  <div className={`pointer-events-auto absolute left-2 top-2 z-50 transition-all ${activePane === 'secondary' ? 'scale-100 opacity-100' : 'scale-95 opacity-50'}`}>
                    <button
                      onClick={() => setActivePane('secondary')}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold shadow-md backdrop-blur-sm transition-all ${
                        activePane === 'secondary'
                          ? 'border-blue-700 bg-blue-600 text-white shadow-blue-500/30'
                          : 'border-gray-300 bg-gray-50/90 text-gray-500 hover:border-blue-500 hover:bg-white hover:text-blue-600'
                      }`}
                      title={activePane === 'secondary' ? '当前选定（右屏）' : '选定右屏'}
                      type="button"
                    >
                      2
                    </button>
                  </div>
                  <div className={`relative flex-1 overflow-hidden ${activePane === 'secondary' ? 'ring-2 ring-inset ring-blue-500/20' : ''}`}>
                    {renderPaneContent(secondaryContent, 'secondary')}
                  </div>
                </div>
              )}
            </div>

            <div className="absolute bottom-4 right-4 z-50">
              <button
                onClick={() => setIsImmersive(prev => !prev)}
                className="rounded-lg bg-white p-2 text-gray-600 shadow-md transition-colors hover:text-blue-600"
                title={isImmersive ? '退出沉浸模式' : '进入沉浸模式'}
              >
                {isImmersive ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </>
      )}

      <WorkspaceCategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategory(undefined);
        }}
        onSave={handleSaveCategory}
        initialData={editingCategory}
      />
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => {
          setIsWorkspaceModalOpen(false);
          setEditingWorkspace(undefined);
        }}
        onSave={handleSaveWorkspace}
        categoryId={selectedCategoryId || DEFAULT_WORKSPACE_CATEGORIES[0].id}
        initialData={editingWorkspace}
      />
      <WorkspaceSectionModal
        isOpen={isSectionModalOpen}
        onClose={() => {
          setIsSectionModalOpen(false);
          setEditingSection(undefined);
        }}
        onSave={handleSaveCustomSection}
        initialData={editingSection}
      />
      <ModuleModal
        isOpen={isModuleModalOpen}
        onClose={() => {
          setIsModuleModalOpen(false);
          setEditingModule(undefined);
          setModuleParentSectionId(null);
        }}
        onSave={handleSaveModule}
        initialData={editingModule}
      />
      <ItemModal
        isOpen={!!itemModalState}
        onClose={() => setItemModalState(null)}
        initialState={itemModalState}
        onSave={handleSaveItem}
      />
      <MarkdownCreateModal
        isOpen={!!markdownModalState}
        moduleTitle={markdownModalState?.moduleTitle}
        onClose={() => setMarkdownModalState(null)}
        onCreate={handleCreateMarkdown}
      />
      <MarkdownRenameModal
        isOpen={!!markdownRenameState}
        initialState={markdownRenameState}
        onClose={() => setMarkdownRenameState(null)}
        onConfirm={handleRenameMarkdown}
      />
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMoveTarget(null)}>
          <div className="max-h-96 w-80 overflow-hidden rounded-xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800">
                <ArrowRightLeft className="h-4 w-4 text-orange-500" />
                移动到章节
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">选择目标章节</p>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto p-2">
              {getSectionModules(moveTarget.sectionId)
                .filter(module => module.id !== moveTarget.sourceModuleId)
                .map(module => (
                  <button
                    key={module.id}
                    onClick={() => handleConfirmMove(module.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    <FolderOpen className="h-4 w-4 text-gray-400" />
                    {module.title}
                  </button>
                ))}
            </div>
            <div className="flex justify-end border-t border-gray-100 px-4 py-2">
              <button onClick={() => setMoveTarget(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        variant={confirmState?.variant}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
      <FloatingChatWindow
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        title="知识库 AI 助手"
        allowMaximize={false}
      >
        <React.Suspense fallback={<div className="flex h-full items-center justify-center text-gray-400">加载中...</div>}>
          <KnowledgeBase compact />
        </React.Suspense>
      </FloatingChatWindow>
    </div>
  );
};

export default WorkspaceManager;
