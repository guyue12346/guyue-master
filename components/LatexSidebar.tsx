import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, FileType2, BookOpen, ChevronRight, ChevronDown,
  Star, User, PanelLeftClose, MoreHorizontal, Edit2, FolderPlus,
  File, FilePlus, Check, X, Presentation, RefreshCw, Pencil, ArrowRight,
  Folder, Heart, Globe, Beaker, Lightbulb, Music, Camera, Coffee,
  Briefcase, Rocket, Cpu, Palette, Feather, Shield, Zap, Award,
  type LucideIcon,
} from 'lucide-react';
import { LatexTemplate, LatexManagedFile, LatexFileCategory } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

// Category metadata (icon + color) persisted via saveAppData
interface CategoryMeta {
  icon: string;   // icon name from ICON_OPTIONS
  color: string;  // hex color from COLOR_OPTIONS
}

type CategoryMetaMap = Record<string, CategoryMeta>;

const CATEGORY_META_KEY = 'latex-category-meta';

// Selectable icons for custom categories
const ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: 'FileType2', icon: FileType2 },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Star', icon: Star },
  { name: 'Folder', icon: Folder },
  { name: 'Heart', icon: Heart },
  { name: 'Globe', icon: Globe },
  { name: 'Beaker', icon: Beaker },
  { name: 'Lightbulb', icon: Lightbulb },
  { name: 'Music', icon: Music },
  { name: 'Camera', icon: Camera },
  { name: 'Coffee', icon: Coffee },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'Rocket', icon: Rocket },
  { name: 'Cpu', icon: Cpu },
  { name: 'Palette', icon: Palette },
  { name: 'Feather', icon: Feather },
  { name: 'Shield', icon: Shield },
  { name: 'Zap', icon: Zap },
  { name: 'Award', icon: Award },
  { name: 'Presentation', icon: Presentation },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(ICON_OPTIONS.map(o => [o.name, o.icon]));

// Selectable colors
const COLOR_OPTIONS = [
  { name: '灰色', value: '#6B7280' },
  { name: '蓝色', value: '#3B82F6' },
  { name: '绿色', value: '#22C55E' },
  { name: '红色', value: '#EF4444' },
  { name: '紫色', value: '#A855F7' },
  { name: '橙色', value: '#F97316' },
  { name: '粉色', value: '#EC4899' },
  { name: '黄色', value: '#EAB308' },
  { name: '青色', value: '#06B6D4' },
  { name: '靛色', value: '#6366F1' },
];

interface LatexSidebarProps {
  currentContent: string;
  /** Load template content into editor for editing (save will update this template) */
  onEditTemplate: (template: LatexTemplate) => void;
  /** Create a new file from template content (ask filename, then open) */
  onLoadTemplateAsFile: (templateContent: string) => void;
  onOpenManagedFile: (file: { path: string; content: string }) => void;
  onCollapse: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BUILTIN_CATEGORY_LABELS: Record<string, string> = {
  article: '文章',
  beamer: '幻灯片',
  resume: '简历',
  math: '数学',
  custom: '自定义',
};

const BUILTIN_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  article: <BookOpen className="w-3.5 h-3.5" />,
  beamer: <Presentation className="w-3.5 h-3.5" />,
  resume: <User className="w-3.5 h-3.5" />,
  math: <Star className="w-3.5 h-3.5" />,
  custom: <Plus className="w-3.5 h-3.5" />,
};

function getCategoryLabel(cat: string) {
  return BUILTIN_CATEGORY_LABELS[cat] ?? cat;
}

function getCategoryIcon(cat: string, metaMap?: CategoryMetaMap) {
  // Check user-defined metadata first
  const meta = metaMap?.[cat];
  if (meta) {
    const IconComp = ICON_MAP[meta.icon];
    if (IconComp) return <IconComp className="w-3.5 h-3.5" style={{ color: meta.color }} />;
  }
  return BUILTIN_CATEGORY_ICONS[cat] ?? <FileType2 className="w-3.5 h-3.5" />;
}

// ─── Inline rename input ──────────────────────────────────────────────────────

interface InlineEditProps {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  className?: string;
}

const InlineEdit: React.FC<InlineEditProps> = ({ value, onCommit, onCancel, className }) => {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const commit = () => { const s = v.trim(); if (s) onCommit(s); else onCancel(); };

  return (
    <input
      ref={ref}
      value={v}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
      className={`bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-blue-400 w-full ${className ?? ''}`}
    />
  );
};

