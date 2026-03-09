import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Copy, Edit2, Trash2, Eye, EyeOff, Globe, User, KeyRound, StickyNote,
  CheckCircle, Shield, X, Save, AlertCircle, Loader2, Tag, GripVertical, FolderPlus
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { encryptPasswordRecord, decryptPasswordRecord } from '../../utils/passwordCrypto';

// ======== 类型定义 ========
export interface PasswordEntry {
  id: string;
  url: string;       // 加密存储
  account: string;   // 加密存储
  password: string;  // 加密存储
  note: string;      // 加密存储
  tag: string;       // 标签（明文，用于分类）
  sortOrder: number; // 排序权重
  createdAt: number;
  updatedAt: number;
}

interface DecryptedEntry {
  id: string;
  url: string;
  account: string;
  password: string;
  note: string;
  tag: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface PasswordTag {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

// ======== 存储键 ========
const STORAGE_KEY = 'linkmaster_passwords_v1';
const STORAGE_KEY_TAGS = 'linkmaster_password_tags_v1';
const DEFAULT_TAG = '默认';

// ======== 预设颜色 ========
const TAG_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#22c55e',
  '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899',
  '#8b5cf6', '#a855f7', '#64748b', '#78716c',
];

// ======== 辅助函数 ========
const generateId = () => `pw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
};

// ======== 复制按钮 ========
const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };
  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded transition-all flex-shrink-0 ${copied ? 'text-green-500' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}
      title={copied ? '已复制' : `复制${label || ''}`}
    >
      {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// ======== 新增标签弹窗 ========
const TagModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
  initial?: PasswordTag | null;
  existingNames: string[];
}> = ({ isOpen, onClose, onSave, initial, existingNames }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name || '');
      setColor(initial?.color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
      setError('');
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('标签名不能为空'); return; }
    if (trimmed === DEFAULT_TAG) { setError('"默认"为系统保留标签'); return; }
    if (!initial && existingNames.includes(trimmed)) { setError('标签名已存在'); return; }
    onSave(trimmed, color);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {initial ? '编辑标签' : '新增标签'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">标签名称</label>
            <input
              type="text" value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="如：社交、工作、开发..."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              autoFocus
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">颜色</label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl flex items-center gap-1.5">
              <Save className="w-4 h-4" />{initial ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ======== 新增/编辑密码弹窗 ========
const PasswordModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { url: string; account: string; password: string; note: string; tag: string }) => void;
  initial?: DecryptedEntry | null;
  tags: PasswordTag[];
}> = ({ isOpen, onClose, onSave, initial, tags }) => {
  const [url, setUrl] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [tag, setTag] = useState(DEFAULT_TAG);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrl(initial?.url || '');
      setAccount(initial?.account || '');
      setPassword(initial?.password || '');
      setNote(initial?.note || '');
      setTag(initial?.tag || DEFAULT_TAG);
      setShowPassword(false);
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() && !account.trim() && !password.trim()) return;
    onSave({ url: url.trim(), account: account.trim(), password: password.trim(), note: note.trim(), tag });
  };

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
    let result = '';
    const array = new Uint32Array(20);
    crypto.getRandomValues(array);
    for (let i = 0; i < 20; i++) result += chars[array[i] % chars.length];
    setPassword(result);
    setShowPassword(true);
  };

  const allTagOptions = [DEFAULT_TAG, ...tags.map(t => t.name)];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {initial ? '编辑密码' : '新增密码'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* 网址 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Globe className="w-4 h-4 text-gray-400" />网址
            </label>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {/* 账户 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <User className="w-4 h-4 text-gray-400" />账户
            </label>
            <input type="text" value={account} onChange={e => setAccount(e.target.value)} placeholder="用户名 / 邮箱 / 手机号"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {/* 密码 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <KeyRound className="w-4 h-4 text-gray-400" />密码
            </label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码"
                className="w-full px-3 py-2.5 pr-24 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-mono" />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title={showPassword ? '隐藏' : '显示'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button type="button" onClick={generatePassword}
                  className="px-2 py-1 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg">生成</button>
              </div>
            </div>
          </div>

          {/* 标签 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Tag className="w-4 h-4 text-gray-400" />标签
            </label>
            <select value={tag} onChange={e => setTag(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
              {allTagOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* 备注 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <StickyNote className="w-4 h-4 text-gray-400" />备注
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="可选备注信息" rows={2}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl flex items-center gap-2">
              <Save className="w-4 h-4" />{initial ? '保存修改' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ======== 删除确认弹窗 ========
const DeleteConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
}> = ({ isOpen, onClose, onConfirm, itemName }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm m-4 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">确认删除</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              确定要删除 <span className="font-medium text-gray-700 dark:text-gray-300">{itemName}</span> 吗？
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-xl">删除</button>
        </div>
      </div>
    </div>
  );
};

// ======== 可拖拽密码行组件 ========
const SortablePasswordRow: React.FC<{
  entry: DecryptedEntry;
  tagColor: string;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ entry, tagColor, onEdit, onDelete }) => {
  const [showPassword, setShowPassword] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const displayDomain = useMemo(() => {
    try {
      if (!entry.url) return '—';
      const urlObj = new URL(entry.url.startsWith('http') ? entry.url : `https://${entry.url}`);
      return urlObj.hostname;
    } catch { return entry.url || '—'; }
  }, [entry.url]);

  const faviconUrl = useMemo(() => {
    try {
      if (!entry.url) return null;
      const urlObj = new URL(entry.url.startsWith('http') ? entry.url : `https://${entry.url}`);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch { return null; }
  }, [entry.url]);

  const maskedPassword = useMemo(() => {
    if (!entry.password) return '';
    return '•'.repeat(Math.min(entry.password.length, 12));
  }, [entry.password]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/50 rounded-xl hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800/50 transition-all duration-150 ${isDragging ? 'shadow-xl' : ''}`}
    >
      {/* 拖拽手柄 */}
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 flex-shrink-0 touch-none">
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 左侧色条 */}
      <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: tagColor }} />

      {/* 网址 + Favicon */}
      <div className="flex items-center gap-2 w-44 flex-shrink-0 min-w-0">
        {faviconUrl ? (
          <img src={faviconUrl} alt="" className="w-4 h-4 rounded flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-200 truncate" title={entry.url}>
          {displayDomain}
        </span>
        {entry.url && <CopyButton text={entry.url} label="网址" />}
      </div>

      {/* 账户 + 密码 同行 */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* 账户 */}
        <div className="flex items-center gap-1.5 min-w-0 w-1/2">
          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-300 truncate font-mono">{entry.account || '—'}</span>
          {entry.account && <CopyButton text={entry.account} label="账户" />}
        </div>
        {/* 密码 */}
        <div className="flex items-center gap-1.5 min-w-0 w-1/2">
          <KeyRound className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-600 dark:text-gray-300 truncate font-mono select-none">
            {showPassword ? entry.password : maskedPassword}
          </span>
          <button onClick={() => setShowPassword(!showPassword)}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          {entry.password && <CopyButton text={entry.password} label="密码" />}
        </div>
      </div>

      {/* 备注（宽屏展示） */}
      {entry.note && (
        <div className="hidden xl:flex items-center gap-1 w-32 flex-shrink-0 min-w-0">
          <StickyNote className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-400 truncate">{entry.note}</span>
          <CopyButton text={entry.note} label="备注" />
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg" title="编辑">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" title="删除">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ======== 主组件 ========
export const PasswordManager: React.FC = () => {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [decryptedEntries, setDecryptedEntries] = useState<DecryptedEntry[]>([]);
  const [tags, setTags] = useState<PasswordTag[]>([]);
  const [activeTag, setActiveTag] = useState<string>(DEFAULT_TAG);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DecryptedEntry | null>(null);
  const [editingTag, setEditingTag] = useState<PasswordTag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DecryptedEntry | null>(null);
  const [deleteTagTarget, setDeleteTagTarget] = useState<PasswordTag | null>(null);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ---- 标签管理 ----
  const loadTags = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TAGS);
      if (raw) setTags(JSON.parse(raw));
    } catch { setTags([]); }
  }, []);

  const saveTags = useCallback((newTags: PasswordTag[]) => {
    setTags(newTags);
    localStorage.setItem(STORAGE_KEY_TAGS, JSON.stringify(newTags));
  }, []);

  // saveEntries needs to be declared before handleSaveTag
  const saveEntries = useCallback((newEntries: PasswordEntry[]) => {
    setEntries(newEntries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newEntries));
  }, []);

  const handleSaveTag = useCallback((name: string, color: string) => {
    if (editingTag) {
      const oldName = editingTag.name;
      const updated = tags.map(t => t.id === editingTag.id ? { ...t, name, color } : t);
      saveTags(updated);
      if (oldName !== name) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const allEntries: PasswordEntry[] = JSON.parse(raw);
          const updatedEntries = allEntries.map(e => e.tag === oldName ? { ...e, tag: name } : e);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEntries));
          setEntries(updatedEntries);
        }
        setDecryptedEntries(prev => prev.map(e => e.tag === oldName ? { ...e, tag: name } : e));
        if (activeTag === oldName) setActiveTag(name);
      }
    } else {
      const newTag: PasswordTag = { id: generateId(), name, color, sortOrder: tags.length };
      saveTags([...tags, newTag]);
    }
    setIsTagModalOpen(false);
    setEditingTag(null);
  }, [editingTag, tags, saveTags, activeTag]);

  const handleDeleteTag = useCallback((tag: PasswordTag) => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const allEntries: PasswordEntry[] = JSON.parse(raw);
      const updatedEntries = allEntries.map(e => e.tag === tag.name ? { ...e, tag: DEFAULT_TAG } : e);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedEntries));
      setEntries(updatedEntries);
    }
    setDecryptedEntries(prev => prev.map(e => e.tag === tag.name ? { ...e, tag: DEFAULT_TAG } : e));
    saveTags(tags.filter(t => t.id !== tag.id));
    if (activeTag === tag.name) setActiveTag(DEFAULT_TAG);
    setDeleteTagTarget(null);
  }, [tags, activeTag, saveTags]);

  // ---- 密码数据管理 ----
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setEntries([]); setDecryptedEntries([]); setLoading(false); return; }
      const parsed: PasswordEntry[] = JSON.parse(raw);
      setEntries(parsed);

      const decrypted = await Promise.all(
        parsed.map(async (entry) => {
          try {
            const dec = await decryptPasswordRecord({ url: entry.url, account: entry.account, password: entry.password, note: entry.note });
            return { id: entry.id, url: dec.url, account: dec.account, password: dec.password, note: dec.note, tag: entry.tag || DEFAULT_TAG, sortOrder: entry.sortOrder ?? 0, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
          } catch {
            return { id: entry.id, url: entry.url, account: entry.account, password: entry.password, note: entry.note, tag: entry.tag || DEFAULT_TAG, sortOrder: entry.sortOrder ?? 0, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
          }
        })
      );
      setDecryptedEntries(decrypted);
    } catch (err) {
      console.error('Failed to load passwords:', err);
      setEntries([]); setDecryptedEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTags(); loadEntries(); }, [loadTags, loadEntries]);

  const handleSave = useCallback(async (data: { url: string; account: string; password: string; note: string; tag: string }) => {
    const encrypted = await encryptPasswordRecord({ url: data.url, account: data.account, password: data.password, note: data.note });
    const now = Date.now();

    let newEntries: PasswordEntry[];
    if (editingEntry) {
      newEntries = entries.map(e =>
        e.id === editingEntry.id ? { ...e, ...encrypted, tag: data.tag, updatedAt: now } : e
      );
    } else {
      const sameTagEntries = entries.filter(e => (e.tag || DEFAULT_TAG) === data.tag);
      const maxOrder = sameTagEntries.reduce((max, e) => Math.max(max, e.sortOrder ?? 0), 0);
      const newEntry: PasswordEntry = {
        id: generateId(), ...encrypted, tag: data.tag, sortOrder: maxOrder + 1, createdAt: now, updatedAt: now,
      };
      newEntries = [...entries, newEntry];
    }

    saveEntries(newEntries);
    setIsModalOpen(false);
    setEditingEntry(null);
    setTimeout(() => loadEntries(), 50);
  }, [editingEntry, entries, saveEntries, loadEntries]);

  const handleDelete = useCallback((id: string) => {
    const newEntries = entries.filter(e => e.id !== id);
    saveEntries(newEntries);
    setDecryptedEntries(prev => prev.filter(e => e.id !== id));
    setDeleteTarget(null);
  }, [entries, saveEntries]);

  // ---- 搜索 & 过滤 ----
  const filteredEntries = useMemo(() => {
    let result = decryptedEntries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.url.toLowerCase().includes(q) || e.account.toLowerCase().includes(q) ||
        e.password.toLowerCase().includes(q) || e.note.toLowerCase().includes(q)
      );
    }
    return result;
  }, [decryptedEntries, searchQuery]);

  const currentTagEntries = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredEntries.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return filteredEntries
      .filter(e => (e.tag || DEFAULT_TAG) === activeTag)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [filteredEntries, activeTag, searchQuery]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { [DEFAULT_TAG]: 0 };
    tags.forEach(t => { counts[t.name] = 0; });
    decryptedEntries.forEach(e => {
      const t = e.tag || DEFAULT_TAG;
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [decryptedEntries, tags]);

  const getTagColor = useCallback((tagName: string) => {
    if (tagName === DEFAULT_TAG) return '#64748b';
    return tags.find(t => t.name === tagName)?.color || '#64748b';
  }, [tags]);

  // ---- 拖拽排序 ----
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentIds = currentTagEntries.map(e => e.id);
    const oldIndex = currentIds.indexOf(active.id as string);
    const newIndex = currentIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentTagEntries, oldIndex, newIndex);
    const orderMap = new Map<string, number>();
    reordered.forEach((e, i) => orderMap.set(e.id, i));

    const newEntries = entries.map(e => {
      if (orderMap.has(e.id)) return { ...e, sortOrder: orderMap.get(e.id)! };
      return e;
    });

    saveEntries(newEntries);
    setDecryptedEntries(prev => prev.map(e => {
      if (orderMap.has(e.id)) return { ...e, sortOrder: orderMap.get(e.id)! };
      return e;
    }));
  }, [currentTagEntries, entries, saveEntries]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">密码管理</h2>
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {decryptedEntries.length} 条
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditingTag(null); setIsTagModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            新增标签
          </button>
          <button
            onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新增密码
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索网址、账户、密码、备注..."
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 标签栏 */}
      {!searchQuery.trim() && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
          {/* 默认标签 */}
          <button
            onClick={() => setActiveTag(DEFAULT_TAG)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-all flex-shrink-0 ${
              activeTag === DEFAULT_TAG
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>{DEFAULT_TAG}</span>
            <span className="text-xs opacity-60">{tagCounts[DEFAULT_TAG] || 0}</span>
          </button>
          {/* 自定义标签 */}
          {tags.map(tag => (
            <div key={tag.id} className="relative group/tag flex-shrink-0">
              <button
                onClick={() => setActiveTag(tag.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-all ${
                  activeTag === tag.name
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
                style={activeTag === tag.name ? { backgroundColor: tag.color } : undefined}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                <span>{tag.name}</span>
                <span className="text-xs opacity-60">{tagCounts[tag.name] || 0}</span>
              </button>
              {/* 标签操作 */}
              <div className="absolute top-full left-0 mt-1 hidden group-hover/tag:flex items-center gap-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-1">
                <button onClick={() => { setEditingTag(tag); setIsTagModalOpen(true); }}
                  className="p-1 text-gray-400 hover:text-blue-500 rounded" title="编辑标签">
                  <Edit2 className="w-3 h-3" />
                </button>
                <button onClick={() => setDeleteTagTarget(tag)}
                  className="p-1 text-gray-400 hover:text-red-500 rounded" title="删除标签">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 搜索模式提示 */}
      {searchQuery.trim() && (
        <div className="mb-3 text-xs text-gray-400">
          在所有标签中搜索到 {currentTagEntries.length} 条结果
        </div>
      )}

      {/* 密码列表 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-400">正在解密数据...</span>
          </div>
        ) : currentTagEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            {searchQuery ? (
              <><Search className="w-10 h-10 mb-2 text-gray-300" /><p className="text-sm">未找到匹配的记录</p></>
            ) : (
              <><Shield className="w-10 h-10 mb-2 text-gray-300" /><p className="text-sm">该标签下暂无密码</p><p className="text-xs mt-1">点击「新增密码」开始添加</p></>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={currentTagEntries.map(e => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {currentTagEntries.map(entry => (
                  <SortablePasswordRow
                    key={entry.id}
                    entry={entry}
                    tagColor={getTagColor(entry.tag || DEFAULT_TAG)}
                    onEdit={() => { setEditingEntry(entry); setIsModalOpen(true); }}
                    onDelete={() => setDeleteTarget(entry)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 弹窗 */}
      <PasswordModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingEntry(null); }}
        onSave={handleSave}
        initial={editingEntry}
        tags={tags}
      />

      <TagModal
        isOpen={isTagModalOpen}
        onClose={() => { setIsTagModalOpen(false); setEditingTag(null); }}
        onSave={handleSaveTag}
        initial={editingTag}
        existingNames={tags.map(t => t.name)}
      />

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        itemName={deleteTarget?.url || deleteTarget?.account || '此记录'}
      />

      <DeleteConfirmModal
        isOpen={!!deleteTagTarget}
        onClose={() => setDeleteTagTarget(null)}
        onConfirm={() => deleteTagTarget && handleDeleteTag(deleteTagTarget)}
        itemName={`标签「${deleteTagTarget?.name}」（密码将归入默认）`}
      />
    </div>
  );
};

export default PasswordManager;
