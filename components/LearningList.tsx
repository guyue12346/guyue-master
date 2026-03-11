import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, ChevronRight, PlayCircle, FileText, Code, CheckCircle2, Circle, Folder, Info, Trash2, FileUp, Plus, Link, Edit2, Book, Globe, Music, Image, GripVertical, Search, ArrowRightLeft, X } from 'lucide-react';
import { CourseData, Module, Lecture, AssignmentModule, PersonalModule, ResourceItem, CourseCategory, LectureIcon, LECTURE_ICONS, CustomSection } from './LearningData';
import { getCategoryIcon, AVAILABLE_ICONS, AVAILABLE_COLORS } from './LearningConstants';
import { LearningMDModal } from './LearningMDModal';
import { ConfirmDialog } from './ConfirmDialog';
import {
  copyFileToDestination,
  deleteResourceFile,
  deleteModuleFolder,
  SectionType,
  SECTION_NAMES
} from '../utils/learningStorage';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Portal-based dropdown to avoid overflow clipping
interface DropdownPortalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
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
        left: rect.right - 160 // 160 is the dropdown width (w-40)
      });
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is outside both the trigger button and the dropdown menu
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
      className="fixed w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999]"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};

// Sortable Item Component for lectures
interface SortableLectureItemProps {
  id: string;
  children: React.ReactNode;
}

const SortableLectureItem: React.FC<SortableLectureItemProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center group/item">
      <button
        {...attributes}
        {...listeners}
        className="p-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover/item:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="flex-1">{children}</div>
    </div>
  );
};

// Sortable Item Component for resource items (assignments/personal)
interface SortableResourceItemProps {
  id: string;
  children: React.ReactNode;
}

const SortableResourceItem: React.FC<SortableResourceItemProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center group/item">
      <button
        {...attributes}
        {...listeners}
        className="p-1 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover/item:opacity-100 transition-opacity"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <div className="flex-1">{children}</div>
    </div>
  );
};

interface LearningListProps {
  course: CourseData;
  categories: CourseCategory[];
  selectedItemId: string | null; 
  activeVideoId: string | null;
  activeNoteId: string | null;
  activeCustomNotePath: string | null;
  onSelectItem: (type: 'video' | 'note' | 'assignment' | 'intro' | 'custom-note' | 'personal-resource', id: string) => void;
  progress: Record<string, boolean>;
  onToggleProgress: (id: string) => void;
  onUpdateCourse: (updatedCourse: CourseData) => void;
}

