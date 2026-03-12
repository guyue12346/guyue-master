import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Save, Trash2, X, Download, Upload, Image as ImageIcon,
  FileText, Edit2, Copy, CheckCircle, AlertCircle, Loader2, Pencil,
  FolderOpen, ChevronDown, Settings, Sigma
} from 'lucide-react';
import '@excalidraw/excalidraw/index.css';

declare global {
  interface Window {
    MathJax?: any;
  }
}

// ======== 类型定义 ========
interface DrawingFile {
  id: string;
  name: string;
  data: any; // Excalidraw scene data (elements + appState + files)
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

// ======== 存储键 ========
const STORAGE_KEY_DRAWINGS = 'guyue_excalidraw_drawings';
const STORAGE_KEY_ACTIVE = 'guyue_excalidraw_active';
const STORAGE_KEY_IMAGE_CONFIG = 'linkmaster_image_config_v1';       // 与 App.tsx 保持一致
const STORAGE_KEY_IMAGE_RECORDS = 'linkmaster_image_records_v1';
const STORAGE_KEY_DEFAULTS = 'guyue_excalidraw_defaults';
const STORAGE_KEY_LIBRARY = 'guyue_excalidraw_library';
const STORAGE_KEY_LATEX_MAP = 'guyue_excalidraw_latex_map';

// 需要持久化的 appState 属性（工具偏好设置）
const PERSISTED_APP_STATE_KEYS = [
  'viewBackgroundColor',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemRoundness',
  'currentItemStartArrowhead',
  'currentItemEndArrowhead',
];

// 字体映射表 (Excalidraw v0.18)
const FONT_FAMILIES: Record<number, string> = {
  1: '手写体 (Virgil)',
  2: '普通 (Helvetica)',
  3: '代码 (Cascadia)',
  5: 'Excalifont',
  6: 'Nunito',
  7: 'Lilita One',
  8: 'Comic Shanns',
};

const loadDefaults = (): Record<string, any> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEFAULTS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveDefaults = (defaults: Record<string, any>) => {
  localStorage.setItem(STORAGE_KEY_DEFAULTS, JSON.stringify(defaults));
};

const pickAppState = (appState: any): Record<string, any> => {
  const picked: Record<string, any> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    if (appState[key] !== undefined) picked[key] = appState[key];
  }
  return picked;
};

