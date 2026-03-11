import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Search, Copy, Edit2, Trash2, Eye, EyeOff, Globe, User, KeyRound, StickyNote,
  CheckCircle, Shield, X, Save, AlertCircle, Tag, GripVertical,
  ExternalLink, LayoutGrid
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { AVAILABLE_ICONS } from '../../types';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { decryptPasswordRecord } from '../../utils/passwordCrypto';

// ======== 类型定义 ========
export interface PasswordEntry {
  id: string;
  url: string;
  account: string;
  password: string;
  note: string;
  shortName: string;
  tag: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface PasswordTag {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

// ======== 存储键 ========
const STORAGE_KEY = 'linkmaster_passwords_v1';
const STORAGE_KEY_TAGS = 'linkmaster_password_tags_v1';
const STORAGE_KEY_MIGRATED = 'linkmaster_passwords_plain_v2';
const ALL_TAG = '__all__';

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

// ======== 动态渲染 lucide 图标 ========
const DynamicIcon: React.FC<{ name: string; className?: string; style?: React.CSSProperties }> = ({ name, className, style }) => {
  const IconComp = (Icons as any)[name] as React.FC<any> | undefined;
  if (!IconComp) return <Tag className={className} style={style} />;
  return <IconComp className={className} style={style} />;
};

// ======== 新增/编辑标签弹窗 ========
const TagModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, color: string, icon: string) => void;
  initial?: PasswordTag | null;
  existingNames: string[];
}> = ({ isOpen, onClose, onSave, initial, existingNames }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [icon, setIcon] = useState('Tag');
  const [iconSearch, setIconSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name || '');
      setColor(initial?.color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
      setIcon(initial?.icon || 'Tag');
      setIconSearch('');
      setError('');
    }
  }, [isOpen, initial]);

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return AVAILABLE_ICONS;
    const q = iconSearch.toLowerCase();
    return AVAILABLE_ICONS.filter(i => i.toLowerCase().includes(q));
  }, [iconSearch]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('标签名不能为空'); return; }
    const otherNames = initial ? existingNames.filter(n => n !== initial.name) : existingNames;
    if (otherNames.includes(trimmed)) { setError('标签名已存在'); return; }
    onSave(trimmed, color, icon);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <DynamicIcon name={icon} className="w-5 h-5" style={{ color }} />
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
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">图标</label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text" value={iconSearch}
                onChange={e => setIconSearch(e.target.value)}
                placeholder="搜索图标..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-10 gap-1 max-h-36 overflow-y-auto p-1 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
              {filteredIcons.map(iconName => (
                <button
                  key={iconName} type="button"
                  onClick={() => setIcon(iconName)}
                  className={`p-1.5 rounded-lg flex items-center justify-center transition-all ${
                    icon === iconName
                      ? 'ring-2 ring-blue-500 bg-white dark:bg-gray-700 shadow-sm scale-110'
                      : 'hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm'
                  }`}
                  title={iconName}
                >
                  <DynamicIcon name={iconName} className="w-4 h-4" style={{ color: icon === iconName ? color : undefined }} />
                </button>
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
  onSave: (data: { url: string; shortName: string; account: string; password: string; note: string; tag: string }) => void;
  initial?: PasswordEntry | null;
  tags: PasswordTag[];
}> = ({ isOpen, onClose, onSave, initial, tags }) => {
  const [url, setUrl] = useState('');
  const [shortName, setShortName] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrl(initial?.url || '');
      setShortName(initial?.shortName || '');
      setAccount(initial?.account || '');
      setPassword(initial?.password || '');
      setNote(initial?.note || '');
      setTag(initial?.tag || (tags.length > 0 ? tags[0].name : ''));
      setShowPassword(false);
    }
  }, [isOpen, initial, tags]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() && !account.trim() && !password.trim()) return;
    onSave({ url: url.trim(), shortName: shortName.trim(), account: account.trim(), password: password.trim(), note: note.trim(), tag });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {initial ? '编辑网站' : '新增网站'}
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

          {/* 简称 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              <Tag className="w-4 h-4 text-gray-400" />简称
            </label>
            <input type="text" value={shortName} onChange={e => setShortName(e.target.value)} placeholder="可选，如：GitHub、Google（留空则显示网址）"
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
              {tags.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
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

// ======== 可拖拽标签组件 ========
const SortableTagItem: React.FC<{
  tag: PasswordTag;
  isActive: boolean;
  count: number;
  onSelect: () => void;
}> = ({ tag, isActive, count, onSelect }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/tag flex-shrink-0">
      <div className="flex items-center">
        <button {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 flex-shrink-0 touch-none opacity-0 group-hover/tag:opacity-100 transition-opacity">
          <GripVertical className="w-3 h-3" />
        </button>
        <button
          onClick={onSelect}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-all ${
            isActive
              ? 'text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
          }`}
          style={isActive ? { backgroundColor: tag.color } : undefined}
        >
          <DynamicIcon name={tag.icon || 'Tag'} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? 'white' : tag.color }} />
          <span>{tag.name}</span>
          <span className="text-xs opacity-60">{count}</span>
        </button>
      </div>
    </div>
  );
};

// ======== 标签管理弹窗中的可拖拽行 ========
const TagManagerRow: React.FC<{
  tag: PasswordTag;
  count: number;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ tag, count, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.85 : 1 };

  return (
    <div ref={setNodeRef} style={style}
      className={`group flex items-center gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all ${isDragging ? 'shadow-lg' : ''}`}>
      <button {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 flex-shrink-0 touch-none">
        <GripVertical className="w-4 h-4" />
      </button>
      <DynamicIcon name={tag.icon || 'Tag'} className="w-4 h-4 flex-shrink-0" style={{ color: tag.color }} />
      <span className="text-sm text-gray-700 dark:text-gray-200 flex-1 truncate">{tag.name}</span>
      <span className="text-xs text-gray-400 flex-shrink-0">{count} 条</span>
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

// ======== 标签管理弹窗 ========
const TagManagerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  tags: PasswordTag[];
  tagCounts: Record<string, number>;
  onAddTag: () => void;
  onEditTag: (tag: PasswordTag) => void;
  onDeleteTag: (tag: PasswordTag) => void;
  onReorderTags: (event: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
}> = ({ isOpen, onClose, tags, tagCounts, onAddTag, onEditTag, onDeleteTag, onReorderTags, sensors }) => {
  const sortedTags = useMemo(() => [...tags].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [tags]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">标签管理</h3>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{tags.length} 个</span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
          {sortedTags.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">暂无标签，点击下方按钮新增</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorderTags}>
              <SortableContext items={sortedTags.map(t => t.id)} strategy={verticalListSortingStrategy}>
                {sortedTags.map(tag => (
                  <TagManagerRow
                    key={tag.id}
                    tag={tag}
                    count={tagCounts[tag.name] || 0}
                    onEdit={() => onEditTag(tag)}
                    onDelete={() => onDeleteTag(tag)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onAddTag}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-dashed border-blue-300 dark:border-blue-700 rounded-xl transition-colors">
            <Plus className="w-4 h-4" />
            新增标签
          </button>
        </div>
      </div>
    </div>
  );
};

// ======== Favicon 持久化缓存 ========
const FAVICON_CACHE_KEY = 'linkmaster_favicon_cache_v1';

const getFaviconCache = (): Record<string, string | null> => {
  try { return JSON.parse(localStorage.getItem(FAVICON_CACHE_KEY) || '{}'); }
  catch { return {}; }
};

const saveFaviconToCache = (hostname: string, dataUrl: string | null) => {
  try {
    const cache = getFaviconCache();
    cache[hostname] = dataUrl;
    localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(cache));
  } catch {}
};

// ======== 可拖拽密码行组件 ========
const SortablePasswordRow: React.FC<{
  entry: PasswordEntry;
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

  const { hostname, displayDomain } = useMemo(() => {
    try {
      if (!entry.url) return { hostname: null, displayDomain: '—' };
      const urlObj = new URL(entry.url.startsWith('http') ? entry.url : `https://${entry.url}`);
      return { hostname: urlObj.hostname, displayDomain: urlObj.hostname };
    } catch { return { hostname: null, displayDomain: entry.url || '—' }; }
  }, [entry.url]);

  // 从缓存初始化，未缓存时先用 Google URL
  const [faviconSrc, setFaviconSrc] = useState<string | null>(() => {
    if (!hostname) return null;
    const cache = getFaviconCache();
    if (hostname in cache) return cache[hostname];
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  });

  useEffect(() => {
    if (!hostname) { setFaviconSrc(null); return; }
    const cache = getFaviconCache();
    if (hostname in cache) {
      setFaviconSrc(cache[hostname]);
    } else {
      setFaviconSrc(`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`);
    }
  }, [hostname]);

  // 首次加载成功后，将图标下载为 base64 并持久化
  const handleFaviconLoad = useCallback(async () => {
    if (!hostname) return;
    const cache = getFaviconCache();
    // 已缓存为 base64 则跳过
    if (hostname in cache && cache[hostname] !== null && !cache[hostname]!.startsWith('http')) return;
    try {
      const resp = await fetch(`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`);
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      saveFaviconToCache(hostname, dataUrl);
      setFaviconSrc(dataUrl);
    } catch { /* 网络失败不影响正常显示 */ }
  }, [hostname]);

  const handleFaviconError = useCallback(() => {
    if (hostname) saveFaviconToCache(hostname, null);
    setFaviconSrc(null);
  }, [hostname]);

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
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 flex-shrink-0 touch-none opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4" />
      </button>

      {/* 左侧色条 */}
      <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: tagColor }} />

      {/* 网址 + Favicon */}
      <div className="flex items-center gap-2 min-w-0 flex-shrink">
        {faviconSrc ? (
          <img src={faviconSrc} alt="" className="w-4 h-4 rounded flex-shrink-0"
            onLoad={handleFaviconLoad}
            onError={handleFaviconError} />
        ) : (
          <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <span className="text-sm text-gray-700 dark:text-gray-200 truncate font-medium" title={entry.url}>
          {entry.shortName || displayDomain}
        </span>
        {entry.url && <span className="opacity-0 group-hover:opacity-100 transition-opacity"><CopyButton text={entry.url} label="网址" /></span>}
        {entry.url && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const url = entry.url.startsWith('http') ? entry.url : `https://${entry.url}`;
              window.open(url, '_blank');
            }}
            className="p-1 rounded text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 transition-all flex-shrink-0 opacity-0 group-hover:opacity-100"
            title="在浏览器中打开"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 动态内容区：只显示有数据的字段 */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* 账户 */}
        {entry.account && (
          <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0" style={{ maxWidth: '30%' }}>
            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate font-mono">{entry.account}</span>
            <CopyButton text={entry.account} label="账户" />
          </div>
        )}
        {/* 密码 */}
        {entry.password && (
          <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0" style={{ maxWidth: '30%' }}>
            <KeyRound className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-600 dark:text-gray-300 truncate font-mono select-none">
              {showPassword ? entry.password : maskedPassword}
            </span>
            <button onClick={() => setShowPassword(!showPassword)}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <CopyButton text={entry.password} label="密码" />
          </div>
        )}
        {/* 备注：始终显示，过长省略 */}
        {entry.note && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <StickyNote className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-400 truncate" title={entry.note}>{entry.note}</span>
          </div>
        )}
      </div>

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
  const [tags, setTags] = useState<PasswordTag[]>([]);
  const [activeTag, setActiveTag] = useState<string>(ALL_TAG);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PasswordEntry | null>(null);
  const [editingTag, setEditingTag] = useState<PasswordTag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PasswordEntry | null>(null);
  const [deleteTagTarget, setDeleteTagTarget] = useState<PasswordTag | null>(null);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);

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

  const saveEntries = useCallback((newEntries: PasswordEntry[]) => {
    setEntries(newEntries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newEntries));
  }, []);

  const handleSaveTag = useCallback((name: string, color: string, icon: string) => {
    if (editingTag) {
      const oldName = editingTag.name;
      const updated = tags.map(t => t.id === editingTag.id ? { ...t, name, color, icon } : t);
      saveTags(updated);
      if (oldName !== name) {
        const updatedEntries = entries.map(e => e.tag === oldName ? { ...e, tag: name } : e);
        saveEntries(updatedEntries);
        if (activeTag === oldName) setActiveTag(name);
      }
    } else {
      const newTag: PasswordTag = { id: generateId(), name, color, icon, sortOrder: tags.length };
      saveTags([...tags, newTag]);
    }
    setIsTagModalOpen(false);
    setEditingTag(null);
  }, [editingTag, tags, entries, saveTags, saveEntries, activeTag]);

  const handleDeleteTag = useCallback((tag: PasswordTag) => {
    const remainingTags = tags.filter(t => t.id !== tag.id);
    const fallbackTag = remainingTags.length > 0 ? remainingTags[0].name : '';
    if (fallbackTag) {
      const updatedEntries = entries.map(e => e.tag === tag.name ? { ...e, tag: fallbackTag } : e);
      saveEntries(updatedEntries);
    }
    saveTags(remainingTags);
    if (activeTag === tag.name) setActiveTag(ALL_TAG);
    setDeleteTagTarget(null);
  }, [tags, entries, activeTag, saveTags, saveEntries]);

  // ---- 一次性数据迁移：解密旧加密数据 → 明文存储 ----
  const migrateEncryptedData = useCallback(async () => {
    if (localStorage.getItem(STORAGE_KEY_MIGRATED)) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { localStorage.setItem(STORAGE_KEY_MIGRATED, '1'); return; }
    try {
      const parsed: PasswordEntry[] = JSON.parse(raw);
      if (parsed.length === 0) { localStorage.setItem(STORAGE_KEY_MIGRATED, '1'); return; }
      const migrated = await Promise.all(
        parsed.map(async (entry) => {
          try {
            const dec = await decryptPasswordRecord({ url: entry.url, account: entry.account, password: entry.password, note: entry.note });
            return { ...entry, url: dec.url, account: dec.account, password: dec.password, note: dec.note };
          } catch {
            return entry; // 已经是明文或解密失败，保持原样
          }
        })
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    } catch { /* ignore */ }
    localStorage.setItem(STORAGE_KEY_MIGRATED, '1');
  }, []);

  // ---- 密码数据管理（同步，无需解密） ----
  const loadEntries = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { setEntries([]); return; }
      const parsed: PasswordEntry[] = JSON.parse(raw);
      setEntries(parsed);
    } catch (err) {
      console.error('Failed to load passwords:', err);
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    migrateEncryptedData().then(() => {
      loadTags();
      loadEntries();
    });
  }, [migrateEncryptedData, loadTags, loadEntries]);

  const handleSave = useCallback((data: { url: string; shortName: string; account: string; password: string; note: string; tag: string }) => {
    const now = Date.now();
    let newEntries: PasswordEntry[];
    if (editingEntry) {
      newEntries = entries.map(e =>
        e.id === editingEntry.id
          ? { ...e, url: data.url, account: data.account, password: data.password, note: data.note, shortName: data.shortName, tag: data.tag, updatedAt: now }
          : e
      );
    } else {
      const sameTagEntries = entries.filter(e => e.tag === data.tag);
      const maxOrder = sameTagEntries.reduce((max, e) => Math.max(max, e.sortOrder ?? 0), 0);
      const newEntry: PasswordEntry = {
        id: generateId(), url: data.url, account: data.account, password: data.password, note: data.note,
        shortName: data.shortName, tag: data.tag, sortOrder: maxOrder + 1, createdAt: now, updatedAt: now,
      };
      newEntries = [...entries, newEntry];
    }
    saveEntries(newEntries);
    setIsModalOpen(false);
    setEditingEntry(null);
  }, [editingEntry, entries, saveEntries]);

  const handleDelete = useCallback((id: string) => {
    saveEntries(entries.filter(e => e.id !== id));
    setDeleteTarget(null);
  }, [entries, saveEntries]);

  // ---- 搜索 & 过滤 ----
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.url.toLowerCase().includes(q) || (e.shortName || '').toLowerCase().includes(q) ||
        e.account.toLowerCase().includes(q) || e.password.toLowerCase().includes(q) ||
        e.note.toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, searchQuery]);

  const currentTagEntries = useMemo(() => {
    if (searchQuery.trim() || activeTag === ALL_TAG) {
      return [...filteredEntries].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return filteredEntries
      .filter(e => e.tag === activeTag)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [filteredEntries, activeTag, searchQuery]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tags.forEach(t => { counts[t.name] = 0; });
    entries.forEach(e => {
      const t = e.tag || '';
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [entries, tags]);

  const getTagColor = useCallback((tagName: string) => {
    return tags.find(t => t.name === tagName)?.color || '#64748b';
  }, [tags]);

  // ---- 条目拖拽排序 ----
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
    saveEntries(entries.map(e => orderMap.has(e.id) ? { ...e, sortOrder: orderMap.get(e.id)! } : e));
  }, [currentTagEntries, entries, saveEntries]);

  // ---- 标签拖拽排序 ----
  const handleTagDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...tags].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const oldIndex = sorted.findIndex(t => t.id === active.id);
    const newIndex = sorted.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    saveTags(reordered.map((t, i) => ({ ...t, sortOrder: i })));
  }, [tags, saveTags]);

  const sortedTags = useMemo(() => {
    return [...tags].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [tags]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">网站管理</h2>
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
            {entries.length} 条
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTagManagerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl transition-colors"
          >
            <Tag className="w-4 h-4" />
            标签管理
          </button>
          <button
            onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新增网站
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
        <div className="flex items-center gap-1 mb-4 overflow-x-auto no-scrollbar pb-1">
          {/* 全部 */}
          <button
            onClick={() => setActiveTag(ALL_TAG)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-all flex-shrink-0 ${
              activeTag === ALL_TAG
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>全部</span>
            <span className="text-xs opacity-60">{entries.length}</span>
          </button>
          {/* 用户标签（可拖拽排序） */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTagDragEnd}>
            <SortableContext items={sortedTags.map(t => t.id)} strategy={horizontalListSortingStrategy}>
              {sortedTags.map(tag => (
                <SortableTagItem
                  key={tag.id}
                  tag={tag}
                  isActive={activeTag === tag.name}
                  count={tagCounts[tag.name] || 0}
                  onSelect={() => setActiveTag(tag.name)}
                />
              ))}
            </SortableContext>
          </DndContext>
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
        {currentTagEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            {searchQuery ? (
              <><Search className="w-10 h-10 mb-2 text-gray-300" /><p className="text-sm">未找到匹配的记录</p></>
            ) : (
              <><Shield className="w-10 h-10 mb-2 text-gray-300" /><p className="text-sm">该标签下暂无网站</p><p className="text-xs mt-1">点击「新增网站」开始添加</p></>
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
                    tagColor={getTagColor(entry.tag)}
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
        itemName={deleteTarget?.shortName || deleteTarget?.url || deleteTarget?.account || '此记录'}
      />

      <DeleteConfirmModal
        isOpen={!!deleteTagTarget}
        onClose={() => setDeleteTagTarget(null)}
        onConfirm={() => deleteTagTarget && handleDeleteTag(deleteTagTarget)}
        itemName={`标签「${deleteTagTarget?.name}」（条目将归入第一个标签）`}
      />

      <TagManagerModal
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        tags={tags}
        tagCounts={tagCounts}
        onAddTag={() => { setEditingTag(null); setIsTagModalOpen(true); }}
        onEditTag={(tag) => { setEditingTag(tag); setIsTagModalOpen(true); }}
        onDeleteTag={(tag) => setDeleteTagTarget(tag)}
        onReorderTags={handleTagDragEnd}
        sensors={sensors}
      />
    </div>
  );
};

export default PasswordManager;