export const LearningList: React.FC<LearningListProps> = ({ 
  course,
  categories,
  activeVideoId,
  activeNoteId,
  activeCustomNotePath,
  onSelectItem,
  progress,
  onToggleProgress,
  onUpdateCourse
}) => {
  const expandedStorageKey = `learning_expanded_${course.id}`;

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`${expandedStorageKey}_sections`);
      return saved ? JSON.parse(saved) : { 'resources': true, 'assignments': true, 'personal': true };
    } catch { return { 'resources': true, 'assignments': true, 'personal': true }; }
  });
  
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`${expandedStorageKey}_modules`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // UI States for Inputs/Dialogs
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [addingModuleSection, setAddingModuleSection] = useState<'resources' | 'assignments' | 'personal'>('resources');
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');

  const [addingLinkModuleId, setAddingLinkModuleId] = useState<string | null>(null);
  const [addingLinkSection, setAddingLinkSection] = useState<string | null>(null);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkIcon, setNewLinkIcon] = useState<LectureIcon>('link');

  // 根据图标类型渲染对应图标
  const renderIcon = (icon: LectureIcon | undefined, className: string = "w-3.5 h-3.5 flex-shrink-0") => {
    switch (icon) {
      case 'video': return <PlayCircle className={className} />;
      case 'file': return <FileText className={className} />;
      case 'book': return <Book className={className} />;
      case 'code': return <Code className={className} />;
      case 'globe': return <Globe className={className} />;
      case 'music': return <Music className={className} />;
      case 'image': return <Image className={className} />;
      default: return <Link className={className} />;
    }
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // #3: Unified drag end handler for all sections
  const handleDragEnd = (moduleId: string, section: 'resources' | 'assignments' | 'personal') => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (section === 'resources') {
      const module = course.modules.find(m => m.id === moduleId);
      if (!module) return;
      const oldIndex = module.lectures.findIndex(l => l.id === active.id);
      const newIndex = module.lectures.findIndex(l => l.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onUpdateCourse({ ...course, modules: course.modules.map(m => m.id === moduleId ? { ...m, lectures: arrayMove(m.lectures, oldIndex, newIndex) } : m) });
      }
    } else {
      const key = section === 'assignments' ? 'assignmentModules' : 'personalModules';
      const modules = course[key] || [];
      const module = modules.find(m => m.id === moduleId);
      if (!module) return;
      const oldIndex = module.items.findIndex(i => i.id === active.id);
      const newIndex = module.items.findIndex(i => i.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onUpdateCourse({ ...course, [key]: modules.map(m => m.id === moduleId ? { ...m, items: arrayMove(m.items, oldIndex, newIndex) } : m) });
      }
    }
  };

  const [expandedAssignmentModules, setExpandedAssignmentModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`${expandedStorageKey}_assignment_modules`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [expandedPersonalModules, setExpandedPersonalModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`${expandedStorageKey}_personal_modules`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Custom sections expanded state
  const [expandedCustomSections, setExpandedCustomSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`${expandedStorageKey}_custom_sections`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [expandedCustomModules, setExpandedCustomModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`${expandedStorageKey}_custom_modules`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Custom section modal state (add/edit a custom top-level section)
  const [customSectionModal, setCustomSectionModal] = useState<{
    mode: 'add' | 'edit';
    editingId?: string;
    title: string;
    icon: string;
    color: string;
  } | null>(null);

  // Adding a module to a custom section
  const [addingCustomModuleForSection, setAddingCustomModuleForSection] = useState<string | null>(null);

  const [pendingUpload, setPendingUpload] = useState<{
    file: { path: string; name: string };
    targetId: string; // moduleId
    section: string; // 'resources' | 'assignments' | 'personal' | customSectionId
  } | null>(null);

  // MD Modal State
  const [isMDModalOpen, setIsMDModalOpen] = useState(false);
  const [mdModalModuleId, setMdModalModuleId] = useState<string | null>(null);
  const [mdModalSection, setMdModalSection] = useState<'resources' | 'assignments' | 'personal'>('resources');
  const [mdModalModuleName, setMdModalModuleName] = useState('');

  // Rename Modal State
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    type: 'lecture' | 'item' | 'module';
    section: 'resources' | 'assignments' | 'personal';
    moduleId: string;
    itemId: string;
    currentTitle: string;
    filePath: string;
  } | null>(null);

  // Dropdown Menu State for + button
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const dropdownRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // #13: Custom confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'default';
  } | null>(null);

  // #11: In-course search
  const [searchQuery, setSearchQuery] = useState('');

  // #12: Cross-chapter move
  const [moveTarget, setMoveTarget] = useState<{
    itemId: string;
    sourceModuleId: string;
    section: 'resources' | 'assignments' | 'personal';
  } | null>(null);

  // #14: Batch operations
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchSection, setBatchSection] = useState<'resources' | 'assignments' | 'personal' | null>(null);
  const [batchModuleId, setBatchModuleId] = useState<string | null>(null);

  const toggleBatchSelect = (id: string, section: 'resources' | 'assignments' | 'personal', moduleId: string) => {
    if (batchSection && batchSection !== section) return; // 不允许跨 section 选择
    if (batchModuleId && batchModuleId !== moduleId) return; // 不允许跨 module 选择
    setBatchSection(section);
    setBatchModuleId(moduleId);
    setBatchSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setBatchSelected(new Set());
    setBatchSection(null);
    setBatchModuleId(null);
  };

  const handleBatchDelete = () => {
    if (batchSelected.size === 0 || !batchSection || !batchModuleId) return;
    setConfirmState({
      title: '批量删除',
      message: `确定要删除选中的 ${batchSelected.size} 项吗？`,
      variant: 'danger',
      onConfirm: () => {
        const ids = batchSelected;
        if (batchSection === 'resources') {
          onUpdateCourse({
            ...course,
            modules: course.modules.map(m =>
              m.id === batchModuleId ? { ...m, lectures: m.lectures.filter(l => !ids.has(l.id)) } : m
            )
          });
        } else if (batchSection === 'assignments') {
          onUpdateCourse({
            ...course,
            assignmentModules: (course.assignmentModules || []).map(m =>
              m.id === batchModuleId ? { ...m, items: m.items.filter(i => !ids.has(i.id)) } : m
            )
          });
        } else {
          onUpdateCourse({
            ...course,
            personalModules: (course.personalModules || []).map(m =>
              m.id === batchModuleId ? { ...m, items: m.items.filter(i => !ids.has(i.id)) } : m
            )
          });
        }
        exitBatchMode();
        setConfirmState(null);
      },
    });
  };

  // ==================== Module Management ====================
  
  const handleAddModule = (section: 'resources' | 'assignments' | 'personal') => {
    setIsAddingModule(true);
    setAddingModuleSection(section);
    setNewModuleTitle('');
    setNewModuleDesc('');
    setExpandedSections(prev => ({ ...prev, [section]: true }));
  };

  const confirmAddModule = async () => {
    if (!newModuleTitle.trim()) {
      setIsAddingModule(false);
      return;
    }

    // 先生成 ID，再用 ID 构建磁盘路径（与标题解耦）
    const moduleId = `mod_${Date.now()}`;
    const category = categories.find(c => c.id === course.categoryId);

    try {
      const { getModulePath } = await import('../utils/learningStorage');
      const modulePath = await getModulePath(
        category?.id || course.categoryId,
        course.id,
        addingModuleSection as SectionType,
        moduleId
      );
      if (window.electronAPI) {
        await window.electronAPI.ensureDir(modulePath);
      }
    } catch (error) {
      console.error('Failed to create module folder:', error);
    }

    if (addingModuleSection === 'resources') {
      const newModule: Module = {
        id: moduleId,
        title: newModuleTitle,
        description: newModuleDesc,
        lectures: []
      };
      const updatedCourse = {
        ...course,
        modules: [...course.modules, newModule]
      };
      onUpdateCourse(updatedCourse);
    } else if (addingModuleSection === 'assignments') {
      const newModule: AssignmentModule = {
        id: moduleId,
        title: newModuleTitle,
        description: newModuleDesc,
        items: []
      };
      const currentModules = course.assignmentModules || [];
      const updatedCourse = {
        ...course,
        assignmentModules: [...currentModules, newModule]
      };
      onUpdateCourse(updatedCourse);
    } else if (addingModuleSection === 'personal') {
      const newModule: PersonalModule = {
        id: moduleId,
        title: newModuleTitle,
        description: newModuleDesc,
        items: []
      };
      const currentModules = course.personalModules || [];
      const updatedCourse = {
        ...course,
        personalModules: [...currentModules, newModule]
      };
      onUpdateCourse(updatedCourse);
    }

    setIsAddingModule(false);
    setNewModuleTitle('');
  };

  const handleDeleteModule = (moduleId: string, section: 'resources' | 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      title: '删除章节',
      message: '确定要删除该章节吗？这将同时删除章节内的所有文件。',
      variant: 'danger',
      onConfirm: async () => {
        const category = categories.find(c => c.id === course.categoryId);

        if (section === 'resources') {
          onUpdateCourse({ ...course, modules: course.modules.filter(m => m.id !== moduleId) });
        } else if (section === 'assignments') {
          onUpdateCourse({ ...course, assignmentModules: (course.assignmentModules || []).filter(m => m.id !== moduleId) });
        } else {
          onUpdateCourse({ ...course, personalModules: (course.personalModules || []).filter(m => m.id !== moduleId) });
        }

        // 用 ID 删除磁盘文件夹，无需依赖名称
        await deleteModuleFolder(
          category?.id || course.categoryId,
          course.id,
          section as SectionType,
          moduleId
        );
        setConfirmState(null);
      },
    });
  };

  // ==================== Cross-chapter Move (#12) ====================

  const handleStartMove = (itemId: string, sourceModuleId: string, section: 'resources' | 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    setMoveTarget({ itemId, sourceModuleId, section });
  };

  const handleConfirmMove = (targetModuleId: string) => {
    if (!moveTarget || targetModuleId === moveTarget.sourceModuleId) {
      setMoveTarget(null);
      return;
    }
    const { itemId, sourceModuleId, section } = moveTarget;
    if (section === 'resources') {
      const srcMod = course.modules.find(m => m.id === sourceModuleId);
      const item = srcMod?.lectures.find(l => l.id === itemId);
      if (!item) { setMoveTarget(null); return; }
      onUpdateCourse({
        ...course,
        modules: course.modules.map(m => {
          if (m.id === sourceModuleId) return { ...m, lectures: m.lectures.filter(l => l.id !== itemId) };
          if (m.id === targetModuleId) return { ...m, lectures: [...m.lectures, item] };
          return m;
        })
      });
    } else if (section === 'assignments') {
      const mods = course.assignmentModules || [];
      const srcMod = mods.find(m => m.id === sourceModuleId);
      const item = srcMod?.items.find(i => i.id === itemId);
      if (!item) { setMoveTarget(null); return; }
      onUpdateCourse({
        ...course,
        assignmentModules: mods.map(m => {
          if (m.id === sourceModuleId) return { ...m, items: m.items.filter(i => i.id !== itemId) };
          if (m.id === targetModuleId) return { ...m, items: [...m.items, item] };
          return m;
        })
      });
    } else {
      const mods = course.personalModules || [];
      const srcMod = mods.find(m => m.id === sourceModuleId);
      const item = srcMod?.items.find(i => i.id === itemId);
      if (!item) { setMoveTarget(null); return; }
      onUpdateCourse({
        ...course,
        personalModules: mods.map(m => {
          if (m.id === sourceModuleId) return { ...m, items: m.items.filter(i => i.id !== itemId) };
          if (m.id === targetModuleId) return { ...m, items: [...m.items, item] };
          return m;
        })
      });
    }
    setMoveTarget(null);
  };

  // ==================== File Upload ====================

  const handleAddFile = async (moduleId: string, section: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) {
      alert('请在桌面端使用此功能');
      return;
    }
    
    const file = await window.electronAPI.selectFile();
    if (!file) return;

    setPendingUpload({
      file,
      targetId: moduleId,
      section
    });
  };

  // ==================== MD File Creation ====================

  const handleOpenMDModal = (moduleId: string, moduleName: string, section: 'resources' | 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    setMdModalModuleId(moduleId);
    setMdModalModuleName(moduleName);
    setMdModalSection(section);
    setIsMDModalOpen(true);
    setOpenDropdownId(null); // 关闭下拉菜单
  };

  const handleCreateMD = async (fileName: string) => {
    if (!mdModalModuleId || !window.electronAPI) return;

    const category = categories.find(c => c.id === course.categoryId);

    try {
      const { getModulePath } = await import('../utils/learningStorage');
      // 用 moduleId 定位路径，与模块标题无关
      const modulePath = await getModulePath(
        category?.id || course.categoryId,
        course.id,
        mdModalSection as SectionType,
        mdModalModuleId
      );

      const dirCreated = await window.electronAPI.ensureDir(modulePath);
      if (!dirCreated) { alert('创建目录失败'); return; }

      const filePath = await window.electronAPI.pathJoin(modulePath, fileName);
      const emptyContent = `# ${fileName.replace('.md', '')}\n\n`;

      const success = await window.electronAPI.writeFile(filePath, emptyContent);
      if (!success) { alert('创建文件失败'); return; }

      addMDToModule(filePath, fileName, mdModalModuleId, mdModalSection);
    } catch (error) {
      console.error('Failed to create MD file:', error);
      alert('创建文件失败');
    }
  };

  const addMDToModule = (filePath: string, fileName: string, moduleId: string, section: 'resources' | 'assignments' | 'personal') => {
    const fileTitle = fileName.replace(/\.[^/.]+$/, "");

    if (section === 'resources') {
      const newLecture: Lecture = {
        id: `lec_${Date.now()}`,
        title: fileTitle,
        lecturer: 'User',
        materials: filePath,
        type: 'note',
        date: new Date().toISOString().split('T')[0],
        desc: 'Custom MD File'
      };
      
      const updatedCourse = {
        ...course,
        modules: course.modules.map(m => {
          if (m.id === moduleId) {
            return { ...m, lectures: [...m.lectures, newLecture] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedModules(prev => ({ ...prev, [moduleId]: true }));
    } else if (section === 'assignments') {
      const newItem: ResourceItem = {
        id: `res_${Date.now()}`,
        title: fileTitle,
        link: filePath
      };
      
      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).map(m => {
          if (m.id === moduleId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedAssignmentModules(prev => ({ ...prev, [moduleId]: true }));
    } else if (section === 'personal') {
      const newItem: ResourceItem = {
        id: `res_${Date.now()}`,
        title: fileTitle,
        link: filePath
      };
      
      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).map(m => {
          if (m.id === moduleId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedPersonalModules(prev => ({ ...prev, [moduleId]: true }));
    }
  };

  const confirmUpload = async (shouldCopy: boolean) => {
    if (!pendingUpload) return;
    const { file, targetId, section } = pendingUpload;
    
    let finalPath = file.path;

    if (shouldCopy) {
      const category = categories.find(c => c.id === course.categoryId);
      const categoryId = category?.id || course.categoryId;

      let sectionType: SectionType = 'personal';
      if (section === 'resources') sectionType = 'resources';
      else if (section === 'assignments') sectionType = 'assignments';
      else if (section === 'personal') sectionType = 'personal';
      // custom section → store under personal

      // 直接用 targetId（= moduleId）构建路径，与模块标题无关
      const destPath = await copyFileToDestination(
        file.path,
        categoryId,
        course.id,
        sectionType,
        targetId,
        file.name
      );
      
      if (!destPath) {
        alert('文件上传失败');
        setPendingUpload(null);
        return;
      }
      finalPath = destPath;
    }

    const fileTitle = file.name.replace(/\.[^/.]+$/, "");

    if (section === 'resources') {
      const newLecture: Lecture = {
        id: `lec_${Date.now()}`,
        title: fileTitle,
        lecturer: 'User',
        materials: finalPath,
        type: 'note',
        date: new Date().toISOString().split('T')[0],
        desc: shouldCopy ? 'Custom Upload' : 'Local Reference'
      };
      
      const updatedCourse = {
        ...course,
        modules: course.modules.map(m => {
          if (m.id === targetId) {
            return { ...m, lectures: [...m.lectures, newLecture] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedModules(prev => ({ ...prev, [targetId]: true }));
    } else if (section === 'assignments') {
      const newItem: ResourceItem = {
        id: `assign_item_${Date.now()}`,
        title: fileTitle,
        link: finalPath
      };
      
      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).map(m => {
          if (m.id === targetId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedAssignmentModules(prev => ({ ...prev, [targetId]: true }));
    } else if (section === 'personal') {
      const newItem: ResourceItem = {
        id: `personal_item_${Date.now()}`,
        title: fileTitle,
        link: finalPath
      };
      
      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).map(m => {
          if (m.id === targetId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedPersonalModules(prev => ({ ...prev, [targetId]: true }));
    } else {
      // Custom section upload
      const customSectionId = section;
      const newItem: ResourceItem = {
        id: `custom_item_${Date.now()}`,
        title: fileTitle,
        link: finalPath
      };
      onUpdateCourse({
        ...course,
        customSections: (course.customSections || []).map(s =>
          s.id === customSectionId
            ? { ...s, modules: s.modules.map(m => m.id === targetId ? { ...m, items: [...m.items, newItem] } : m) }
            : s
        )
      });
      setExpandedCustomModules(prev => ({ ...prev, [targetId]: true }));
    }
    
    setPendingUpload(null);
  };

  // ==================== Rename File ====================

  const handleOpenRenameModal = (
    type: 'lecture' | 'item',
    section: 'resources' | 'assignments' | 'personal',
    moduleId: string,
    itemId: string,
    currentTitle: string,
    filePath: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setRenameTarget({ type, section, moduleId, itemId, currentTitle, filePath });
    setIsRenameModalOpen(true);
  };

  const handleRename = async (newTitle: string) => {
    if (!renameTarget || !window.electronAPI) return;

    const { type, section, moduleId, itemId, filePath, currentTitle } = renameTarget;

    // 章节重命名：磁盘文件夹以 moduleId 命名，改名只需更新显示标题
    if (type === 'module') {
      if (section === 'resources') {
        onUpdateCourse({
          ...course,
          modules: course.modules.map(m =>
            m.id === moduleId ? { ...m, title: newTitle } : m
          )
        });
      } else if (section === 'assignments') {
        onUpdateCourse({
          ...course,
          assignmentModules: (course.assignmentModules || []).map(m =>
            m.id === moduleId ? { ...m, title: newTitle } : m
          )
        });
      } else if (section === 'personal') {
        onUpdateCourse({
          ...course,
          personalModules: (course.personalModules || []).map(m =>
            m.id === moduleId ? { ...m, title: newTitle } : m
          )
        });
      }
      setIsRenameModalOpen(false);
      setRenameTarget(null);
      return;
    }

    // 文件重命名
    // 获取文件目录和新路径
    const pathParts = filePath.split('/');
    const oldFileName = pathParts.pop() || '';
    const dirPath = pathParts.join('/');
    const extension = oldFileName.includes('.') ? '.' + oldFileName.split('.').pop() : '';
    const newFileName = newTitle.endsWith(extension) ? newTitle : newTitle + extension;
    const newPath = dirPath + '/' + newFileName;

    // 重命名文件
    const success = await window.electronAPI.renameFile(filePath, newPath);
    if (!success) {
      alert('重命名失败');
      return;
    }

    // 更新课程数据
    const displayTitle = newTitle.replace(/\.[^/.]+$/, "");

    if (type === 'lecture' && section === 'resources') {
      const updatedCourse = {
        ...course,
        modules: course.modules.map(m => {
          if (m.id === moduleId) {
            return {
              ...m,
              lectures: m.lectures.map(l => {
                if (l.id === itemId) {
                  return { ...l, title: displayTitle, materials: newPath };
                }
                return l;
              })
            };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else if (type === 'item' && section === 'assignments') {
      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).map(m => {
          if (m.id === moduleId) {
            return {
              ...m,
              items: m.items.map(item => {
                if (item.id === itemId) {
                  return { ...item, title: displayTitle, link: newPath };
                }
                return item;
              })
            };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else if (type === 'item' && section === 'personal') {
      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).map(m => {
          if (m.id === moduleId) {
            return {
              ...m,
              items: m.items.map(item => {
                if (item.id === itemId) {
                  return { ...item, title: displayTitle, link: newPath };
                }
                return item;
              })
            };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    }

    setIsRenameModalOpen(false);
    setRenameTarget(null);
  };

  // ==================== Link Management ====================

  const handleAddLectureLink = (moduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingLinkModuleId(moduleId);
    setAddingLinkSection('resources');
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkIcon('link');
    setExpandedModules(prev => ({ ...prev, [moduleId]: true }));
  };

  const handleAddLink = (moduleId: string, section: 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingLinkModuleId(moduleId);
    setAddingLinkSection(section);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkIcon('link');
    setExpandedSections(prev => ({ ...prev, [section]: true }));
    if (section === 'assignments') {
      setExpandedAssignmentModules(prev => ({ ...prev, [moduleId]: true }));
    } else {
      setExpandedPersonalModules(prev => ({ ...prev, [moduleId]: true }));
    }
  };

  const confirmAddLink = () => {
    if (!newLinkTitle || !newLinkUrl) {
      setAddingLinkModuleId(null);
      setAddingLinkSection(null);
      return;
    }

    if (addingLinkSection === 'resources' && addingLinkModuleId) {
      const newLecture: Lecture = {
        id: `lec_${Date.now()}`,
        title: newLinkTitle,
        lecturer: 'User',
        materials: newLinkUrl,
        icon: newLinkIcon,
        date: new Date().toISOString().split('T')[0],
        desc: 'External Link'
      };

      const updatedCourse = {
        ...course,
        modules: course.modules.map(m => {
          if (m.id === addingLinkModuleId) {
            return { ...m, lectures: [...m.lectures, newLecture] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else if (addingLinkSection === 'assignments' && addingLinkModuleId) {
      const newItem: ResourceItem = {
        id: `assign_item_${Date.now()}`,
        title: newLinkTitle,
        link: newLinkUrl,
        icon: newLinkIcon
      };

      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).map(m => {
          if (m.id === addingLinkModuleId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else if (addingLinkSection === 'personal' && addingLinkModuleId) {
      const newItem: ResourceItem = {
        id: `personal_item_${Date.now()}`,
        title: newLinkTitle,
        link: newLinkUrl,
        icon: newLinkIcon
      };

      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).map(m => {
          if (m.id === addingLinkModuleId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else if (addingLinkSection && addingLinkModuleId) {
      // Custom section
      const customSectionId = addingLinkSection;
      const newItem: ResourceItem = {
        id: `custom_item_${Date.now()}`,
        title: newLinkTitle,
        link: newLinkUrl,
        icon: newLinkIcon
      };
      onUpdateCourse({
        ...course,
        customSections: (course.customSections || []).map(s =>
          s.id === customSectionId
            ? { ...s, modules: s.modules.map(m => m.id === addingLinkModuleId ? { ...m, items: [...m.items, newItem] } : m) }
            : s
        )
      });
    }

    setAddingLinkModuleId(null);
    setAddingLinkSection(null);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkIcon('link');
  };

  // ==================== Delete Functions ====================

  const handleDeleteLecture = (moduleId: string, lectureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      title: '删除资料',
      message: '确定要删除该资料吗？',
      variant: 'danger',
      onConfirm: async () => {
        const module = course.modules.find(m => m.id === moduleId);
        const lecture = module?.lectures.find(l => l.id === lectureId);
        if (lecture?.materials) await deleteResourceFile(lecture.materials);
        onUpdateCourse({
          ...course,
          modules: course.modules.map(m =>
            m.id === moduleId ? { ...m, lectures: m.lectures.filter(l => l.id !== lectureId) } : m
          )
        });
        setConfirmState(null);
      },
    });
  };

  const handleDeleteItem = (moduleId: string, itemId: string, section: 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      title: '删除资源',
      message: '确定要删除该资源吗？',
      variant: 'danger',
      onConfirm: async () => {
        let itemLink = '';
        if (section === 'assignments') {
          const module = (course.assignmentModules || []).find(m => m.id === moduleId);
          itemLink = module?.items.find(i => i.id === itemId)?.link || '';
          onUpdateCourse({
            ...course,
            assignmentModules: (course.assignmentModules || []).map(m =>
              m.id === moduleId ? { ...m, items: m.items.filter(item => item.id !== itemId) } : m
            )
          });
        } else {
          const module = (course.personalModules || []).find(m => m.id === moduleId);
          itemLink = module?.items.find(i => i.id === itemId)?.link || '';
          onUpdateCourse({
            ...course,
            personalModules: (course.personalModules || []).map(m =>
              m.id === moduleId ? { ...m, items: m.items.filter(item => item.id !== itemId) } : m
            )
          });
        }
        if (itemLink) await deleteResourceFile(itemLink);
        setConfirmState(null);
      },
    });
  };

  // ==================== Custom Section Management ====================

  const handleOpenAddCustomSection = () => {
    setCustomSectionModal({ mode: 'add', title: '', icon: 'Folder', color: 'blue' });
  };

  const handleOpenEditCustomSection = (section: CustomSection) => {
    setCustomSectionModal({ mode: 'edit', editingId: section.id, title: section.title, icon: section.icon, color: section.color });
  };

  const handleSaveCustomSection = () => {
    if (!customSectionModal || !customSectionModal.title.trim()) return;
    if (customSectionModal.mode === 'add') {
      const newSection: CustomSection = {
        id: `custom_sec_${Date.now()}`,
        title: customSectionModal.title.trim(),
        icon: customSectionModal.icon,
        color: customSectionModal.color,
        modules: []
      };
      onUpdateCourse({ ...course, customSections: [...(course.customSections || []), newSection] });
      setExpandedCustomSections(prev => ({ ...prev, [newSection.id]: true }));
    } else if (customSectionModal.mode === 'edit' && customSectionModal.editingId) {
      const id = customSectionModal.editingId;
      onUpdateCourse({
        ...course,
        customSections: (course.customSections || []).map(s =>
          s.id === id ? { ...s, title: customSectionModal.title.trim(), icon: customSectionModal.icon, color: customSectionModal.color } : s
        )
      });
    }
    setCustomSectionModal(null);
  };

  const handleDeleteCustomSection = (sectionId: string) => {
    setConfirmState({
      title: '删除目录',
      message: '确定要删除该目录吗？目录内的所有章节和资源将一起删除。',
      variant: 'danger',
      onConfirm: () => {
        onUpdateCourse({ ...course, customSections: (course.customSections || []).filter(s => s.id !== sectionId) });
        setConfirmState(null);
      }
    });
  };

  const handleAddCustomModule = (sectionId: string) => {
    setAddingCustomModuleForSection(sectionId);
    setNewModuleTitle('');
    setNewModuleDesc('');
    setExpandedCustomSections(prev => ({ ...prev, [sectionId]: true }));
  };

  const confirmAddCustomModule = () => {
    if (!newModuleTitle.trim() || !addingCustomModuleForSection) {
      setAddingCustomModuleForSection(null);
      return;
    }
    const newModule: PersonalModule = {
      id: `custom_mod_${Date.now()}`,
      title: newModuleTitle,
      description: newModuleDesc,
      items: []
    };
    onUpdateCourse({
      ...course,
      customSections: (course.customSections || []).map(s =>
        s.id === addingCustomModuleForSection ? { ...s, modules: [...s.modules, newModule] } : s
      )
    });
    setExpandedCustomModules(prev => ({ ...prev, [newModule.id]: true }));
    setAddingCustomModuleForSection(null);
    setNewModuleTitle('');
  };

  const handleDeleteCustomModule = (sectionId: string, moduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      title: '删除章节',
      message: '确定要删除该章节吗？这将同时删除章节内的所有资源。',
      variant: 'danger',
      onConfirm: () => {
        onUpdateCourse({
          ...course,
          customSections: (course.customSections || []).map(s =>
            s.id === sectionId ? { ...s, modules: s.modules.filter(m => m.id !== moduleId) } : s
          )
        });
        setConfirmState(null);
      }
    });
  };

  const handleDeleteCustomItem = (sectionId: string, moduleId: string, itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      title: '删除资源',
      message: '确定要删除该资源吗？',
      variant: 'danger',
      onConfirm: async () => {
        const section = (course.customSections || []).find(s => s.id === sectionId);
        const mod = section?.modules.find(m => m.id === moduleId);
        const itemLink = mod?.items.find(i => i.id === itemId)?.link || '';
        onUpdateCourse({
          ...course,
          customSections: (course.customSections || []).map(s =>
            s.id === sectionId
              ? { ...s, modules: s.modules.map(m => m.id === moduleId ? { ...m, items: m.items.filter(i => i.id !== itemId) } : m) }
              : s
          )
        });
        if (itemLink) await deleteResourceFile(itemLink);
        setConfirmState(null);
      }
    });
  };

  const handleAddCustomLink = (sectionId: string, moduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingLinkModuleId(moduleId);
    setAddingLinkSection(sectionId);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkIcon('link');
    setExpandedCustomSections(prev => ({ ...prev, [sectionId]: true }));
    setExpandedCustomModules(prev => ({ ...prev, [moduleId]: true }));
  };

  const handleAddCustomFile = async (sectionId: string, moduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) {
      alert('请在桌面端使用此功能');
      return;
    }
    const file = await window.electronAPI.selectFile();
    if (!file) return;
    setPendingUpload({ file, targetId: moduleId, section: sectionId });
  };

  // ==================== Persist Expanded State ====================

  useEffect(() => {
    localStorage.setItem(`${expandedStorageKey}_sections`, JSON.stringify(expandedSections));
  }, [expandedSections, expandedStorageKey]);

  useEffect(() => {
    localStorage.setItem(`${expandedStorageKey}_modules`, JSON.stringify(expandedModules));
  }, [expandedModules, expandedStorageKey]);

  useEffect(() => {
    localStorage.setItem(`${expandedStorageKey}_assignment_modules`, JSON.stringify(expandedAssignmentModules));
  }, [expandedAssignmentModules, expandedStorageKey]);

  useEffect(() => {
    localStorage.setItem(`${expandedStorageKey}_personal_modules`, JSON.stringify(expandedPersonalModules));
  }, [expandedPersonalModules, expandedStorageKey]);

  useEffect(() => {
    localStorage.setItem(`${expandedStorageKey}_custom_sections`, JSON.stringify(expandedCustomSections));
  }, [expandedCustomSections, expandedStorageKey]);

  useEffect(() => {
    localStorage.setItem(`${expandedStorageKey}_custom_modules`, JSON.stringify(expandedCustomModules));
  }, [expandedCustomModules, expandedStorageKey]);

  // ==================== UI Helpers ====================

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  // 按名称自然排序（支持数字前缀如 01, 02, 10）
  const sortByTitle = <T extends { title: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })
    );
  };

  // #11: 搜索过滤逻辑
  const sq = searchQuery.trim().toLowerCase();
  const filteredModules = useMemo(() => {
    if (!sq) return sortByTitle(course.modules);
    return sortByTitle(course.modules).filter(m =>
      m.title.toLowerCase().includes(sq) || m.lectures.some(l => l.title.toLowerCase().includes(sq))
    );
  }, [course.modules, sq]);
  const filteredAssignmentModules = useMemo(() => {
    const mods = course.assignmentModules || [];
    if (!sq) return sortByTitle(mods);
    return sortByTitle(mods).filter(m =>
      m.title.toLowerCase().includes(sq) || m.items.some(i => i.title.toLowerCase().includes(sq))
    );
  }, [course.assignmentModules, sq]);
  const filteredPersonalModules = useMemo(() => {
    const mods = course.personalModules || [];
    if (!sq) return sortByTitle(mods);
    return sortByTitle(mods).filter(m =>
      m.title.toLowerCase().includes(sq) || m.items.some(i => i.title.toLowerCase().includes(sq))
    );
  }, [course.personalModules, sq]);

  return (
    <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="font-bold text-gray-800">{course.title}</h2>
        <p className="text-xs text-gray-500 mt-1">{course.description}</p>
        <div className="mt-2 flex items-center gap-1">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索章节或资料..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-gray-50"
            />
          </div>
          <button
            onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
            className={`p-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
              batchMode ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
            title={batchMode ? '退出批量模式' : '批量操作'}
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        
        {/* Upload Choice Modal */}
        {pendingUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">导入文件</h3>
              <p className="text-sm text-gray-600 mb-4">
                您希望如何导入文件 <span className="font-medium text-gray-800">{pendingUpload.file.name}</span>？
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => confirmUpload(true)}
                  className="w-full flex items-center justify-between p-3 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-blue-900">复制到资料库 (推荐)</div>
                    <div className="text-xs text-blue-700 mt-0.5">文件将保存到归档目录，独立于原文件</div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </button>
                
                <button
                  onClick={() => confirmUpload(false)}
                  className="w-full flex items-center justify-between p-3 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-gray-900">仅引用路径</div>
                    <div className="text-xs text-gray-500 mt-0.5">仅保存文件链接，依赖原文件位置</div>
                  </div>
                  <Link className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setPendingUpload(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Course Introduction */}
        <button 
          onClick={() => onSelectItem('intro', 'intro')}
          className={`w-full px-3 py-2 flex items-center gap-2 rounded-lg transition-colors text-sm font-medium
            ${activeVideoId === 'intro' ? 'bg-blue-100 text-blue-700' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}
          `}
        >
          <Info className="w-4 h-4 text-blue-500" />
          学习总览
        </button>

        {/* Course Resources Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200">
            <button
              onClick={() => toggleSection('resources')}
              className="flex-1 px-3 py-2 flex items-center gap-2 font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Folder className="w-4 h-4 text-blue-500" />
              学习内容
              {expandedSections['resources'] ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
            </button>
            <button
              onClick={() => handleAddModule('resources')}
              className="p-2 hover:bg-gray-200 text-gray-500 transition-colors"
              title="添加章节"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Module Input */}
          {isAddingModule && addingModuleSection === 'resources' && (
            <div className="p-2 border-b border-gray-100 bg-blue-50/50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  autoFocus
                  type="text"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                  placeholder="输入章节名称..."
                  className="flex-1 text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                />
                <button onClick={confirmAddModule} className="p-1 text-blue-600 hover:bg-blue-100 rounded">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsAddingModule(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newModuleDesc}
                onChange={(e) => setNewModuleDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                placeholder="输入章节备注 (可选)..."
                className="w-full text-xs px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400 text-gray-600"
              />
            </div>
          )}
          
          {expandedSections['resources'] && (
            <div className="">
              {filteredModules.map((module) => (
                <div key={module.id} className="border-b border-gray-100 last:border-0 group/module">
                  <div className="flex items-center justify-between hover:bg-gray-50 transition-colors pr-2">
                    <button 
                      onClick={() => toggleModule(module.id)}
                      className="flex-1 px-3 py-2 flex items-center justify-between text-left"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{module.title}</div>
                        <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>
                      </div>
                      {expandedModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                    </button>
                    <div className="flex items-center opacity-0 group-hover/module:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleAddLectureLink(module.id, e)}
                        className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                        title="添加链接"
                      >
                        <Link className="w-3.5 h-3.5" />
                      </button>
                      <button
                        ref={(el) => { dropdownRefs.current[`res-${module.id}`] = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === `res-${module.id}` ? null : `res-${module.id}`);
                        }}
                        className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                        title="添加资料"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <DropdownPortal
                        isOpen={openDropdownId === `res-${module.id}`}
                        onClose={() => setOpenDropdownId(null)}
                        triggerRef={{ current: dropdownRefs.current[`res-${module.id}`] }}
                      >
                        <button
                          onClick={(e) => {
                            handleAddFile(module.id, 'resources', e);
                            setOpenDropdownId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <FileUp className="w-3.5 h-3.5" />
                          上传文件
                        </button>
                        <button
                          onClick={(e) => handleOpenMDModal(module.id, module.title, 'resources', e)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          新建 MD
                        </button>
                      </DropdownPortal>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget({ type: 'module', section: 'resources', moduleId: module.id, itemId: '', currentTitle: module.title, filePath: '' });
                          setIsRenameModalOpen(true);
                        }}
                        className="p-1.5 hover:bg-blue-100 hover:text-blue-500 rounded text-gray-400"
                        title="重命名章节"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteModule(module.id, 'resources', e)}
                        className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                        title="删除章节"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {expandedModules[module.id] && (
                    <div className="bg-gray-50/50 pb-2">
                      
                      {/* Add Link Input */}
                      {addingLinkModuleId === module.id && addingLinkSection === 'resources' && (
                        <div className="px-3 py-2 bg-blue-50/30 border-b border-blue-100 mb-2">
                          <div className="space-y-2">
                            <input
                              autoFocus
                              type="text"
                              value={newLinkTitle}
                              onChange={(e) => setNewLinkTitle(e.target.value)}
                              placeholder="资料标题"
                              className="w-full text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                            />
                            <input
                              type="text"
                              value={newLinkUrl}
                              onChange={(e) => setNewLinkUrl(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                              placeholder="链接 URL (http://...)"
                              className="w-full text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                            />
                            {/* Icon Selector */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs text-gray-500 mr-1">图标:</span>
                              {LECTURE_ICONS.map((iconItem) => (
                                <button
                                  key={iconItem.value}
                                  type="button"
                                  onClick={() => setNewLinkIcon(iconItem.value)}
                                  className={`p-1.5 rounded transition-colors ${
                                    newLinkIcon === iconItem.value
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                  title={iconItem.label}
                                >
                                  {renderIcon(iconItem.value, "w-3.5 h-3.5")}
                                </button>
                              ))}
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setAddingLinkModuleId(null); setAddingLinkSection(null); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
                              <button onClick={confirmAddLink} className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">添加</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 学习内容列表 */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd(module.id, 'resources')}
                      >
                        <SortableContext
                          items={module.lectures.map(l => l.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {module.lectures.map((lec) => {
                            const isMDFile = lec.materials?.toLowerCase().endsWith('.md');
                            const isActive = activeVideoId === lec.id || activeNoteId === lec.id;
                            return (
                              <SortableLectureItem key={lec.id} id={lec.id}>
                                <div
                                  className={`px-2 py-1.5 flex items-center justify-between cursor-pointer transition-colors
                                    ${isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
                                  `}
                                  onClick={() => batchMode ? toggleBatchSelect(lec.id, 'resources', module.id) : onSelectItem('note', lec.id)}
                                >
                                  <div className="flex items-center gap-2 overflow-hidden">
                                    {batchMode && (
                                      <span className="flex-shrink-0">
                                        {batchSelected.has(lec.id) ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> : <Circle className="w-3.5 h-3.5 text-gray-300" />}
                                      </span>
                                    )}
                                    {lec.icon ? (
                                      renderIcon(lec.icon)
                                    ) : lec.materials?.startsWith('http') ? (
                                      <Link className="w-3.5 h-3.5 flex-shrink-0" />
                                    ) : (
                                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                    )}
                                    <span className="text-sm truncate">{lec.title}</span>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100">
                                    {isMDFile && (
                                      <button
                                        onClick={(e) => handleOpenRenameModal('lecture', 'resources', module.id, lec.id, lec.title, lec.materials || '', e)}
                                        className="p-1 hover:text-blue-500 transition-colors"
                                        title="修改文件名"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                    )}
                                    {course.modules.length > 1 && (
                                      <button
                                        onClick={(e) => handleStartMove(lec.id, module.id, 'resources', e)}
                                        className="p-1 hover:text-orange-500 transition-colors"
                                        title="移动到其它章节"
                                      >
                                        <ArrowRightLeft className="w-3 h-3" />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => handleDeleteLecture(module.id, lec.id, e)}
                                      className="p-1 hover:text-red-500 transition-opacity"
                                      title="删除"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              </SortableLectureItem>
                            );
                          })}
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignments Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200">
            <button 
              onClick={() => toggleSection('assignments')}
              className="flex-1 px-3 py-2 flex items-center gap-2 font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Code className="w-4 h-4 text-green-500" />
              学习练习
              {expandedSections['assignments'] ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
            </button>
            <button
              onClick={() => handleAddModule('assignments')}
              className="p-2 hover:bg-gray-200 text-gray-500 transition-colors"
              title="添加章节"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Module Input for Assignments */}
          {isAddingModule && addingModuleSection === 'assignments' && (
            <div className="p-2 border-b border-gray-100 bg-green-50/50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  autoFocus
                  type="text"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                  placeholder="输入章节名称..."
                  className="flex-1 text-sm px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400"
                />
                <button onClick={confirmAddModule} className="p-1 text-green-600 hover:bg-green-100 rounded">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsAddingModule(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newModuleDesc}
                onChange={(e) => setNewModuleDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                placeholder="输入章节备注 (可选)..."
                className="w-full text-xs px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400 text-gray-600"
              />
            </div>
          )}
          
          {expandedSections['assignments'] && (
            <div className="">
              {(course.assignmentModules || []).length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">暂无章节，点击 + 添加</div>
              ) : (
                filteredAssignmentModules.map((module) => (
                  <div key={module.id} className="border-b border-gray-100 last:border-0 group/module">
                    <div className="flex items-center justify-between hover:bg-gray-50 transition-colors pr-2">
                      <button 
                        onClick={() => setExpandedAssignmentModules(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                        className="flex-1 px-3 py-2 flex items-center justify-between text-left"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{module.title}</div>
                          {module.description && <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>}
                        </div>
                        {expandedAssignmentModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                      </button>
                      <div className="flex items-center opacity-0 group-hover/module:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleAddLink(module.id, 'assignments', e)}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加链接"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </button>
                        <button
                          ref={(el) => { dropdownRefs.current[`assign-${module.id}`] = el; }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdownId(openDropdownId === `assign-${module.id}` ? null : `assign-${module.id}`);
                          }}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加文件"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <DropdownPortal
                          isOpen={openDropdownId === `assign-${module.id}`}
                          onClose={() => setOpenDropdownId(null)}
                          triggerRef={{ current: dropdownRefs.current[`assign-${module.id}`] }}
                        >
                          <button
                            onClick={(e) => {
                              handleAddFile(module.id, 'assignments', e);
                              setOpenDropdownId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                          >
                            <FileUp className="w-3.5 h-3.5" />
                            上传文件
                          </button>
                          <button
                            onClick={(e) => handleOpenMDModal(module.id, module.title, 'assignments', e)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            新建 MD
                          </button>
                        </DropdownPortal>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameTarget({ type: 'module', section: 'assignments', moduleId: module.id, itemId: '', currentTitle: module.title, filePath: '' });
                            setIsRenameModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-blue-100 hover:text-blue-500 rounded text-gray-400"
                          title="重命名章节"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteModule(module.id, 'assignments', e)}
                          className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                          title="删除章节"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {expandedAssignmentModules[module.id] && (
                      <div className="bg-gray-50/50 pb-2">
                        {/* Add Link Input */}
                        {addingLinkSection === 'assignments' && addingLinkModuleId === module.id && (
                          <div className="px-3 py-2 bg-green-50/30 border-b border-green-100 mb-2">
                            <div className="space-y-2">
                              <input
                                autoFocus
                                type="text"
                                value={newLinkTitle}
                                onChange={(e) => setNewLinkTitle(e.target.value)}
                                placeholder="练习标题"
                                className="w-full text-sm px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400"
                              />
                              <input
                                type="text"
                                value={newLinkUrl}
                                onChange={(e) => setNewLinkUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                                placeholder="练习链接 URL"
                                className="w-full text-sm px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400"
                              />
                              {/* Icon Selector */}
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-gray-500 mr-1">图标:</span>
                                {LECTURE_ICONS.map((iconItem) => (
                                  <button
                                    key={iconItem.value}
                                    type="button"
                                    onClick={() => setNewLinkIcon(iconItem.value)}
                                    className={`p-1.5 rounded transition-colors ${
                                      newLinkIcon === iconItem.value
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                    title={iconItem.label}
                                  >
                                    {renderIcon(iconItem.value, "w-3.5 h-3.5")}
                                  </button>
                                ))}
                              </div>
                              <div className="flex justify-end gap-2">
                                <button onClick={() => { setAddingLinkSection(null); setAddingLinkModuleId(null); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
                                <button onClick={confirmAddLink} className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">添加</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {module.items.length === 0 ? (
                          <div className="px-6 py-2 text-xs text-gray-400">暂无练习资源</div>
                        ) : (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd(module.id, 'assignments')}
                          >
                            <SortableContext
                              items={module.items.map(i => i.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {module.items.map((item) => {
                                const isMDFile = item.link?.toLowerCase().endsWith('.md');
                                return (
                                  <SortableResourceItem key={item.id} id={item.id}>
                                    <div
                                      onClick={() => batchMode ? toggleBatchSelect(item.id, 'assignments', module.id) : onSelectItem('assignment', item.link)}
                                      className="px-2 py-1.5 flex items-center justify-between cursor-pointer transition-colors text-gray-600 hover:bg-gray-100"
                                    >
                                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                                        {batchMode ? (
                                          <span className="flex-shrink-0">
                                            {batchSelected.has(item.id) ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> : <Circle className="w-3.5 h-3.5 text-gray-300" />}
                                          </span>
                                        ) : (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); onToggleProgress(item.id); }}
                                            className="flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors"
                                          >
                                            {progress[item.id] ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Circle className="w-3.5 h-3.5" />}
                                          </button>
                                        )}
                                        {item.icon ? (
                                          renderIcon(item.icon)
                                        ) : item.link.startsWith('http') ? (
                                          <Link className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                        ) : (
                                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                        )}
                                        <span className={`text-sm truncate ${progress[item.id] ? 'text-gray-400 line-through' : ''}`}>{item.title}</span>
                                      </div>
                                      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100">
                                        {isMDFile && (
                                          <button
                                            onClick={(e) => handleOpenRenameModal('item', 'assignments', module.id, item.id, item.title, item.link || '', e)}
                                            className="p-1 hover:text-blue-500 transition-colors"
                                            title="修改文件名"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                        )}
                                        {(course.assignmentModules || []).length > 1 && (
                                          <button
                                            onClick={(e) => handleStartMove(item.id, module.id, 'assignments', e)}
                                            className="p-1 hover:text-orange-500 transition-colors"
                                            title="移动到其它章节"
                                          >
                                            <ArrowRightLeft className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button
                                          onClick={(e) => handleDeleteItem(module.id, item.id, 'assignments', e)}
                                          className="p-1 hover:text-red-500 transition-opacity"
                                          title="删除"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  </SortableResourceItem>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Personal Resources Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200">
            <button 
              onClick={() => toggleSection('personal')}
              className="flex-1 px-3 py-2 flex items-center gap-2 font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FileUp className="w-4 h-4 text-orange-500" />
              其它资源
              {expandedSections['personal'] ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
            </button>
            <button
              onClick={() => handleAddModule('personal')}
              className="p-2 hover:bg-gray-200 text-gray-500 transition-colors"
              title="添加章节"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Module Input for Personal */}
          {isAddingModule && addingModuleSection === 'personal' && (
            <div className="p-2 border-b border-gray-100 bg-orange-50/50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  autoFocus
                  type="text"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                  placeholder="输入章节名称..."
                  className="flex-1 text-sm px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400"
                />
                <button onClick={confirmAddModule} className="p-1 text-orange-600 hover:bg-orange-100 rounded">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsAddingModule(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newModuleDesc}
                onChange={(e) => setNewModuleDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                placeholder="输入章节备注 (可选)..."
                className="w-full text-xs px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400 text-gray-600"
              />
            </div>
          )}
          
          {expandedSections['personal'] && (
            <div className="">
              {(course.personalModules || []).length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">暂无章节，点击 + 添加</div>
              ) : (
                filteredPersonalModules.map((module) => (
                  <div key={module.id} className="border-b border-gray-100 last:border-0 group/module">
                    <div className="flex items-center justify-between hover:bg-gray-50 transition-colors pr-2">
                      <button 
                        onClick={() => setExpandedPersonalModules(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                        className="flex-1 px-3 py-2 flex items-center justify-between text-left"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{module.title}</div>
                          {module.description && <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>}
                        </div>
                        {expandedPersonalModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                      </button>
                      <div className="flex items-center opacity-0 group-hover/module:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleAddLink(module.id, 'personal', e)}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加链接"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </button>
                        <button
                          ref={(el) => { dropdownRefs.current[`personal-${module.id}`] = el; }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdownId(openDropdownId === `personal-${module.id}` ? null : `personal-${module.id}`);
                          }}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加文件"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <DropdownPortal
                          isOpen={openDropdownId === `personal-${module.id}`}
                          onClose={() => setOpenDropdownId(null)}
                          triggerRef={{ current: dropdownRefs.current[`personal-${module.id}`] }}
                        >
                          <button
                            onClick={(e) => {
                              handleAddFile(module.id, 'personal', e);
                              setOpenDropdownId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                          >
                            <FileUp className="w-3.5 h-3.5" />
                            上传文件
                          </button>
                          <button
                            onClick={(e) => handleOpenMDModal(module.id, module.title, 'personal', e)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            新建 MD
                          </button>
                        </DropdownPortal>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameTarget({ type: 'module', section: 'personal', moduleId: module.id, itemId: '', currentTitle: module.title, filePath: '' });
                            setIsRenameModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-blue-100 hover:text-blue-500 rounded text-gray-400"
                          title="重命名章节"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteModule(module.id, 'personal', e)}
                          className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                          title="删除章节"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {expandedPersonalModules[module.id] && (
                      <div className="bg-gray-50/50 pb-2">
                        {/* Add Link Input */}
                        {addingLinkSection === 'personal' && addingLinkModuleId === module.id && (
                          <div className="px-3 py-2 bg-orange-50/30 border-b border-orange-100 mb-2">
                            <div className="space-y-2">
                              <input
                                autoFocus
                                type="text"
                                value={newLinkTitle}
                                onChange={(e) => setNewLinkTitle(e.target.value)}
                                placeholder="资源标题"
                                className="w-full text-sm px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400"
                              />
                              <input
                                type="text"
                                value={newLinkUrl}
                                onChange={(e) => setNewLinkUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                                placeholder="资源链接 URL"
                                className="w-full text-sm px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400"
                              />
                              {/* Icon Selector */}
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-gray-500 mr-1">图标:</span>
                                {LECTURE_ICONS.map((iconItem) => (
                                  <button
                                    key={iconItem.value}
                                    type="button"
                                    onClick={() => setNewLinkIcon(iconItem.value)}
                                    className={`p-1.5 rounded transition-colors ${
                                      newLinkIcon === iconItem.value
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                    title={iconItem.label}
                                  >
                                    {renderIcon(iconItem.value, "w-3.5 h-3.5")}
                                  </button>
                                ))}
                              </div>
                              <div className="flex justify-end gap-2">
                                <button onClick={() => { setAddingLinkSection(null); setAddingLinkModuleId(null); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
                                <button onClick={confirmAddLink} className="text-xs bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600">添加</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {module.items.length === 0 ? (
                          <div className="px-6 py-2 text-xs text-gray-400">暂无其它资源</div>
                        ) : (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd(module.id, 'personal')}
                          >
                            <SortableContext
                              items={module.items.map(i => i.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {module.items.map((item) => {
                                const isMDFile = item.link?.toLowerCase().endsWith('.md');
                                return (
                                  <SortableResourceItem key={item.id} id={item.id}>
                                    <div
                                      onClick={() => batchMode ? toggleBatchSelect(item.id, 'personal', module.id) : onSelectItem('personal-resource', item.link)}
                                      className="px-2 py-1.5 flex items-center justify-between cursor-pointer transition-colors text-gray-600 hover:bg-gray-100"
                                    >
                                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                                        {batchMode && (
                                          <span className="flex-shrink-0">
                                            {batchSelected.has(item.id) ? <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> : <Circle className="w-3.5 h-3.5 text-gray-300" />}
                                          </span>
                                        )}
                                        {item.icon ? (
                                          renderIcon(item.icon)
                                        ) : item.link.startsWith('http') ? (
                                          <Link className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                                        ) : (
                                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                        )}
                                        <span className="text-sm truncate">{item.title}</span>
                                      </div>
                                      <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100">
                                        {isMDFile && (
                                          <button
                                            onClick={(e) => handleOpenRenameModal('item', 'personal', module.id, item.id, item.title, item.link || '', e)}
                                            className="p-1 hover:text-blue-500 transition-colors"
                                            title="修改文件名"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                        )}
                                        {(course.personalModules || []).length > 1 && (
                                          <button
                                            onClick={(e) => handleStartMove(item.id, module.id, 'personal', e)}
                                            className="p-1 hover:text-orange-500 transition-colors"
                                            title="移动到其它章节"
                                          >
                                            <ArrowRightLeft className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button
                                          onClick={(e) => handleDeleteItem(module.id, item.id, 'personal', e)}
                                          className="p-1 hover:text-red-500 transition-opacity"
                                          title="删除"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  </SortableResourceItem>
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Custom Sections */}
        {(course.customSections || []).map((customSec) => {
          const colorInfo = AVAILABLE_COLORS.find(c => c.name === customSec.color) || AVAILABLE_COLORS[1];
          const SectionIcon = getCategoryIcon(customSec.icon);
          const isExpanded = !!expandedCustomSections[customSec.id];
          return (
            <div key={customSec.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200 group/csec">
                <button
                  onClick={() => setExpandedCustomSections(prev => ({ ...prev, [customSec.id]: !prev[customSec.id] }))}
                  className="flex-1 px-3 py-2 flex items-center gap-2 font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <SectionIcon className={`w-4 h-4 ${colorInfo.text}`} />
                  {customSec.title}
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
                </button>
                <div className="flex items-center opacity-0 group-hover/csec:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleAddCustomModule(customSec.id)}
                    className="p-1.5 hover:bg-gray-200 text-gray-500 transition-colors"
                    title="添加章节"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOpenEditCustomSection(customSec)}
                    className="p-1.5 hover:bg-blue-100 hover:text-blue-600 text-gray-400 transition-colors"
                    title="编辑目录"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCustomSection(customSec.id)}
                    className="p-1.5 hover:bg-red-100 hover:text-red-500 text-gray-400 transition-colors mr-1"
                    title="删除目录"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Add Module Input for custom section */}
              {addingCustomModuleForSection === customSec.id && (
                <div className={`p-2 border-b border-gray-100 bg-${customSec.color}-50/50`}>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      autoFocus
                      type="text"
                      value={newModuleTitle}
                      onChange={(e) => setNewModuleTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmAddCustomModule()}
                      placeholder="输入章节名称..."
                      className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
                    />
                    <button onClick={confirmAddCustomModule} className={`p-1 ${colorInfo.text} hover:bg-gray-100 rounded`}>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setAddingCustomModuleForSection(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newModuleDesc}
                    onChange={(e) => setNewModuleDesc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmAddCustomModule()}
                    placeholder="输入章节备注 (可选)..."
                    className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-blue-400 text-gray-600"
                  />
                </div>
              )}

              {isExpanded && (
                <div>
                  {customSec.modules.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-4">暂无章节，点击 + 添加</div>
                  ) : (
                    customSec.modules.map((module) => (
                      <div key={module.id} className="border-b border-gray-100 last:border-0 group/module">
                        <div className="flex items-center justify-between hover:bg-gray-50 transition-colors pr-2">
                          <button
                            onClick={() => setExpandedCustomModules(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                            className="flex-1 px-3 py-2 flex items-center justify-between text-left"
                          >
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-800">{module.title}</div>
                              {module.description && <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>}
                            </div>
                            {expandedCustomModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                          </button>
                          <div className="flex items-center opacity-0 group-hover/module:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleAddCustomLink(customSec.id, module.id, e)}
                              className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                              title="添加链接"
                            >
                              <Link className="w-3.5 h-3.5" />
                            </button>
                            <button
                              ref={(el) => { dropdownRefs.current[`custom-${module.id}`] = el; }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDropdownId(openDropdownId === `custom-${module.id}` ? null : `custom-${module.id}`);
                              }}
                              className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                              title="添加文件"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <DropdownPortal
                              isOpen={openDropdownId === `custom-${module.id}`}
                              onClose={() => setOpenDropdownId(null)}
                              triggerRef={{ current: dropdownRefs.current[`custom-${module.id}`] }}
                            >
                              <button
                                onClick={(e) => {
                                  handleAddCustomFile(customSec.id, module.id, e);
                                  setOpenDropdownId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                              >
                                <FileUp className="w-3.5 h-3.5" />
                                上传文件
                              </button>
                            </DropdownPortal>
                            <button
                              onClick={(e) => handleDeleteCustomModule(customSec.id, module.id, e)}
                              className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                              title="删除章节"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {expandedCustomModules[module.id] && (
                          <div className="bg-gray-50/50 pb-2">
                            {/* Add Link Input */}
                            {addingLinkSection === customSec.id && addingLinkModuleId === module.id && (
                              <div className="px-3 py-2 bg-blue-50/30 border-b border-blue-100 mb-2">
                                <div className="space-y-2">
                                  <input
                                    autoFocus
                                    type="text"
                                    value={newLinkTitle}
                                    onChange={(e) => setNewLinkTitle(e.target.value)}
                                    placeholder="资源标题"
                                    className="w-full text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                                  />
                                  <input
                                    type="text"
                                    value={newLinkUrl}
                                    onChange={(e) => setNewLinkUrl(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                                    placeholder="资源链接 URL"
                                    className="w-full text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                                  />
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-xs text-gray-500 mr-1">图标:</span>
                                    {LECTURE_ICONS.map((iconItem) => (
                                      <button
                                        key={iconItem.value}
                                        type="button"
                                        onClick={() => setNewLinkIcon(iconItem.value)}
                                        className={`p-1.5 rounded transition-colors ${newLinkIcon === iconItem.value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        title={iconItem.label}
                                      >
                                        {renderIcon(iconItem.value, "w-3.5 h-3.5")}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <button onClick={() => { setAddingLinkSection(null); setAddingLinkModuleId(null); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
                                    <button onClick={confirmAddLink} className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">添加</button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {module.items.length === 0 ? (
                              <div className="px-6 py-2 text-xs text-gray-400">暂无资源</div>
                            ) : (
                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(event) => {
                                  const { active, over } = event;
                                  if (!over || active.id === over.id) return;
                                  const oldIdx = module.items.findIndex(i => i.id === active.id);
                                  const newIdx = module.items.findIndex(i => i.id === over.id);
                                  if (oldIdx !== -1 && newIdx !== -1) {
                                    onUpdateCourse({
                                      ...course,
                                      customSections: (course.customSections || []).map(s =>
                                        s.id === customSec.id
                                          ? { ...s, modules: s.modules.map(m => m.id === module.id ? { ...m, items: arrayMove(m.items, oldIdx, newIdx) } : m) }
                                          : s
                                      )
                                    });
                                  }
                                }}
                              >
                                <SortableContext items={module.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                  {module.items.map((item) => (
                                    <SortableResourceItem key={item.id} id={item.id}>
                                      <div
                                        onClick={() => onSelectItem('personal-resource', item.link)}
                                        className="px-2 py-1.5 flex items-center justify-between cursor-pointer transition-colors text-gray-600 hover:bg-gray-100"
                                      >
                                        <div className="flex items-center gap-2 overflow-hidden flex-1">
                                          {item.icon ? renderIcon(item.icon) : item.link.startsWith('http') ? <Link className={`w-3.5 h-3.5 flex-shrink-0 ${colorInfo.text}`} /> : <FileText className="w-3.5 h-3.5 flex-shrink-0" />}
                                          <span className="text-sm truncate">{item.title}</span>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100">
                                          <button
                                            onClick={(e) => handleDeleteCustomItem(customSec.id, module.id, item.id, e)}
                                            className="p-1 hover:text-red-500 transition-opacity"
                                            title="删除"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    </SortableResourceItem>
                                  ))}
                                </SortableContext>
                              </DndContext>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add Custom Section Button */}
        <button
          onClick={handleOpenAddCustomSection}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-gray-200 hover:border-blue-300 rounded-lg transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          新建自定义目录
        </button>

      </div>

      {/* Batch Action Bar (#14) */}
      {batchMode && batchSelected.size > 0 && (
        <div className="border-t border-gray-200 bg-white px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-gray-600">已选 <strong>{batchSelected.size}</strong> 项</span>
          <div className="flex items-center gap-2">
            <button onClick={exitBatchMode} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
            <button onClick={handleBatchDelete} className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1">
              <Trash2 className="w-3 h-3" />
              删除
            </button>
          </div>
        </div>
      )}

      {/* Move Target Picker (#12) */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMoveTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-80 max-h-96 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-orange-500" />
                移动到章节
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">选择目标章节</p>
            </div>
            <div className="overflow-y-auto max-h-72 p-2 space-y-1">
              {(moveTarget.section === 'resources' ? course.modules : moveTarget.section === 'assignments' ? (course.assignmentModules || []) : (course.personalModules || []))
                .filter(m => m.id !== moveTarget.sourceModuleId)
                .map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleConfirmMove(m.id)}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Folder className="w-4 h-4 text-gray-400" />
                    {m.title}
                  </button>
                ))
              }
            </div>
            <div className="px-4 py-2 border-t border-gray-100 flex justify-end">
              <button onClick={() => setMoveTarget(null)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* MD Modal */}
      <LearningMDModal
        isOpen={isMDModalOpen}
        onClose={() => setIsMDModalOpen(false)}
        onSave={handleCreateMD}
        moduleName={mdModalModuleName}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState !== null}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        variant={confirmState?.variant as 'danger' | 'default' || 'danger'}
        onConfirm={() => confirmState?.onConfirm?.()}
        onCancel={() => setConfirmState(null)}
      />

      {/* Rename Modal */}
      {isRenameModalOpen && renameTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setIsRenameModalOpen(false); setRenameTarget(null); }}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Edit2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {renameTarget.type === 'module' ? '重命名章节' : '修改文件名'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">当前: {renameTarget.currentTitle}</p>
                </div>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).elements.namedItem('newTitle') as HTMLInputElement;
              handleRename(input.value);
            }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {renameTarget.type === 'module' ? '新章节名' : '新文件名'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="newTitle"
                  defaultValue={renameTarget.type === 'module' ? renameTarget.currentTitle : renameTarget.currentTitle + (renameTarget.filePath.includes('.') ? '.' + renameTarget.filePath.split('.').pop() : '')}
                  placeholder={renameTarget.type === 'module' ? '输入新的章节名称' : '输入新的文件名'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {renameTarget.type !== 'module' && (
                  <p className="mt-2 text-xs text-gray-500">
                    请保留文件扩展名 (如 .md)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setIsRenameModalOpen(false); setRenameTarget(null); }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  确认
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Section Modal (Add / Edit) */}
      {customSectionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setCustomSectionModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900">
                {customSectionModal.mode === 'add' ? '新建自定义目录' : '编辑目录'}
              </h2>
              <button onClick={() => setCustomSectionModal(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">目录名称 <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  type="text"
                  value={customSectionModal.title}
                  onChange={(e) => setCustomSectionModal(prev => prev ? { ...prev, title: e.target.value } : null)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCustomSection()}
                  placeholder="如：笔记、参考文献..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Icon Picker */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">选择图标</label>
                <div className="grid grid-cols-8 gap-1 max-h-28 overflow-y-auto p-1 border border-gray-200 rounded-lg bg-gray-50">
                  {AVAILABLE_ICONS.map(({ name, icon: IconComp }) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setCustomSectionModal(prev => prev ? { ...prev, icon: name } : null)}
                      className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
                        customSectionModal.icon === name ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-200'
                      }`}
                      title={name}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">选择颜色</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setCustomSectionModal(prev => prev ? { ...prev, color: c.name } : null)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${c.bg} ${
                        customSectionModal.color === c.name ? 'border-gray-700 scale-110' : 'border-transparent hover:scale-105'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                {React.createElement(getCategoryIcon(customSectionModal.icon), {
                  className: `w-4 h-4 ${(AVAILABLE_COLORS.find(c => c.name === customSectionModal.color) || AVAILABLE_COLORS[1]).text}`
                })}
                <span className="text-sm font-medium text-gray-700">{customSectionModal.title || '预览目录名称'}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setCustomSectionModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
              <button
                onClick={handleSaveCustomSection}
                disabled={!customSectionModal.title.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {customSectionModal.mode === 'add' ? '创建' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