// ─── Context menu (dropdown) ──────────────────────────────────────────────────

interface MenuAction { label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void; }

interface ContextMenuProps {
  actions: MenuAction[];
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ actions, onClose, anchorRef }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-7 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[130px]"
      onClick={e => e.stopPropagation()}
    >
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={() => { a.onClick(); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-gray-50 ${a.danger ? 'text-red-500' : 'text-gray-700'}`}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  );
};

// ─── Category Editor Popover ──────────────────────────────────────────────────

interface CategoryEditorProps {
  initialName?: string;
  initialIcon?: string;
  initialColor?: string;
  onCommit: (name: string, icon: string, color: string) => void;
  onCancel: () => void;
}

const CategoryEditorPopover: React.FC<CategoryEditorProps> = ({
  initialName = '',
  initialIcon = 'Folder',
  initialColor = '#6B7280',
  onCommit,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState(initialIcon);
  const [color, setColor] = useState(initialColor);
  const nameRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  const handleCommit = () => {
    if (name.trim()) onCommit(name.trim(), icon, color);
    else onCancel();
  };

  const SelectedIcon = ICON_MAP[icon] ?? FileType2;

  return (
    <div ref={popRef} className="mx-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2.5" onClick={e => e.stopPropagation()}>
      {/* Name input */}
      <div className="flex items-center gap-2">
        <span style={{ color }}><SelectedIcon className="w-4 h-4" /></span>
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCommit(); if (e.key === 'Escape') onCancel(); }}
          placeholder="分类名称"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-800 outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
        />
      </div>
      {/* Icon grid */}
      <div>
        <p className="text-[10px] text-gray-400 mb-1">图标</p>
        <div className="grid grid-cols-10 gap-0.5">
          {ICON_OPTIONS.map(opt => {
            const I = opt.icon;
            const sel = icon === opt.name;
            return (
              <button
                key={opt.name}
                onClick={() => setIcon(opt.name)}
                className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${sel ? 'bg-blue-100 ring-1 ring-blue-400' : 'hover:bg-gray-100'}`}
                title={opt.name}
              >
                <I className="w-3 h-3" style={{ color: sel ? color : '#9CA3AF' }} />
              </button>
            );
          })}
        </div>
      </div>
      {/* Color grid */}
      <div>
        <p className="text-[10px] text-gray-400 mb-1">颜色</p>
        <div className="flex gap-1">
          {COLOR_OPTIONS.map(c => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              className={`w-5 h-5 rounded-full border-2 transition-all ${color === c.value ? 'border-gray-800 scale-110' : 'border-transparent hover:border-gray-300'}`}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>
      </div>
      {/* Buttons */}
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button onClick={onCancel} className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
        <button
          onClick={handleCommit}
          disabled={!name.trim()}
          className="px-2.5 py-1 text-[11px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >确定</button>
      </div>
    </div>
  );
};

// ─── Template Tab ─────────────────────────────────────────────────────────────

interface TemplateTabProps {
  currentContent: string;
  onEditTemplate: (template: LatexTemplate) => void;
  onLoadTemplateAsFile: (templateContent: string) => void;
}