// ======== 工具函数 ========
const generateId = () => `draw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

const loadDrawings = (): DrawingFile[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DRAWINGS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveDrawings = (drawings: DrawingFile[]) => {
  localStorage.setItem(STORAGE_KEY_DRAWINGS, JSON.stringify(drawings));
};

const loadLibrary = (): any[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIBRARY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const saveLibrary = (items: any[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save library:', e);
  }
};

// LaTeX 源码映射: fileId -> latex string
const loadLatexMap = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LATEX_MAP);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveLatexMap = (map: Record<string, string>) => {
  localStorage.setItem(STORAGE_KEY_LATEX_MAP, JSON.stringify(map));
};

// ======== MathJax 加载 ========
const ensureMathJax = async () => {
  if (window.MathJax?.tex2svgPromise || window.MathJax?.tex2svg) return window.MathJax;

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById('guyue-mathjax-script') as HTMLScriptElement | null;
    if (existingScript) {
      if (window.MathJax?.tex2svg) { resolve(); return; }
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('MathJax load error')), { once: true });
      return;
    }

    window.MathJax = {
      loader: { load: ['input/tex', 'output/svg'] },
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] },
      svg: { fontCache: 'none' },
      startup: { typeset: false },
    };

    const script = document.createElement('script');
    script.id = 'guyue-mathjax-script';
    script.async = true;
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('MathJax load error'));
    document.head.appendChild(script);
  });

  return window.MathJax;
};

// 将 LaTeX 渲染为 SVG dataURL 并测量尺寸
const renderLatexToSvg = async (latex: string, color: string = '#1e1e1e'): Promise<{ dataURL: string; width: number; height: number }> => {
  const mj = await ensureMathJax();
  const wrapper = mj.tex2svgPromise
    ? await mj.tex2svgPromise(latex, { display: true })
    : mj.tex2svg(latex, { display: true });
  const svgEl = wrapper?.querySelector?.('svg');
  if (!svgEl) throw new Error('LaTeX render failed');
  svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgEl.style.color = color;

  // MathJax SVG 用 ex 单位，1ex ≈ 8px（基准字号 16px 时）
  const EX_TO_PX = 8;
  const SCALE = 1.8; // 适当放大以在 Excalidraw 中清晰显示

  // 从 SVG 属性中读取 ex 单位的宽高
  const rawWidth = svgEl.getAttribute('width');   // e.g. "2.375ex"
  const rawHeight = svgEl.getAttribute('height'); // e.g. "1.532ex"

  let width: number;
  let height: number;

  if (rawWidth && rawHeight && rawWidth.includes('ex') && rawHeight.includes('ex')) {
    width = parseFloat(rawWidth) * EX_TO_PX * SCALE;
    height = parseFloat(rawHeight) * EX_TO_PX * SCALE;
  } else {
    // 回退：用 DOM 测量
    const measureContainer = document.createElement('div');
    measureContainer.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;font-size:16px';
    measureContainer.appendChild(svgEl.cloneNode(true));
    document.body.appendChild(measureContainer);
    const measuredSvg = measureContainer.querySelector('svg');
    const rect = measuredSvg?.getBoundingClientRect();
    document.body.removeChild(measureContainer);
    width = (rect?.width || 60) * SCALE;
    height = (rect?.height || 30) * SCALE;
  }

  // 设置固定 px 尺寸并确保 viewBox 正确
  const viewBox = svgEl.getAttribute('viewBox');
  if (viewBox) {
    svgEl.setAttribute('width', `${width}px`);
    svgEl.setAttribute('height', `${height}px`);
  }

  width = Math.max(width, 24);
  height = Math.max(height, 16);

  const svgString = new XMLSerializer().serializeToString(svgEl);
  const dataURL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
  return { dataURL, width, height };
};

// ======== LaTeX 编辑弹窗 ========
const LatexEditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (latex: string) => void;
  isProcessing: boolean;
  initialLatex: string;
}> = ({ isOpen, onClose, onConfirm, isProcessing, initialLatex }) => {
  const [latex, setLatex] = useState(initialLatex);
  useEffect(() => { if (isOpen) setLatex(initialLatex); }, [isOpen, initialLatex]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sigma className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">编辑 LaTeX 公式</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <textarea
            value={latex}
            onChange={e => setLatex(e.target.value)}
            rows={5}
            autoFocus
            placeholder="例如：\\int_0^{\\infty} e^{-x}dx"
            className="w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">输入 LaTeX 语法，不需要 $$ 包裹。双击公式图片可再次编辑。</p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
            <button
              onClick={() => { if (latex.trim()) onConfirm(latex.trim()); }}
              disabled={isProcessing || !latex.trim()}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sigma className="w-4 h-4" />}
              {isProcessing ? '渲染中...' : '确认'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ======== 删除确认弹窗 ========
const DeleteConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  name: string;
}> = ({ isOpen, onClose, onConfirm, name }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">确认删除</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            确定要删除画布「{name}」吗？此操作不可撤销。
          </p>
        </div>
        <div className="flex border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="flex-1 py-3 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-bl-2xl">取消</button>
          <button onClick={onConfirm} className="flex-1 py-3 text-sm text-red-500 font-medium hover:bg-red-50 dark:hover:bg-red-900/30 border-l border-gray-200 dark:border-gray-700 rounded-br-2xl">删除</button>
        </div>
      </div>
    </div>
  );
};

// ======== 重命名弹窗 ========
const RenameModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  currentName: string;
}> = ({ isOpen, onClose, onSave, currentName }) => {
  const [name, setName] = useState(currentName);
  useEffect(() => { if (isOpen) setName(currentName); }, [isOpen, currentName]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">重命名画布</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSave(name.trim()); }} className="p-4">
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ======== 导出到图床弹窗 ========
const ExportToHostingModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onExport: (name: string, format: 'png' | 'svg', category: string) => void;
  isUploading: boolean;
  defaultName: string;
  availableCategories: string[];
}> = ({ isOpen, onClose, onExport, isUploading, defaultName, availableCategories }) => {
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setFormat('png');
      setCustomCategory('');
      if (availableCategories.length > 0) {
        setCategory(availableCategories[0]);
        setIsCustom(false);
      } else {
        // 无已有分类，直接进入新建状态
        setCategory('');
        setIsCustom(true);
      }
    }
  }, [isOpen, defaultName, availableCategories]);

  if (!isOpen) return null;

  const finalCategory = isCustom ? customCategory.trim() : category;
  const canSubmit = !isUploading && name.trim() && finalCategory.length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">导出到图床</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">图片名称</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
              图片分类 <span className="text-red-400">*</span>
            </label>
            {availableCategories.length > 0 && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {availableCategories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { setCategory(cat); setIsCustom(false); }}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      !isCustom && category === cat
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setIsCustom(true); setCategory(''); }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                    isCustom
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  + 新建
                </button>
              </div>
            )}
            {(isCustom || availableCategories.length === 0) && (
              <input
                type="text"
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                placeholder={availableCategories.length === 0 ? '请先建立分类，输入新分类名称...' : '输入新分类名称...'}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-500 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30"
              />
            )}
            {!isCustom && !category && availableCategories.length > 0 && (
              <p className="text-xs text-red-400 mt-1">请选择一个分类</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">导出格式</label>
            <div className="flex gap-2">
              {(['png', 'svg'] as const).map(f => (
                <button key={f} type="button" onClick={() => setFormat(f)}
                  className={`flex-1 py-2 text-sm rounded-xl border transition-all ${format === f
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
            <button
              onClick={() => { if (canSubmit) onExport(name.trim(), format, finalCategory); }}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isUploading ? '上传中...' : '上传到图床'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ======== 主组件 ========
export const ExcalidrawEditor: React.FC = () => {
  // Excalidraw 动态导入
  const [ExcalidrawComp, setExcalidrawComp] = useState<React.ComponentType<any> | null>(null);
  const [exportUtils, setExportUtils] = useState<any>(null);
  const excalidrawAPIRef = useRef<any>(null);

  // 文件管理
  const [drawings, setDrawings] = useState<DrawingFile[]>(loadDrawings);
  const [activeId, setActiveId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE) || '';
  });

  // UI 状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrawingFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<DrawingFile | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isFileListOpen, setIsFileListOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // 图床可用分类（同时读 records + categoriesMap）
  const [imageCategories, setImageCategories] = useState<string[]>([]);

  const refreshImageCategories = useCallback(() => {
    try {
      // 来源一：已上传图片的 category
      const rawRecords = localStorage.getItem(STORAGE_KEY_IMAGE_RECORDS);
      const recordCats: string[] = rawRecords
        ? (JSON.parse(rawRecords) as Array<{ category?: string }>)
            .map(r => r.category)
            .filter((c): c is string => !!c && c !== '未分类' && c !== '全部')
        : [];
      // 来源二：分类管理器内建立的 image-hosting 分类
      const rawCats = localStorage.getItem('linkmaster_categories_v1');
      const managerCats: string[] = rawCats
        ? ((JSON.parse(rawCats)['image-hosting'] || []) as Array<{ name: string; isSystem?: boolean }>)
            .filter(c => !c.isSystem && c.name !== '全部' && c.name !== '未分类')
            .map(c => c.name)
        : [];
      const merged = Array.from(new Set([...recordCats, ...managerCats]));
      setImageCategories(merged);
    } catch {
      setImageCategories([]);
    }
  }, []);

  useEffect(() => { refreshImageCategories(); }, [refreshImageCategories]);

  // 每次弹窗打开时刷新分类
  useEffect(() => {
    if (isExportModalOpen) refreshImageCategories();
  }, [isExportModalOpen, refreshImageCategories]);

  // 素材库持久化
  const [libraryItems, setLibraryItems] = useState<any[]>(loadLibrary);
  const handleLibraryChange = useCallback((items: any[]) => {
    setLibraryItems(items);
    saveLibrary(items);
  }, []);

  // LaTeX 自动渲染
  const isProcessingLatexRef = useRef(false);
  const latexMapRef = useRef<Record<string, string>>(loadLatexMap());
  const latexDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedLatexIdsRef = useRef<Set<string>>(new Set());

  // LaTeX 编辑弹窗状态
  const [latexEditTarget, setLatexEditTarget] = useState<{ elementId: string; fileId: string; latex: string } | null>(null);
  const [isLatexProcessing, setIsLatexProcessing] = useState(false);

  // 画布容器 ref（用于 DOM 检测）
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // 检测暗色模式
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // 动态加载 Excalidraw
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('@excalidraw/excalidraw');
        if (mounted) {
          setExcalidrawComp(() => mod.Excalidraw);
          setExportUtils({
            exportToBlob: mod.exportToBlob,
            exportToSvg: mod.exportToSvg,
            convertToExcalidrawElements: mod.convertToExcalidrawElements,
          });
        }
      } catch (err) {
        console.error('Failed to load Excalidraw:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Toast 工具
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // LaTeX 自动渲染：文本编辑完成后检测 $$...$$ 并转为公式图片
  const handleChange = useCallback((elements: readonly any[], _appState: any) => {
    // 每次变化都重置防抖计时器
    if (latexDebounceRef.current) clearTimeout(latexDebounceRef.current);

    latexDebounceRef.current = setTimeout(async () => {
      const api = excalidrawAPIRef.current;
      const container = canvasContainerRef.current;
      if (!api || !exportUtils?.convertToExcalidrawElements || isProcessingLatexRef.current) return;

      // 检测 Excalidraw 的文本编辑器是否仍然激活（DOM 中有 textarea 说明还在编辑）
      if (container?.querySelector('textarea, [contenteditable="true"]')) return;

      // 扫描所有文本元素，寻找未处理的 $$...$$ 内容
      const currentElements = api.getSceneElements();
      for (const el of currentElements) {
        if (el.type !== 'text' || el.isDeleted) continue;
        if (processedLatexIdsRef.current.has(el.id)) continue;

        const text = (el.text || '').trim();
        const latexMatch = text.match(/^\$\$([\s\S]+)\$\$$/);
        if (!latexMatch) continue;

        const latex = latexMatch[1].trim();
        if (!latex) continue;

        // 标记为已处理，防止重复转换
        processedLatexIdsRef.current.add(el.id);
        isProcessingLatexRef.current = true;

        try {
          const color = el.strokeColor || '#1e1e1e';
          const { dataURL, width, height } = await renderLatexToSvg(latex, color);

          const fileId = `latex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          api.addFiles([{
            mimeType: 'image/svg+xml',
            id: fileId,
            dataURL,
            created: Date.now(),
          }]);

          // 保存 LaTeX 源码映射
          latexMapRef.current[fileId] = latex;
          saveLatexMap(latexMapRef.current);

          const newElements = exportUtils.convertToExcalidrawElements([{
            type: 'image',
            x: el.x,
            y: el.y,
            width,
            height,
            fileId,
          }]);

          // 替换文本元素为图片元素
          const freshElements = api.getSceneElements();
          const updatedElements = freshElements
            .filter((e: any) => e.id !== el.id)
            .concat(newElements);

          api.updateScene({ elements: updatedElements });
        } catch (err) {
          console.error('LaTeX auto-render error:', err);
          processedLatexIdsRef.current.delete(el.id);
        } finally {
          isProcessingLatexRef.current = false;
        }
        break; // 一次只处理一个
      }
    }, 800);
  }, [exportUtils]);

  // 监听画布容器上的双击事件（编辑 LaTeX 公式）
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleDblClick = () => {
      const api = excalidrawAPIRef.current;
      if (!api) return;

      const appState = api.getAppState();
      const selectedIds = appState.selectedElementIds || {};
      const selectedKeys = Object.keys(selectedIds).filter(k => selectedIds[k]);
      if (selectedKeys.length !== 1) return;

      const elements = api.getSceneElements();
      const selectedEl = elements.find((e: any) => e.id === selectedKeys[0] && !e.isDeleted);
      if (!selectedEl || selectedEl.type !== 'image') return;

      const fileId = selectedEl.fileId;
      if (!fileId || !latexMapRef.current[fileId]) return;

      // 是公式图片，打开编辑弹窗
      setLatexEditTarget({
        elementId: selectedEl.id,
        fileId,
        latex: latexMapRef.current[fileId],
      });
    };

    container.addEventListener('dblclick', handleDblClick);
    return () => container.removeEventListener('dblclick', handleDblClick);
  }, []);

  // 确认编辑 LaTeX 公式
  const handleLatexEditConfirm = useCallback(async (newLatex: string) => {
    if (!latexEditTarget || !excalidrawAPIRef.current) return;
    const api = excalidrawAPIRef.current;

    setIsLatexProcessing(true);
    try {
      const elements = api.getSceneElements();
      const targetEl = elements.find((e: any) => e.id === latexEditTarget.elementId && !e.isDeleted);
      const color = targetEl?.strokeColor || '#1e1e1e';

      const { dataURL, width, height } = await renderLatexToSvg(newLatex, color);

      // 用新的 fileId 来更新
      const newFileId = `latex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      api.addFiles([{
        mimeType: 'image/svg+xml',
        id: newFileId,
        dataURL,
        created: Date.now(),
      }]);

      // 更新 LaTeX 映射：删除旧的，添加新的
      delete latexMapRef.current[latexEditTarget.fileId];
      latexMapRef.current[newFileId] = newLatex;
      saveLatexMap(latexMapRef.current);

      // 替换元素：保持位置，更新 fileId 和尺寸
      const updatedElements = elements.map((el: any) => {
        if (el.id === latexEditTarget.elementId) {
          return { ...el, fileId: newFileId, width, height };
        }
        return el;
      });

      api.updateScene({ elements: updatedElements });
      setLatexEditTarget(null);
      showToast('公式已更新');
    } catch (err) {
      console.error('LaTeX edit error:', err);
      showToast('公式渲染失败', 'error');
    } finally {
      setIsLatexProcessing(false);
    }
  }, [latexEditTarget, showToast]);

  // 获取当前激活的画布
  const activeDrawing = useMemo(() => {
    return drawings.find(d => d.id === activeId) || null;
  }, [drawings, activeId]);

  // 新建画布
  const handleNewDrawing = useCallback(() => {
    const defaults = loadDefaults();
    const newDrawing: DrawingFile = {
      id: generateId(),
      name: `画布 ${drawings.length + 1}`,
      data: { elements: [], appState: { ...defaults }, files: {} },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newDrawing, ...drawings];
    setDrawings(updated);
    saveDrawings(updated);
    setActiveId(newDrawing.id);
    localStorage.setItem(STORAGE_KEY_ACTIVE, newDrawing.id);
    setIsFileListOpen(false);
  }, [drawings]);

  // 切换画布前先保存当前画布
  const saveCurrentScene = useCallback(() => {
    if (!excalidrawAPIRef.current || !activeId) return;
    const api = excalidrawAPIRef.current;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();
    const updated = drawings.map(d =>
      d.id === activeId ? { ...d, data: { elements, appState: pickAppState(appState), files }, updatedAt: Date.now() } : d
    );
    setDrawings(updated);
    saveDrawings(updated);
  }, [activeId, drawings]);

  // 切换画布
  const handleSwitchDrawing = useCallback((id: string) => {
    if (id === activeId) { setIsFileListOpen(false); return; }
    saveCurrentScene();
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY_ACTIVE, id);
    setIsFileListOpen(false);
  }, [activeId, saveCurrentScene]);

  // 手动保存
  const handleSave = useCallback(() => {
    saveCurrentScene();
    showToast('已保存');
  }, [saveCurrentScene, showToast]);

  // 自动保存（每30秒）
  useEffect(() => {
    const timer = setInterval(() => {
      if (excalidrawAPIRef.current && activeId) {
        saveCurrentScene();
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [saveCurrentScene, activeId]);

  // 删除画布
  const handleDelete = useCallback((drawing: DrawingFile) => {
    const updated = drawings.filter(d => d.id !== drawing.id);
    setDrawings(updated);
    saveDrawings(updated);
    if (activeId === drawing.id) {
      const nextId = updated.length > 0 ? updated[0].id : '';
      setActiveId(nextId);
      localStorage.setItem(STORAGE_KEY_ACTIVE, nextId);
    }
    setDeleteTarget(null);
    showToast('画布已删除');
  }, [drawings, activeId, showToast]);

  // 重命名
  const handleRename = useCallback((newName: string) => {
    if (!renameTarget) return;
    const updated = drawings.map(d => d.id === renameTarget.id ? { ...d, name: newName, updatedAt: Date.now() } : d);
    setDrawings(updated);
    saveDrawings(updated);
    setRenameTarget(null);
    showToast('已重命名');
  }, [drawings, renameTarget, showToast]);

  // 导出为本地文件（PNG）
  const handleExportPNG = useCallback(async () => {
    if (!excalidrawAPIRef.current || !exportUtils) { showToast('绘图引擎未就绪', 'error'); return; }
    const api = excalidrawAPIRef.current;
    const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);
    if (!elements || !elements.length) { showToast('画布为空', 'error'); return; }
    try {
      const blob = await exportUtils.exportToBlob({
        elements,
        appState: {
          exportWithDarkMode: isDark,
          exportBackground: true,
          viewBackgroundColor: api.getAppState().viewBackgroundColor,
        },
        files: api.getFiles(),
        maxWidthOrHeight: 8192,
        exportPadding: 16,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeDrawing?.name || 'drawing'}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出 PNG');
    } catch (err) {
      console.error('Export PNG error:', err);
      showToast('导出失败', 'error');
    }
  }, [exportUtils, isDark, activeDrawing, showToast]);

  // 导出为本地文件（SVG）
  const handleExportSVG = useCallback(async () => {
    if (!excalidrawAPIRef.current || !exportUtils) { showToast('绘图引擎未就绪', 'error'); return; }
    const api = excalidrawAPIRef.current;
    const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);
    if (!elements || !elements.length) { showToast('画布为空', 'error'); return; }
    try {
      const svg = await exportUtils.exportToSvg({
        elements,
        appState: { ...api.getAppState(), exportWithDarkMode: isDark },
        files: api.getFiles(),
      });
      const svgStr = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeDrawing?.name || 'drawing'}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出 SVG');
    } catch (err) {
      console.error('Export SVG error:', err);
      showToast('导出失败', 'error');
    }
  }, [exportUtils, isDark, activeDrawing, showToast]);

  // 导出到图床
  const handleExportToHosting = useCallback(async (name: string, format: 'png' | 'svg', category: string) => {
    if (!excalidrawAPIRef.current || !exportUtils) { showToast('绘图引擎未就绪', 'error'); return; }

    // 读取图床配置
    let hostingConfig: any = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_IMAGE_CONFIG);
      if (raw) hostingConfig = JSON.parse(raw);
    } catch {}

    if (!hostingConfig?.accessToken || !hostingConfig?.owner || !hostingConfig?.repo) {
      showToast('请先在图床管理中配置 Gitee 信息', 'error');
      setIsExportModalOpen(false);
      return;
    }

    const api = excalidrawAPIRef.current;
    const elements = api.getSceneElements().filter((el: any) => !el.isDeleted);
    if (!elements || !elements.length) { showToast('画布为空', 'error'); return; }

    setIsUploading(true);
    try {
      let base64Content: string;
      let ext: string;

      if (format === 'png') {
        const blob = await exportUtils.exportToBlob({
          elements,
          appState: {
            exportWithDarkMode: isDark,
            exportBackground: true,
            viewBackgroundColor: api.getAppState().viewBackgroundColor,
          },
          files: api.getFiles(),
          maxWidthOrHeight: 8192,
          exportPadding: 16,
        });
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        bytes.forEach(b => binary += String.fromCharCode(b));
        base64Content = btoa(binary);
        ext = 'png';
      } else {
        const svg = await exportUtils.exportToSvg({
          elements,
          appState: { ...api.getAppState(), exportWithDarkMode: isDark },
          files: api.getFiles(),
        });
        const svgStr = new XMLSerializer().serializeToString(svg);
        base64Content = btoa(unescape(encodeURIComponent(svgStr)));
        ext = 'svg';
      }

      const timestamp = Date.now();
      const filename = `${timestamp}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const uploadPath = hostingConfig.path ? `${hostingConfig.path}/${filename}` : filename;

      const data = await window.electronAPI.uploadImage({
        accessToken: hostingConfig.accessToken,
        owner: hostingConfig.owner,
        repo: hostingConfig.repo,
        path: uploadPath,
        content: base64Content,
        message: `Upload ${name}.${ext} via Guyue Master Excalidraw`,
      });

      // 添加到图床记录（通过事件通知 App.tsx，单一数据源）
      const newRecord = {
        id: timestamp.toString(),
        filename,
        name: name,
        url: data.content.download_url,
        sha: data.content.sha,
        path: data.content.path,
        category: category,
        createdAt: Date.now(),
      };

      // 通知 App.tsx 添加新记录（App.tsx 负责统一保存到 localStorage + 文件存储）
      window.dispatchEvent(new CustomEvent('guyue:image-record-added', { detail: newRecord }));

      // 更新本地分类列表
      if (category) {
        setImageCategories(prev => {
          const s = new Set(prev);
          s.add(category);
          return Array.from(s);
        });
      }

      // 复制 Markdown 链接到剪贴板
      const mdLink = `![${name}](${data.content.download_url})`;
      await navigator.clipboard.writeText(mdLink);

      setIsExportModalOpen(false);
      showToast(`已上传到「${category}」，Markdown 链接已复制`);
    } catch (err: any) {
      console.error('Upload to hosting error:', err);
      showToast(err.message || '上传失败', 'error');
    } finally {
      setIsUploading(false);
    }
  }, [exportUtils, isDark, showToast]);

  // 如果没有任何画布，自动创建一个
  useEffect(() => {
    if (drawings.length === 0) {
      handleNewDrawing();
    } else if (!activeId || !drawings.find(d => d.id === activeId)) {
      setActiveId(drawings[0].id);
      localStorage.setItem(STORAGE_KEY_ACTIVE, drawings[0].id);
    }
  }, []);

  // 设置面板
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // 保存当前工具配置为默认
  const handleSaveAsDefaults = useCallback(() => {
    if (!excalidrawAPIRef.current) { showToast('绘图引擎未就绪', 'error'); return; }
    const appState = excalidrawAPIRef.current.getAppState();
    const defaults = pickAppState(appState);
    saveDefaults(defaults);
    showToast('已保存为默认配置');
    setIsSettingsOpen(false);
  }, [showToast]);

  // 清除默认配置
  const handleClearDefaults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_DEFAULTS);
    showToast('已恢复默认配置');
    setIsSettingsOpen(false);
  }, [showToast]);

  // 关闭设置面板
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // 获取当前默认配置摘要
  const currentDefaults = useMemo(() => loadDefaults(), [isSettingsOpen]);

  // 导出菜单
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!ExcalidrawComp) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">加载绘图引擎中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Excalidraw</h2>
          </div>

          {/* 文件选择器 */}
          <div className="relative">
            <button
              onClick={() => setIsFileListOpen(!isFileListOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors min-w-0 max-w-48"
            >
              <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="truncate text-gray-700 dark:text-gray-200">{activeDrawing?.name || '未选择'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            </button>

            {isFileListOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {drawings.map(d => (
                    <div
                      key={d.id}
                      className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                        d.id === activeId
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => handleSwitchDrawing(d.id)}
                    >
                      <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${d.id === activeId ? 'text-blue-500' : 'text-gray-400'}`} />
                      <span className={`text-sm flex-1 truncate ${d.id === activeId ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{d.name}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); setRenameTarget(d); setIsFileListOpen(false); }}
                          className="p-1 text-gray-400 hover:text-blue-500 rounded" title="重命名">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {drawings.length > 1 && (
                          <button onClick={e => { e.stopPropagation(); setDeleteTarget(d); setIsFileListOpen(false); }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded" title="删除">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 p-1.5">
                  <button onClick={handleNewDrawing}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    新建画布
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* 保存按钮 */}
          <button onClick={handleSave}
            className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="保存 (自动保存每30秒)">
            <Save className="w-4 h-4" />
          </button>

          {/* 导出菜单 */}
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="导出">
              <Download className="w-4 h-4" />
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden">
                <button onClick={() => { handleExportPNG(); setIsExportMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <ImageIcon className="w-4 h-4 text-green-500" /> 导出 PNG
                </button>
                <button onClick={() => { handleExportSVG(); setIsExportMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <FileText className="w-4 h-4 text-purple-500" /> 导出 SVG
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700" />
                <button onClick={() => { setIsExportModalOpen(true); setIsExportMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <Upload className="w-4 h-4 text-blue-500" /> 导出到图床
                </button>
              </div>
            )}
          </div>

          {/* 设置按钮 */}
          <div className="relative" ref={settingsRef}>
            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="默认配置">
              <Settings className="w-4 h-4" />
            </button>
            {isSettingsOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">默认配置</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">先在画布中调好偏好设置，再点击下方按钮保存</p>
                </div>
                {Object.keys(currentDefaults).length > 0 && (
                  <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/50 space-y-1.5">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">当前默认值</p>
                    {currentDefaults.currentItemFontFamily && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">字体</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{FONT_FAMILIES[currentDefaults.currentItemFontFamily] || `Font ${currentDefaults.currentItemFontFamily}`}</span>
                      </div>
                    )}
                    {currentDefaults.currentItemFontSize && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">字号</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{currentDefaults.currentItemFontSize}px</span>
                      </div>
                    )}
                    {currentDefaults.currentItemStrokeColor && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">描边色</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm border border-gray-300 dark:border-gray-600" style={{ backgroundColor: currentDefaults.currentItemStrokeColor }} />
                          <span className="text-xs text-gray-700 dark:text-gray-300">{currentDefaults.currentItemStrokeColor}</span>
                        </div>
                      </div>
                    )}
                    {currentDefaults.currentItemStrokeWidth !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">线宽</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{currentDefaults.currentItemStrokeWidth}</span>
                      </div>
                    )}
                    {currentDefaults.currentItemRoughness !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">风格</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{currentDefaults.currentItemRoughness === 0 ? '精细' : currentDefaults.currentItemRoughness === 1 ? '手绘' : '粗糙'}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="p-2 space-y-1">
                  <button onClick={handleSaveAsDefaults}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                    <Save className="w-4 h-4 text-blue-500" />
                    将当前画笔配置保存为默认
                  </button>
                  {Object.keys(currentDefaults).length > 0 && (
                    <button onClick={handleClearDefaults}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-red-500" />
                      清除默认配置
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Excalidraw 编辑器 */}
      <div className="flex-1 relative" style={{ minHeight: 0 }} ref={canvasContainerRef}>
        {activeDrawing && (
          <ExcalidrawComp
            excalidrawAPI={(api: any) => { excalidrawAPIRef.current = api; }}
            key={activeId}
            initialData={{ ...activeDrawing.data, libraryItems }}
            theme={isDark ? 'dark' : 'light'}
            langCode="zh-CN"
            onChange={handleChange}
            onLibraryChange={handleLibraryChange}
            UIOptions={{
              canvasActions: {
                loadScene: false,
              },
            }}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm text-white ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* 弹窗 */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        name={deleteTarget?.name || ''}
      />
      <RenameModal
        isOpen={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={handleRename}
        currentName={renameTarget?.name || ''}
      />
      <ExportToHostingModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportToHosting}
        isUploading={isUploading}
        defaultName={activeDrawing?.name || 'drawing'}
        availableCategories={imageCategories}
      />
      <LatexEditModal
        isOpen={!!latexEditTarget}
        onClose={() => setLatexEditTarget(null)}
        onConfirm={handleLatexEditConfirm}
        isProcessing={isLatexProcessing}
        initialLatex={latexEditTarget?.latex || ''}
      />
    </div>
  );
};

export default ExcalidrawEditor;