const TemplateTab: React.FC<TemplateTabProps> = ({ currentContent, onEditTemplate, onLoadTemplateAsFile }) => {
  const [templates, setTemplates] = useState<LatexTemplate[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // category menu
  const [catMenuOpen, setCatMenuOpen] = useState<string | null>(null);
  const [catRenaming, setCatRenaming] = useState<string | null>(null);
  const catMenuRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});
  // template menu
  const [tplMenuOpen, setTplMenuOpen] = useState<string | null>(null);
  const [tplRenaming, setTplRenaming] = useState<string | null>(null);
  const [tplMoving, setTplMoving] = useState<string | null>(null); // template id being moved
  const tplMenuRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});
  // add / edit category
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCatMeta, setEditingCatMeta] = useState<string | null>(null); // category name being edited
  // category metadata (icon + color)
  const [catMeta, setCatMeta] = useState<CategoryMetaMap>({});
  // save-as-template modal
  const [saveModal, setSaveModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState('custom');
  const [saving, setSaving] = useState(false);

  // Load category metadata
  const loadCatMeta = useCallback(async () => {
    const data = await window.electronAPI?.loadAppData?.(CATEGORY_META_KEY).catch(() => null);
    if (data && typeof data === 'object') setCatMeta(data as CategoryMetaMap);
  }, []);

  const saveCatMeta = useCallback(async (meta: CategoryMetaMap) => {
    setCatMeta(meta);
    await window.electronAPI?.saveAppData?.(CATEGORY_META_KEY, meta).catch(() => null);
  }, []);

  const load = useCallback(async () => {
    const list = await window.electronAPI?.latexGetTemplates?.().catch(() => null);
    if (list) setTemplates(list);
  }, []);

  useEffect(() => { load(); loadCatMeta(); }, [load, loadCatMeta]);

  // Derive sorted categories
  const grouped = templates.reduce<Record<string, LatexTemplate[]>>((acc, t) => {
    const cat = t.category || 'custom';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});
  const PRIO = ['article', 'beamer', 'resume', 'math', 'custom'];
  const sortedCats = [
    ...PRIO.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !PRIO.includes(c)),
  ];
  const allCategories = sortedCats; // for move-to selector

  // ensure ref maps are populated
  sortedCats.forEach(c => { if (!catMenuRefs.current[c]) catMenuRefs.current[c] = React.createRef(); });
  templates.forEach(t => { if (!tplMenuRefs.current[t.id]) tplMenuRefs.current[t.id] = React.createRef(); });

  // ── Category actions ──
  const handleRenameCategory = async (oldName: string, newName: string) => {
    setCatRenaming(null);
    if (!newName.trim() || newName === oldName) return;
    // Migrate metadata to new name
    const newMeta = { ...catMeta };
    if (newMeta[oldName]) {
      newMeta[newName] = newMeta[oldName];
      delete newMeta[oldName];
      await saveCatMeta(newMeta);
    }
    await window.electronAPI?.latexRenameCategory?.({ oldName, newName }).catch(() => null);
    load();
  };

  const handleDeleteCategory = async (cat: string) => {
    const moveTo = sortedCats.find(c => c !== cat) ?? 'custom';
    // Clean up metadata
    if (catMeta[cat]) {
      const newMeta = { ...catMeta };
      delete newMeta[cat];
      await saveCatMeta(newMeta);
    }
    await window.electronAPI?.latexDeleteCategory?.({ categoryName: cat, moveToCategory: moveTo }).catch(() => null);
    load();
  };

  const handleAddCategory = async (name: string, icon: string, color: string) => {
    setAddingCategory(false);
    if (!name.trim()) return;
    // Save icon & color metadata
    await saveCatMeta({ ...catMeta, [name.trim()]: { icon, color } });
    // Create a placeholder template so the category appears
    const tpl: LatexTemplate = {
      id: `custom-cat-${Date.now()}`,
      name: '新模板',
      content: '',
      category: name.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await window.electronAPI?.latexSaveTemplate?.(tpl).catch(() => null);
    load();
  };

  // ── Template actions ──
  const handleEditCategoryMeta = async (cat: string, icon: string, color: string) => {
    setEditingCatMeta(null);
    await saveCatMeta({ ...catMeta, [cat]: { icon, color } });
  };

  const handleRenameTemplate = async (id: string, newName: string) => {
    setTplRenaming(null);
    const tpl = templates.find(t => t.id === id);
    if (!tpl || !newName.trim()) return;
    await window.electronAPI?.latexSaveTemplate?.({ ...tpl, name: newName.trim(), updatedAt: Date.now() }).catch(() => null);
    load();
  };

  const handleMoveTemplate = async (id: string, newCat: string) => {
    setTplMoving(null);
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    await window.electronAPI?.latexSaveTemplate?.({ ...tpl, category: newCat, updatedAt: Date.now() }).catch(() => null);
    load();
  };

  const handleDeleteTemplate = async (id: string) => {
    await window.electronAPI?.latexDeleteTemplate?.(id).catch(() => null);
    load();
  };

  const handleSaveAsTemplate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const tpl: LatexTemplate = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      content: currentContent,
      category: newCat,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await window.electronAPI?.latexSaveTemplate?.(tpl).catch(() => null);
    await load();
    setSaving(false);
    setSaveModal(false);
    setNewName(''); setNewDesc(''); setNewCat('custom');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
        <span className="text-xs text-gray-400 font-medium">模板库</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAddingCategory(true)}
            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="新建分类"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setSaveModal(true)}
            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="将当前内容另存为模板"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* New category editor */}
        {addingCategory && (
          <CategoryEditorPopover
            onCommit={(name, icon, color) => handleAddCategory(name, icon, color)}
            onCancel={() => setAddingCategory(false)}
          />
        )}

        {sortedCats.length === 0 && !addingCategory && (
          <div className="flex flex-col items-center justify-center h-24 text-gray-300 gap-2">
            <FileType2 className="w-7 h-7" />
            <p className="text-xs">暂无模板</p>
          </div>
        )}

        {sortedCats.map(cat => (
          <div key={cat} className="mb-0.5">
            {/* Category row */}
            <div className="group/cat flex items-center gap-1 px-2 py-1 mx-1 rounded-lg hover:bg-gray-100 transition-colors">
              <button
                onClick={() => setCollapsed(p => ({ ...p, [cat]: !p[cat] }))}
                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              >
                {collapsed[cat]
                  ? <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                  : <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />}
                <span className="text-gray-500 shrink-0">{getCategoryIcon(cat, catMeta)}</span>
                {catRenaming === cat ? (
                  <InlineEdit
                    value={getCategoryLabel(cat)}
                    onCommit={v => handleRenameCategory(cat, v)}
                    onCancel={() => setCatRenaming(null)}
                  />
                ) : (
                  <span className="text-[13px] font-semibold text-gray-600 flex-1 truncate">
                    {getCategoryLabel(cat)}
                  </span>
                )}
              </button>
              <span className="text-[10px] text-gray-400 bg-gray-200 rounded-full px-1.5 leading-none py-0.5 shrink-0">
                {grouped[cat]?.length ?? 0}
              </span>
              {/* Category menu */}
              <div className="relative shrink-0 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                <button
                  ref={catMenuRefs.current[cat] as React.RefObject<HTMLButtonElement>}
                  onClick={e => { e.stopPropagation(); setCatMenuOpen(catMenuOpen === cat ? null : cat); }}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {catMenuOpen === cat && (
                  <ContextMenu
                    anchorRef={catMenuRefs.current[cat]}
                    onClose={() => setCatMenuOpen(null)}
                    actions={[
                      { label: '编辑图标', icon: <Palette className="w-3 h-3" />, onClick: () => { setEditingCatMeta(cat); setCollapsed(p => ({ ...p, [cat]: false })); } },
                      { label: '重命名', icon: <Edit2 className="w-3 h-3" />, onClick: () => { setCatRenaming(cat); setCollapsed(p => ({ ...p, [cat]: false })); } },
                      { label: '删除分类', icon: <Trash2 className="w-3 h-3" />, danger: true, onClick: () => handleDeleteCategory(cat) },
                    ]}
                  />
                )}
              </div>
            </div>

            {/* Category meta editor */}
            {editingCatMeta === cat && (
              <CategoryEditorPopover
                initialName={getCategoryLabel(cat)}
                initialIcon={catMeta[cat]?.icon ?? 'Folder'}
                initialColor={catMeta[cat]?.color ?? '#6B7280'}
                onCommit={(_name, icon, color) => handleEditCategoryMeta(cat, icon, color)}
                onCancel={() => setEditingCatMeta(null)}
              />
            )}

            {/* Template items */}
            {!collapsed[cat] && (grouped[cat] || []).map(t => (
              <div
                key={t.id}
                className="group/tpl flex items-center gap-1 px-3 py-1.5 mx-1 rounded-lg hover:bg-white hover:shadow-sm transition-all"
                title={t.description || t.name}
              >
                <div className="flex-1 min-w-0">
                  {tplRenaming === t.id ? (
                    <InlineEdit
                      value={t.name}
                      onCommit={v => handleRenameTemplate(t.id, v)}
                      onCancel={() => setTplRenaming(null)}
                    />
                  ) : (
                    <>
                      <p className="text-xs text-gray-700 truncate font-medium leading-tight">{t.name}</p>
                      {t.description && (
                        <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{t.description}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Edit & Load buttons */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/tpl:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); onEditTemplate(t); }}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="编辑模板"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); t.content && onLoadTemplateAsFile(t.content); }}
                    className="p-1 rounded text-green-500 hover:text-green-700 hover:bg-green-50 transition-colors"
                    title="以此模板新建文件"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Move-to-category popover */}
                {tplMoving === t.id && (
                  <div
                    className="absolute right-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[120px]"
                    onClick={e => e.stopPropagation()}
                  >
                    <p className="text-[10px] text-gray-400 px-3 pt-1 pb-0.5 font-semibold">移动到分类</p>
                    {allCategories.filter(c => c !== cat).map(c => (
                      <button
                        key={c}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => handleMoveTemplate(t.id, c)}
                      >
                        {getCategoryLabel(c)}
                      </button>
                    ))}
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100 mt-0.5"
                      onClick={() => setTplMoving(null)}
                    >
                      取消
                    </button>
                  </div>
                )}

                {/* Template menu */}
                <div className="relative shrink-0 opacity-0 group-hover/tpl:opacity-100 transition-opacity">
                  <button
                    ref={tplMenuRefs.current[t.id] as React.RefObject<HTMLButtonElement>}
                    onClick={e => { e.stopPropagation(); setTplMenuOpen(tplMenuOpen === t.id ? null : t.id); }}
                    className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {tplMenuOpen === t.id && (
                    <ContextMenu
                      anchorRef={tplMenuRefs.current[t.id]}
                      onClose={() => setTplMenuOpen(null)}
                      actions={[
                        { label: '重命名', icon: <Edit2 className="w-3 h-3" />, onClick: () => setTplRenaming(t.id) },
                        { label: '移动分类', icon: <FolderPlus className="w-3 h-3" />, onClick: () => setTplMoving(t.id) },
                        { label: '删除', icon: <Trash2 className="w-3 h-3" />, danger: true, onClick: () => handleDeleteTemplate(t.id) },
                      ]}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Save-as-template modal */}
      {saveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setSaveModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">另存为模板</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">模板名称 *</label>
                <input
                  autoFocus
                  type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="例如：中文毕业论文"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveAsTemplate(); }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">描述（可选）</label>
                <input
                  type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="简短描述此模板用途"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">分类</label>
                <select
                  value={newCat} onChange={e => setNewCat(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                >
                  {allCategories.map(c => (
                    <option key={c} value={c}>{getCategoryLabel(c)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setSaveModal(false)} className="flex-1 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">取消</button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={saving || !newName.trim()}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Files Tab ────────────────────────────────────────────────────────────────

const UNCATEGORIZED_KEY = '__uncategorized__';

interface FilesTabProps {
  onOpenFile: (file: { path: string; content: string }) => void;
  activeFilePath: string | null;
}

const FilesTab: React.FC<FilesTabProps> = ({ onOpenFile, activeFilePath }) => {
  const [files, setFiles] = useState<LatexManagedFile[]>([]);
  const [categories, setCategories] = useState<LatexFileCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingFile, setAddingFile] = useState(false);
  const [addingFileInCat, setAddingFileInCat] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState<string | null>(null);
  const [fileMoving, setFileMoving] = useState<string | null>(null);
  const fileMenuRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});
  // category UI
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingCategory, setAddingCategory] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState<string | null>(null);
  const [catRenaming, setCatRenaming] = useState<string | null>(null);
  const [editingCatMeta, setEditingCatMeta] = useState<string | null>(null);
  const catMenuRefs = useRef<Record<string, React.RefObject<HTMLButtonElement | null>>>({});
  // file category metadata (icon + color) — share the same meta key with templates
  const [catMeta, setCatMeta] = useState<CategoryMetaMap>({});
  const FILE_CAT_META_KEY = 'latex-file-category-meta';

  const loadCatMeta = useCallback(async () => {
    const data = await window.electronAPI?.loadAppData?.(FILE_CAT_META_KEY).catch(() => null);
    if (data && typeof data === 'object') setCatMeta(data as CategoryMetaMap);
  }, []);

  const saveCatMeta = useCallback(async (meta: CategoryMetaMap) => {
    setCatMeta(meta);
    await window.electronAPI?.saveAppData?.(FILE_CAT_META_KEY, meta).catch(() => null);
  }, []);

  const loadCategories = useCallback(async () => {
    const cats = await window.electronAPI?.latexGetFileCategories?.().catch(() => null);
    if (cats) setCategories(cats);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [list] = await Promise.all([
      window.electronAPI?.latexListFiles?.().catch(() => null),
      loadCategories(),
      loadCatMeta(),
    ]);
    if (list) setFiles(list);
    setLoading(false);
  }, [loadCategories, loadCatMeta]);

  useEffect(() => { load(); }, [load]);

  files.forEach(f => {
    if (!fileMenuRefs.current[f.path]) fileMenuRefs.current[f.path] = React.createRef();
  });
  categories.forEach(c => {
    if (!catMenuRefs.current[c.id]) catMenuRefs.current[c.id] = React.createRef();
  });
  if (!catMenuRefs.current[UNCATEGORIZED_KEY]) catMenuRefs.current[UNCATEGORIZED_KEY] = React.createRef();

  // Group files by category
  const grouped = files.reduce<Record<string, LatexManagedFile[]>>((acc, f) => {
    const key = f.category || UNCATEGORIZED_KEY;
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  // Sorted category IDs: uncategorized first, then user categories in order
  const sortedCatIds = [
    ...(grouped[UNCATEGORIZED_KEY] ? [UNCATEGORIZED_KEY] : []),
    ...categories.map(c => c.id).filter(id => grouped[id]),
    ...categories.map(c => c.id).filter(id => !grouped[id]),
  ];
  // Deduplicate (categories with and without files)
  const seenIds = new Set<string>();
  const uniqueCatIds: string[] = [];
  // Always show uncategorized first
  if (!seenIds.has(UNCATEGORIZED_KEY)) {
    uniqueCatIds.push(UNCATEGORIZED_KEY);
    seenIds.add(UNCATEGORIZED_KEY);
  }
  for (const id of categories.map(c => c.id)) {
    if (!seenIds.has(id)) { uniqueCatIds.push(id); seenIds.add(id); }
  }

  const getCatName = (id: string) => {
    if (id === UNCATEGORIZED_KEY) return '未分类';
    return categories.find(c => c.id === id)?.name ?? id;
  };

  const getCatIcon = (id: string) => {
    if (id === UNCATEGORIZED_KEY) return <Folder className="w-3.5 h-3.5 text-gray-400" />;
    const meta = catMeta[id];
    if (meta) {
      const IconComp = ICON_MAP[meta.icon];
      if (IconComp) return <IconComp className="w-3.5 h-3.5" style={{ color: meta.color }} />;
    }
    return <Folder className="w-3.5 h-3.5 text-gray-500" />;
  };

  // ── File actions ──
  const handleNew = async (name: string, categoryId?: string) => {
    setAddingFile(false);
    setAddingFileInCat(null);
    if (!name.trim()) return;
    const result = await window.electronAPI?.latexNewManagedFile?.(name).catch(() => null);
    if (result) {
      // Assign category if needed
      if (categoryId && categoryId !== UNCATEGORIZED_KEY) {
        await window.electronAPI?.latexSetFileCategory?.({ filePath: result.path, categoryId }).catch(() => null);
      }
      await load();
      onOpenFile(result);
    }
  };

  const handleOpen = async (file: LatexManagedFile) => {
    const result = await window.electronAPI?.latexOpenManagedFile?.(file.path).catch(() => null);
    if (result) onOpenFile(result);
  };

  const handleRename = async (filePath: string, newName: string) => {
    setRenamingPath(null);
    if (!newName.trim()) return;
    const newPath = await window.electronAPI?.latexRenameManagedFile?.({ filePath, newName }).catch(() => null);
    if (newPath) load();
  };

  const handleDelete = async (filePath: string) => {
    await window.electronAPI?.latexDeleteManagedFile?.(filePath).catch(() => null);
    load();
  };

  const handleMoveFile = async (filePath: string, categoryId: string) => {
    setFileMoving(null);
    await window.electronAPI?.latexSetFileCategory?.({
      filePath,
      categoryId: categoryId === UNCATEGORIZED_KEY ? '' : categoryId,
    }).catch(() => null);
    load();
  };

  // ── Category actions ──
  const handleAddCategory = async (name: string, icon: string, color: string) => {
    setAddingCategory(false);
    if (!name.trim()) return;
    const id = crypto.randomUUID();
    const newCats = [...categories, { id, name: name.trim() }];
    await window.electronAPI?.latexSaveFileCategories?.(newCats).catch(() => null);
    await saveCatMeta({ ...catMeta, [id]: { icon, color } });
    await loadCategories();
  };

  const handleRenameCategory = async (catId: string, newName: string) => {
    setCatRenaming(null);
    if (!newName.trim()) return;
    const newCats = categories.map(c => c.id === catId ? { ...c, name: newName.trim() } : c);
    await window.electronAPI?.latexSaveFileCategories?.(newCats).catch(() => null);
    await loadCategories();
  };

  const handleEditCategoryMeta = async (catId: string, _name: string, icon: string, color: string) => {
    setEditingCatMeta(null);
    await saveCatMeta({ ...catMeta, [catId]: { icon, color } });
  };

  const handleDeleteCategory = async (catId: string) => {
    // Move all files in this category to uncategorized
    const filesInCat = grouped[catId] || [];
    for (const f of filesInCat) {
      await window.electronAPI?.latexSetFileCategory?.({ filePath: f.path, categoryId: '' }).catch(() => null);
    }
    const newCats = categories.filter(c => c.id !== catId);
    await window.electronAPI?.latexSaveFileCategories?.(newCats).catch(() => null);
    // Clean up metadata
    if (catMeta[catId]) {
      const newMeta = { ...catMeta };
      delete newMeta[catId];
      await saveCatMeta(newMeta);
    }
    load();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const renderFile = (f: LatexManagedFile, catId: string) => (
    <div
      key={f.path}
      className={`group/file flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-all ${
        activeFilePath === f.path
          ? 'bg-blue-50 shadow-sm'
          : 'hover:bg-white hover:shadow-sm'
      }`}
      onClick={() => handleOpen(f)}
    >
      <File className={`w-3.5 h-3.5 shrink-0 ${activeFilePath === f.path ? 'text-blue-500' : 'text-gray-400'}`} />
      <div className="flex-1 min-w-0">
        {renamingPath === f.path ? (
          <InlineEdit
            value={f.name.replace(/\.tex$/, '')}
            onCommit={v => handleRename(f.path, v)}
            onCancel={() => setRenamingPath(null)}
          />
        ) : (
          <>
            <p className={`text-sm truncate font-medium leading-tight ${activeFilePath === f.path ? 'text-blue-700' : 'text-gray-700'}`}>
              {f.name}
            </p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
              {formatDate(f.modifiedAt)} · {formatSize(f.size)}
            </p>
          </>
        )}
      </div>

      {/* Move-to-category popover */}
      {fileMoving === f.path && (
        <div
          className="absolute right-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 min-w-[120px]"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-[10px] text-gray-400 px-3 pt-1 pb-0.5 font-semibold">移动到分类</p>
          {[UNCATEGORIZED_KEY, ...categories.map(c => c.id)].filter(id => id !== catId).map(id => (
            <button
              key={id}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              onClick={() => handleMoveFile(f.path, id)}
            >
              {getCatName(id)}
            </button>
          ))}
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t border-gray-100 mt-0.5"
            onClick={() => setFileMoving(null)}
          >
            取消
          </button>
        </div>
      )}

      {/* File menu */}
      <div className="relative shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity">
        <button
          ref={fileMenuRefs.current[f.path] as React.RefObject<HTMLButtonElement>}
          onClick={e => { e.stopPropagation(); setFileMenuOpen(fileMenuOpen === f.path ? null : f.path); }}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
        {fileMenuOpen === f.path && (
          <ContextMenu
            anchorRef={fileMenuRefs.current[f.path]}
            onClose={() => setFileMenuOpen(null)}
            actions={[
              { label: '重命名', icon: <Edit2 className="w-3 h-3" />, onClick: () => setRenamingPath(f.path) },
              { label: '移动分类', icon: <FolderPlus className="w-3 h-3" />, onClick: () => setFileMoving(f.path) },
              { label: '删除', icon: <Trash2 className="w-3 h-3" />, danger: true, onClick: () => handleDelete(f.path) },
            ]}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Sub-toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
        <span className="text-xs text-gray-400 font-medium">我的文件</span>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="刷新"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setAddingCategory(true)}
            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="新建分类"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setAddingFile(true)}
            className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="新建文件"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* New category editor */}
        {addingCategory && (
          <CategoryEditorPopover
            onCommit={(name, icon, color) => handleAddCategory(name, icon, color)}
            onCancel={() => setAddingCategory(false)}
          />
        )}

        {/* New file (uncategorized) */}
        {addingFile && (
          <div className="px-3 py-1.5 flex items-center gap-2">
            <File className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <InlineEdit
              value="untitled"
              onCommit={name => handleNew(name)}
              onCancel={() => setAddingFile(false)}
            />
          </div>
        )}

        {!loading && files.length === 0 && categories.length === 0 && !addingFile && !addingCategory && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-2 px-4 text-center">
            <FileType2 className="w-8 h-8" />
            <p className="text-xs">暂无文件</p>
            <p className="text-[10px] text-gray-300">点击 + 新建 .tex 文件</p>
          </div>
        )}

        {uniqueCatIds.map(catId => {
          const catFiles = grouped[catId] || [];
          const isUncategorized = catId === UNCATEGORIZED_KEY;
          return (
            <div key={catId} className="mb-0.5">
              {/* Category row */}
              <div className="group/cat flex items-center gap-1 px-2 py-1 mx-1 rounded-lg hover:bg-gray-100 transition-colors">
                <button
                  onClick={() => setCollapsed(p => ({ ...p, [catId]: !p[catId] }))}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                >
                  {collapsed[catId]
                    ? <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                    : <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />}
                  <span className="shrink-0">{getCatIcon(catId)}</span>
                  {catRenaming === catId && !isUncategorized ? (
                    <InlineEdit
                      value={getCatName(catId)}
                      onCommit={v => handleRenameCategory(catId, v)}
                      onCancel={() => setCatRenaming(null)}
                    />
                  ) : (
                    <span className="text-[13px] font-semibold truncate flex-1 text-gray-600">
                      {getCatName(catId)}
                    </span>
                  )}
                </button>
                <span className="text-[10px] text-gray-400 bg-gray-200 rounded-full px-1.5 leading-none py-0.5 shrink-0">
                  {catFiles.length}
                </span>
                {/* Category menu */}
                {!isUncategorized && (
                  <div className="relative shrink-0 opacity-0 group-hover/cat:opacity-100 transition-opacity">
                    <button
                      ref={catMenuRefs.current[catId] as React.RefObject<HTMLButtonElement>}
                      onClick={e => { e.stopPropagation(); setCatMenuOpen(catMenuOpen === catId ? null : catId); }}
                      className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    {catMenuOpen === catId && (
                      <ContextMenu
                        anchorRef={catMenuRefs.current[catId]}
                        onClose={() => setCatMenuOpen(null)}
                        actions={[
                          { label: '新建文件', icon: <FilePlus className="w-3 h-3" />, onClick: () => { setAddingFileInCat(catId); setCollapsed(p => ({ ...p, [catId]: false })); } },
                          { label: '编辑图标', icon: <Palette className="w-3 h-3" />, onClick: () => { setEditingCatMeta(catId); setCollapsed(p => ({ ...p, [catId]: false })); } },
                          { label: '重命名', icon: <Edit2 className="w-3 h-3" />, onClick: () => { setCatRenaming(catId); setCollapsed(p => ({ ...p, [catId]: false })); } },
                          { label: '删除分类', icon: <Trash2 className="w-3 h-3" />, danger: true, onClick: () => handleDeleteCategory(catId) },
                        ]}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Category meta editor */}
              {editingCatMeta === catId && (
                <CategoryEditorPopover
                  initialName={getCatName(catId)}
                  initialIcon={catMeta[catId]?.icon ?? 'Folder'}
                  initialColor={catMeta[catId]?.color ?? '#6B7280'}
                  onCommit={(name, icon, color) => handleEditCategoryMeta(catId, name, icon, color)}
                  onCancel={() => setEditingCatMeta(null)}
                />
              )}

              {/* New file in category */}
              {addingFileInCat === catId && !collapsed[catId] && (
                <div className="px-3 py-1.5 ml-2 flex items-center gap-2">
                  <File className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <InlineEdit
                    value="untitled"
                    onCommit={name => handleNew(name, catId)}
                    onCancel={() => setAddingFileInCat(null)}
                  />
                </div>
              )}

              {/* File items */}
              {!collapsed[catId] && catFiles.map(f => renderFile(f, catId))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export const LatexSidebar: React.FC<LatexSidebarProps> = ({
  currentContent,
  onEditTemplate,
  onLoadTemplateAsFile,
  onOpenManagedFile,
  onCollapse,
}) => {
  const [tab, setTab] = useState<'templates' | 'files'>('templates');
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const handleOpenFile = (file: { path: string; content: string }) => {
    setActiveFilePath(file.path);
    onOpenManagedFile(file);
  };

  return (
    <div className="w-60 flex flex-col h-full bg-[#F5F5F5] border-r border-gray-200 shrink-0 select-none">
      {/* Header */}
      <div
        className="h-12 flex items-center justify-between px-3 border-b border-gray-200 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Tabs */}
          <button
            onClick={() => setTab('templates')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              tab === 'templates'
                ? 'bg-white shadow-sm text-gray-800'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            模板
          </button>
          <button
            onClick={() => setTab('files')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              tab === 'files'
                ? 'bg-white shadow-sm text-gray-800'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
            }`}
          >
            <File className="w-3.5 h-3.5" />
            文件
          </button>
        </div>

        {/* Collapse button */}
        <button
          onClick={onCollapse}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          title="收起侧边栏"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'templates' ? (
          <TemplateTab
            currentContent={currentContent}
            onEditTemplate={onEditTemplate}
            onLoadTemplateAsFile={onLoadTemplateAsFile}
          />
        ) : (
          <FilesTab onOpenFile={handleOpenFile} activeFilePath={activeFilePath} />
        )}
      </div>
    </div>
  );
};
