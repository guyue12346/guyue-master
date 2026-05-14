import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Save, Trash2, X, Download, Upload, Image as ImageIcon,
  FileText, Edit2, Copy, CheckCircle, AlertCircle, Loader2, Pencil,
  Settings, Sigma, Search, Layers, Clock3, PanelLeft, Tag, FolderPlus,
  Maximize2, Minimize2, GripVertical, Check
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { AVAILABLE_ICONS } from '../../types';
import { hasUnifiedFileStorage, loadLocalJson, loadUnifiedJson, saveUnifiedJson } from '../../utils/unifiedStorage';
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
  category?: string;
  createdAt: number;
  updatedAt: number;
}

interface CanvasCategoryMeta {
  name: string;
  icon: string;
  color: string;
}

// ======== 存储键 ========
const STORAGE_KEY_DRAWINGS = 'guyue_excalidraw_drawings';
const STORAGE_KEY_ACTIVE = 'guyue_excalidraw_active';
const STORAGE_KEY_IMAGE_CONFIG = 'linkmaster_image_config_v1';       // 与 App.tsx 保持一致
const STORAGE_KEY_IMAGE_RECORDS = 'linkmaster_image_records_v1';
const STORAGE_KEY_DEFAULTS = 'guyue_excalidraw_defaults';
const STORAGE_KEY_LIBRARY = 'guyue_excalidraw_library';
const STORAGE_KEY_LATEX_MAP = 'guyue_excalidraw_latex_map';
const STORAGE_KEY_CANVAS_CATEGORIES = 'guyue_excalidraw_categories';
const STORE_KEY_DRAWINGS = 'excalidraw-drawings';
const STORE_KEY_ACTIVE = 'excalidraw-active';
const STORE_KEY_DEFAULTS = 'excalidraw-defaults';
const STORE_KEY_LIBRARY = 'excalidraw-library';
const STORE_KEY_LATEX_MAP = 'excalidraw-latex-map';
const STORE_KEY_CANVAS_CATEGORIES = 'excalidraw-categories';
const ALL_CANVAS_CATEGORY = '__all__';
const UNCATEGORIZED_CANVAS_CATEGORY = '未分类';
const DEFAULT_CANVAS_CATEGORY_ICON = 'Layers';
const CANVAS_CATEGORY_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#64748b',
];

const isReservedCanvasCategory = (name: string) =>
  !name || name === UNCATEGORIZED_CANVAS_CATEGORY || name === '全部' || name === ALL_CANVAS_CATEGORY;

const hashCanvasCategoryName = (name: string) =>
  Array.from(name).reduce((hash, char) => hash + char.charCodeAt(0), 0);

const createCanvasCategoryMeta = (name: string): CanvasCategoryMeta => {
  const trimmed = name.trim();
  const color = CANVAS_CATEGORY_COLORS[hashCanvasCategoryName(trimmed) % CANVAS_CATEGORY_COLORS.length];
  return {
    name: trimmed,
    icon: DEFAULT_CANVAS_CATEGORY_ICON,
    color,
  };
};

const normalizeCanvasCategoryMeta = (entry: unknown): CanvasCategoryMeta | null => {
  const rawName =
    typeof entry === 'string'
      ? entry
      : entry && typeof entry === 'object'
        ? String((entry as Partial<CanvasCategoryMeta>).name || '')
        : '';
  const name = rawName.trim();
  if (isReservedCanvasCategory(name)) return null;

  const fallback = createCanvasCategoryMeta(name);
  if (!entry || typeof entry !== 'object' || typeof entry === 'string') return fallback;

  const rawIcon = String((entry as Partial<CanvasCategoryMeta>).icon || '').trim();
  const rawColor = String((entry as Partial<CanvasCategoryMeta>).color || '').trim();

  return {
    name,
    icon: rawIcon || fallback.icon,
    color: rawColor || fallback.color,
  };
};

const normalizeCanvasCategoryMetas = (categories: unknown[]): CanvasCategoryMeta[] => {
  const seen = new Set<string>();
  const normalized: CanvasCategoryMeta[] = [];

  for (const category of categories) {
    const meta = normalizeCanvasCategoryMeta(category);
    if (!meta || seen.has(meta.name)) continue;
    seen.add(meta.name);
    normalized.push(meta);
  }

  return normalized;
};

const normalizeRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value : '');

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
  return loadLocalJson({
    localStorageKey: STORAGE_KEY_DEFAULTS,
    defaultValue: () => ({}),
    normalize: normalizeRecord,
  });
};

const loadDefaultsFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_DEFAULTS,
    localStorageKey: STORAGE_KEY_DEFAULTS,
    defaultValue: () => ({}),
    normalize: normalizeRecord,
  });
};

const saveDefaults = (defaults: Record<string, any>) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_DEFAULTS,
      localStorageKey: STORAGE_KEY_DEFAULTS,
      defaultValue: () => ({}),
      normalize: normalizeRecord,
    },
    defaults,
  );
};

const pickAppState = (appState: any): Record<string, any> => {
  const picked: Record<string, any> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    if (appState[key] !== undefined) picked[key] = appState[key];
  }
  return picked;
};

const getElementsBounds = (elements: readonly any[]) => {
  if (!elements.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return { minX, minY, maxX, maxY };
};

const offsetElements = (elements: readonly any[], dx: number, dy: number) =>
  elements.map(element => ({
    ...element,
    x: (Number(element.x) || 0) + dx,
    y: (Number(element.y) || 0) + dy,
  }));

const applyCurrentStyleToElements = (elements: readonly any[], appState: any) =>
  elements.map(element => {
    const styled = { ...element };
    const isText = styled.type === 'text';
    const isLinear = styled.type === 'arrow' || styled.type === 'line';
    const isShape = !isText && !isLinear && styled.type !== 'image';

    if (appState.currentItemStrokeColor) {
      styled.strokeColor = appState.currentItemStrokeColor;
    }
    if (appState.currentItemStrokeWidth !== undefined) {
      styled.strokeWidth = appState.currentItemStrokeWidth;
    }
    if (appState.currentItemStrokeStyle !== undefined) {
      styled.strokeStyle = appState.currentItemStrokeStyle;
    }
    if (appState.currentItemRoughness !== undefined) {
      styled.roughness = appState.currentItemRoughness;
    }
    if (appState.currentItemOpacity !== undefined) {
      styled.opacity = appState.currentItemOpacity;
    }

    if (isShape) {
      if (appState.currentItemBackgroundColor !== undefined) {
        styled.backgroundColor = appState.currentItemBackgroundColor;
      }
      if (appState.currentItemFillStyle !== undefined) {
        styled.fillStyle = appState.currentItemFillStyle;
      }
      if (appState.currentItemRoundness !== undefined) {
        styled.roundness = appState.currentItemRoundness;
      }
    }

    if (isText) {
      if (appState.currentItemFontFamily !== undefined) {
        styled.fontFamily = appState.currentItemFontFamily;
      }
      if (appState.currentItemFontSize !== undefined) {
        styled.fontSize = appState.currentItemFontSize;
      }
    }

    if (isLinear) {
      if (appState.currentItemStartArrowhead !== undefined) {
        styled.startArrowhead = appState.currentItemStartArrowhead;
      }
      if (appState.currentItemEndArrowhead !== undefined) {
        styled.endArrowhead = appState.currentItemEndArrowhead;
      }
      if (appState.currentItemRoundness !== undefined) {
        styled.roundness = appState.currentItemRoundness;
      }
    }

    return styled;
  });

const closeBuiltinMermaidDialog = (api: any) => {
  try {
    api?.updateScene?.({
      appState: {
        openDialog: null,
      },
    });
  } catch (error) {
    console.warn('Failed to close Excalidraw Mermaid dialog via API:', error);
  }

  requestAnimationFrame(() => {
    const closeButton = document.querySelector(
      '.ttd-dialog button[aria-label="Close"], .ttd-dialog .Modal__close, .ttd-dialog button[title="Close"]',
    ) as HTMLButtonElement | null;
    closeButton?.click();
  });
};

// ======== 工具函数 ========
const generateId = () => `draw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

const sanitizeDrawing = (drawing: DrawingFile): DrawingFile => {
  const { thumbnail: _thumbnail, ...rest } = drawing as DrawingFile & { thumbnail?: string };
  return rest;
};

const normalizeDrawings = (value: unknown): DrawingFile[] => {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeDrawing);
};

const loadDrawings = (): DrawingFile[] => {
  return loadLocalJson({
    localStorageKey: STORAGE_KEY_DRAWINGS,
    defaultValue: () => [],
    normalize: normalizeDrawings,
  });
};

const loadDrawingsFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_DRAWINGS,
    localStorageKey: STORAGE_KEY_DRAWINGS,
    defaultValue: () => [],
    normalize: normalizeDrawings,
  });
};

const saveDrawings = (drawings: DrawingFile[]) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_DRAWINGS,
      localStorageKey: STORAGE_KEY_DRAWINGS,
      defaultValue: () => [],
      normalize: normalizeDrawings,
    },
    drawings.map(sanitizeDrawing),
  );
};

const loadActiveId = () => {
  return loadLocalJson({
    localStorageKey: STORAGE_KEY_ACTIVE,
    defaultValue: () => '',
    normalize: normalizeString,
  });
};

const loadActiveIdFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_ACTIVE,
    localStorageKey: STORAGE_KEY_ACTIVE,
    defaultValue: () => '',
    normalize: normalizeString,
    localStorageMode: 'raw-string',
  });
};

const saveActiveId = (id: string) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_ACTIVE,
      localStorageKey: STORAGE_KEY_ACTIVE,
      defaultValue: () => '',
      normalize: normalizeString,
      localStorageMode: 'raw-string',
    },
    id,
  );
};

const normalizeCanvasCategory = (category?: string) => {
  const trimmed = category?.trim();
  return trimmed && trimmed !== UNCATEGORIZED_CANVAS_CATEGORY ? trimmed : '';
};

const toStoredCanvasCategory = (category: string) => {
  const normalized = normalizeCanvasCategory(category);
  return normalized || undefined;
};

const loadCanvasCategories = (): CanvasCategoryMeta[] => {
  return loadLocalJson({
    localStorageKey: STORAGE_KEY_CANVAS_CATEGORIES,
    defaultValue: () => [],
    normalize: value => (Array.isArray(value) ? normalizeCanvasCategoryMetas(value) : []),
  });
};

const loadCanvasCategoriesFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_CANVAS_CATEGORIES,
    localStorageKey: STORAGE_KEY_CANVAS_CATEGORIES,
    defaultValue: () => [],
    normalize: value => (Array.isArray(value) ? normalizeCanvasCategoryMetas(value) : []),
  });
};

const saveCanvasCategories = (categories: Array<CanvasCategoryMeta | string>) => {
  const normalized = normalizeCanvasCategoryMetas(categories);
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_CANVAS_CATEGORIES,
      localStorageKey: STORAGE_KEY_CANVAS_CATEGORIES,
      defaultValue: () => [],
      normalize: value => (Array.isArray(value) ? normalizeCanvasCategoryMetas(value) : []),
    },
    normalized,
  );
};

const formatDrawingTime = (timestamp: number) => {
  if (!timestamp) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
};

const cloneSceneData = (data: any) => {
  try {
    return JSON.parse(JSON.stringify(data || { elements: [], appState: {}, files: {} }));
  } catch {
    return { elements: [], appState: {}, files: {} };
  }
};

const getPreviewElements = (drawing: DrawingFile) => {
  const elements = drawing.data?.elements;
  if (!Array.isArray(elements)) return [];
  return elements.filter((element: any) => !element?.isDeleted);
};

const getPreviewBounds = (elements: any[]) => {
  if (!elements.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Math.max(Number(element.width) || 1, 1);
    const height = Math.max(Number(element.height) || 1, 1);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  const padding = Math.max((maxX - minX) * 0.08, (maxY - minY) * 0.08, 24);
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 120),
    height: Math.max(maxY - minY + padding * 2, 80),
  };
};

const CanvasThumbnail: React.FC<{ drawing: DrawingFile }> = ({ drawing }) => {
  const elements = getPreviewElements(drawing).slice(0, 80);
  const bounds = getPreviewBounds(elements);

  if (!bounds) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(45deg,#f8fafc_25%,transparent_25%),linear-gradient(-45deg,#f8fafc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f8fafc_75%),linear-gradient(-45deg,transparent_75%,#f8fafc_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0] dark:bg-gray-900">
        <span className="text-[11px] text-gray-300 dark:text-gray-600">空白</span>
      </div>
    );
  }

  const renderElement = (element: any) => {
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Math.max(Number(element.width) || 1, 1);
    const height = Math.max(Number(element.height) || 1, 1);
    const stroke = element.strokeColor || '#334155';
    const fill = element.backgroundColor && element.backgroundColor !== 'transparent'
      ? element.backgroundColor
      : 'none';
    const strokeWidth = Math.max(Number(element.strokeWidth) || 1, 1) * 1.5;
    const opacity = Math.max(Math.min(Number(element.opacity ?? 100), 100), 8) / 100;

    if (element.type === 'ellipse') {
      return <ellipse key={element.id} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
    }
    if (element.type === 'diamond') {
      const points = `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`;
      return <polygon key={element.id} points={points} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
    }
    if (element.type === 'line' || element.type === 'arrow' || element.type === 'freedraw') {
      const points = Array.isArray(element.points) && element.points.length
        ? element.points.map((point: [number, number]) => `${x + point[0]},${y + point[1]}`).join(' ')
        : `${x},${y} ${x + width},${y + height}`;
      return <polyline key={element.id} points={points} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />;
    }
    if (element.type === 'text') {
      const text = String(element.text || '').slice(0, 16);
      return (
        <text key={element.id} x={x} y={y + Math.min(height, 24)} fill={stroke} fontSize={Math.max(Math.min(Number(element.fontSize) || 18, 28), 10)} opacity={opacity}>
          {text}
        </text>
      );
    }
    if (element.type === 'image') {
      return <rect key={element.id} x={x} y={y} width={width} height={height} rx={8} fill="#e0f2fe" stroke="#38bdf8" strokeWidth={strokeWidth} opacity={opacity} />;
    }
    return <rect key={element.id} x={x} y={y} width={width} height={height} rx={Math.min(12, width / 4, height / 4)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />;
  };

  return (
    <svg
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      className="h-full w-full bg-white dark:bg-gray-950"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="currentColor" className="text-white dark:text-gray-950" />
      {elements.map(renderElement)}
    </svg>
  );
};

const CanvasCategoryIcon: React.FC<{
  icon?: string;
  color?: string;
  className?: string;
}> = ({ icon, color, className = 'h-3.5 w-3.5' }) => {
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<any>>)[icon || DEFAULT_CANVAS_CATEGORY_ICON] || Layers;
  return <Icon className={className} style={color ? { color } : undefined} />;
};

const loadLibrary = (): any[] => {
  return loadLocalJson({
    localStorageKey: STORAGE_KEY_LIBRARY,
    defaultValue: () => [],
    normalize: value => (Array.isArray(value) ? value : []),
  });
};

const loadLibraryFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_LIBRARY,
    localStorageKey: STORAGE_KEY_LIBRARY,
    defaultValue: () => [],
    normalize: value => (Array.isArray(value) ? value : []),
  });
};

const saveLibrary = (items: any[]) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_LIBRARY,
      localStorageKey: STORAGE_KEY_LIBRARY,
      defaultValue: () => [],
      normalize: value => (Array.isArray(value) ? value : []),
    },
    items,
  );
};

// LaTeX 源码映射: fileId -> latex string
const loadLatexMap = (): Record<string, string> => {
  return loadLocalJson({
    localStorageKey: STORAGE_KEY_LATEX_MAP,
    defaultValue: () => ({}),
    normalize: normalizeRecord,
  });
};

const loadLatexMapFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_LATEX_MAP,
    localStorageKey: STORAGE_KEY_LATEX_MAP,
    defaultValue: () => ({}),
    normalize: normalizeRecord,
  });
};

const saveLatexMap = (map: Record<string, string>) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_LATEX_MAP,
      localStorageKey: STORAGE_KEY_LATEX_MAP,
      defaultValue: () => ({}),
      normalize: normalizeRecord,
    },
    map,
  );
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

const CategoryPickerFields: React.FC<{
  categories: CanvasCategoryMeta[];
  selectedCategory: string;
  customCategory: string;
  onSelectedCategoryChange: (category: string) => void;
  onCustomCategoryChange: (category: string) => void;
  allowCustom?: boolean;
}> = ({ categories, selectedCategory, customCategory, onSelectedCategoryChange, onCustomCategoryChange, allowCustom = true }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">分类</label>
    {categories.length > 0 && (
      <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {categories.map(category => {
          const selected = selectedCategory === category.name && (!allowCustom || !customCategory);
          return (
            <button
              key={category.name}
              type="button"
              onClick={() => {
                onSelectedCategoryChange(category.name);
                onCustomCategoryChange('');
              }}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
              }`}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${category.color}18` }}
              >
                <CanvasCategoryIcon icon={category.icon} color={category.color} className="h-3.5 w-3.5" />
              </span>
              <span className="truncate">{category.name}</span>
            </button>
          );
        })}
      </div>
    )}
    {allowCustom && (
      <input
        value={customCategory}
        onChange={event => {
          onCustomCategoryChange(event.target.value);
          onSelectedCategoryChange('');
        }}
        placeholder={categories.length > 0 ? '或输入新分类' : '输入新分类'}
        className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white"
      />
    )}
  </div>
);

// ======== 新建画布弹窗 ========
const NewCanvasModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, category: string) => void;
  categories: CanvasCategoryMeta[];
  defaultCategory: string;
  defaultName: string;
}> = ({ isOpen, onClose, onCreate, categories, defaultCategory, defaultName }) => {
  const [name, setName] = useState(defaultName);
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setSelectedCategory(defaultCategory);
    }
  }, [defaultCategory, defaultName, isOpen]);

  if (!isOpen) return null;

  const finalCategory = selectedCategory.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">新建画布</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (name.trim() && finalCategory) onCreate(name.trim(), finalCategory);
          }}
          className="space-y-4 p-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white"
            />
          </div>
          <CategoryPickerFields
            categories={categories}
            selectedCategory={selectedCategory}
            customCategory=""
            onSelectedCategoryChange={setSelectedCategory}
            onCustomCategoryChange={() => undefined}
            allowCustom={false}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
            <button
              type="submit"
              disabled={!name.trim() || !finalCategory}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl disabled:opacity-50"
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ======== 编辑画布弹窗 ========
const CanvasEditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, category: string) => void;
  currentName: string;
  currentCategory: string;
  categories: CanvasCategoryMeta[];
}> = ({ isOpen, onClose, onSave, currentName, currentCategory, categories }) => {
  const [name, setName] = useState(currentName);
  const [selectedCategory, setSelectedCategory] = useState(currentCategory);
  const [customCategory, setCustomCategory] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setSelectedCategory(currentCategory);
      setCustomCategory('');
    }
  }, [currentCategory, currentName, isOpen]);

  if (!isOpen) return null;

  const finalCategory = customCategory.trim() || selectedCategory.trim();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">编辑画布</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (name.trim() && finalCategory) onSave(name.trim(), finalCategory);
          }}
          className="space-y-4 p-4"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white"
            />
          </div>
          <CategoryPickerFields
            categories={categories}
            selectedCategory={selectedCategory}
            customCategory={customCategory}
            onSelectedCategoryChange={setSelectedCategory}
            onCustomCategoryChange={setCustomCategory}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">取消</button>
            <button
              type="submit"
              disabled={!name.trim() || !finalCategory}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ======== 画布分类管理弹窗 ========
const CanvasCategoryManagerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  categories: CanvasCategoryMeta[];
  counts: Record<string, number>;
  onAdd: (category: CanvasCategoryMeta) => void;
  onSave: (oldName: string, category: CanvasCategoryMeta) => void;
  onDelete: (name: string) => void;
}> = ({ isOpen, onClose, categories, counts, onAdd, onSave, onDelete }) => {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftIcon, setDraftIcon] = useState(DEFAULT_CANVAS_CATEGORY_ICON);
  const [draftColor, setDraftColor] = useState(CANVAS_CATEGORY_COLORS[0]);

  useEffect(() => {
    if (!isOpen) {
      setEditingName(null);
      setDraftName('');
      setDraftIcon(DEFAULT_CANVAS_CATEGORY_ICON);
      setDraftColor(CANVAS_CATEGORY_COLORS[0]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const startCreate = () => {
    setEditingName(null);
    setDraftName('');
    setDraftIcon(DEFAULT_CANVAS_CATEGORY_ICON);
    setDraftColor(CANVAS_CATEGORY_COLORS[0]);
  };

  const startEdit = (category: CanvasCategoryMeta) => {
    setEditingName(category.name);
    setDraftName(category.name);
    setDraftIcon(category.icon || DEFAULT_CANVAS_CATEGORY_ICON);
    setDraftColor(category.color || CANVAS_CATEGORY_COLORS[0]);
  };

  const submitCategory = (event: React.FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;

    const category = {
      name,
      icon: draftIcon || DEFAULT_CANVAS_CATEGORY_ICON,
      color: draftColor || CANVAS_CATEGORY_COLORS[0],
    };

    if (editingName) {
      onSave(editingName, category);
    } else {
      onAdd(category);
    }
    startCreate();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-blue-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">画布分类</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr]">
          <div className="min-h-0 border-r border-gray-100 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/30">
            <button
              onClick={startCreate}
              className={`mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium outline-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-800 ${
                !editingName && !draftName
                  ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-gray-300 text-gray-500 hover:border-blue-300 hover:bg-white hover:text-blue-600 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              <FolderPlus className="h-4 w-4" />
              新建分类
            </button>

            <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
              {categories.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  暂无自定义分类
                </div>
              ) : (
                categories.map(category => {
                  const selected = editingName === category.name;
                  return (
                    <button
                      key={category.name}
                      onClick={() => startEdit(category)}
                      className={`group relative flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left outline-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-800 ${
                        selected
                          ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                          : 'text-gray-700 hover:bg-white dark:text-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                      {selected && (
                        <span className="absolute left-1 top-2 bottom-2 w-0.5 rounded-full bg-blue-500" />
                      )}
                      <span
                        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: selected ? `${category.color}22` : `${category.color}14` }}
                      >
                        <CanvasCategoryIcon icon={category.icon} color={category.color} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {category.name}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs ${
                        selected
                          ? 'bg-white/80 text-blue-500 dark:bg-gray-800/80 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {counts[category.name] || 0}
                      </span>
                      <span
                        onClick={event => {
                          event.stopPropagation();
                          onDelete(category.name);
                        }}
                        className="rounded-md p-1 text-gray-400 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-900/20"
                        title="删除分类，画布会移动到其他分类"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })
              )}
            </div>

          </div>

          <form onSubmit={submitCategory} className="min-h-0 overflow-y-auto p-5">
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white">
                {editingName ? '编辑分类' : '新建分类'}
              </h4>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">分类名称</label>
                <input
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                  autoFocus
                  placeholder="例如：项目草图"
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-900 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">颜色</label>
                <div className="flex flex-wrap gap-2">
                  {CANVAS_CATEGORY_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setDraftColor(color)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-105 ${
                        draftColor === color ? 'ring-2 ring-gray-400 ring-offset-2 dark:ring-offset-gray-800' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    >
                      {draftColor === color ? <Check className="h-4 w-4 text-white" /> : null}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">图标</label>
                <div className="grid max-h-48 grid-cols-8 gap-2 overflow-y-auto pr-1">
                  {AVAILABLE_ICONS.map(iconName => {
                    const selected = draftIcon === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setDraftIcon(iconName)}
                        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                          selected
                            ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900'
                        }`}
                        title={iconName}
                      >
                        <CanvasCategoryIcon
                          icon={iconName}
                          color={selected ? draftColor : '#94a3b8'}
                          className="h-4 w-4"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={startCreate}
                className="rounded-xl px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                清空
              </button>
              <button
                type="submit"
                disabled={!draftName.trim()}
                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editingName ? '保存' : '创建'}
              </button>
            </div>
          </form>
          </div>
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

const MermaidImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onImport: (code: string, mode: 'append' | 'replace') => void;
  isImporting: boolean;
}> = ({ isOpen, onClose, onImport, isImporting }) => {
  const [code, setCode] = useState('flowchart TD\n  A[开始] --> B{是否继续}\n  B -->|是| C[处理]\n  B -->|否| D[结束]');
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  useEffect(() => {
    if (!isOpen) return;
    setMode('append');
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = !!code.trim() && !isImporting;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="m-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-gray-800" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">根据 Mermaid 生成绘图</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">粘贴 Mermaid 代码后，直接生成到当前 Excalidraw 画布。</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('append')}
              className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
                mode === 'append'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              追加到当前画布
            </button>
            <button
              type="button"
              onClick={() => setMode('replace')}
              className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
                mode === 'replace'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              替换当前画布
            </button>
          </div>

          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            rows={14}
            placeholder="在这里粘贴 Mermaid 代码..."
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />

          <div className="text-xs text-gray-500 dark:text-gray-400">
            当前接入的是官方 `@excalidraw/mermaid-to-excalidraw`。常用 `flowchart`、`sequence`、`class` 更稳，复杂语法解析失败时会直接报错。
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/60">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            取消
          </button>
          <button
            onClick={() => onImport(code.trim(), mode)}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {isImporting ? '生成中...' : '生成绘图'}
          </button>
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
  const [activeId, setActiveId] = useState<string>(loadActiveId);
  const [isCanvasStorageReady, setIsCanvasStorageReady] = useState(() => !hasUnifiedFileStorage());

  // UI 状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrawingFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<DrawingFile | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMermaidModalOpen, setIsMermaidModalOpen] = useState(false);
  const [isMermaidImporting, setIsMermaidImporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCanvasManagerOpen, setIsCanvasManagerOpen] = useState(true);
  const [canvasSearch, setCanvasSearch] = useState('');
  const [canvasCategoryFilter, setCanvasCategoryFilter] = useState(ALL_CANVAS_CATEGORY);
  const [canvasCategories, setCanvasCategories] = useState<CanvasCategoryMeta[]>(loadCanvasCategories);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [draggedCanvasId, setDraggedCanvasId] = useState<string | null>(null);
  const [dragOverCanvasId, setDragOverCanvasId] = useState<string | null>(null);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [isNewCanvasModalOpen, setIsNewCanvasModalOpen] = useState(false);
  const [newCanvasDefaultCategory, setNewCanvasDefaultCategory] = useState('');
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

  useEffect(() => {
    if (!hasUnifiedFileStorage()) return;
    let cancelled = false;

    Promise.all([
      loadDrawingsFromStorage(),
      loadActiveIdFromStorage(),
      loadCanvasCategoriesFromStorage(),
      loadLibraryFromStorage(),
      loadLatexMapFromStorage(),
      loadDefaultsFromStorage(),
    ])
      .then(([storedDrawings, storedActiveId, storedCategories, storedLibrary, storedLatexMap, storedDefaults]) => {
        if (cancelled) return;
        setDrawings(storedDrawings);
        setActiveId(storedActiveId);
        setCanvasCategories(storedCategories);
        setLibraryItems(storedLibrary);
        latexMapRef.current = storedLatexMap;
        if (Object.keys(storedDefaults).length > 0) {
          saveDefaults(storedDefaults);
        }
        setIsCanvasStorageReady(true);
      })
      .catch(() => {
        if (!cancelled) setIsCanvasStorageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshFromAgent = async () => {
      const [storedDrawings, storedActiveId, storedCategories] = await Promise.all([
        loadDrawingsFromStorage(),
        loadActiveIdFromStorage(),
        loadCanvasCategoriesFromStorage(),
      ]);
      if (cancelled) return;
      setDrawings(storedDrawings);
      setActiveId(storedActiveId);
      setCanvasCategories(storedCategories);
      setIsCanvasStorageReady(true);
    };
    window.addEventListener('guyue-canvas-updated', refreshFromAgent);
    return () => {
      cancelled = true;
      window.removeEventListener('guyue-canvas-updated', refreshFromAgent);
    };
  }, []);

  // LaTeX 编辑弹窗状态
  const [latexEditTarget, setLatexEditTarget] = useState<{ elementId: string; fileId: string; latex: string } | null>(null);
  const [isLatexProcessing, setIsLatexProcessing] = useState(false);

  // 画布容器 ref（用于 DOM 检测）
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const mermaidDialogInterceptedRef = useRef(false);

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
  const handleChange = useCallback((elements: readonly any[], appState: any) => {
    const isBuiltinMermaidDialogOpen =
      appState?.openDialog?.name === 'ttd' && appState?.openDialog?.tab === 'mermaid';

    if (isBuiltinMermaidDialogOpen && !mermaidDialogInterceptedRef.current) {
      mermaidDialogInterceptedRef.current = true;
      closeBuiltinMermaidDialog(excalidrawAPIRef.current);
      setIsMermaidModalOpen(true);
    } else if (!isBuiltinMermaidDialogOpen && mermaidDialogInterceptedRef.current && !isMermaidModalOpen) {
      mermaidDialogInterceptedRef.current = false;
    }

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
  }, [exportUtils, isMermaidModalOpen]);

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

  const canvasCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const drawing of drawings) {
      const category = normalizeCanvasCategory(drawing.category);
      if (!category) continue;
      counts[category] = (counts[category] || 0) + 1;
    }
    return counts;
  }, [drawings]);

  const visibleCanvasCategories = useMemo(() => {
    const storedByName = new Map(canvasCategories.map(category => [category.name, category]));
    const usedCategories = drawings
      .map(drawing => normalizeCanvasCategory(drawing.category))
      .filter(Boolean);
    const merged = [...canvasCategories];
    for (const category of usedCategories) {
      if (!storedByName.has(category) && !merged.some(item => item.name === category)) {
        merged.push(createCanvasCategoryMeta(category));
      }
    }
    return merged;
  }, [canvasCategories, drawings]);

  const visibleCanvasCategoryNames = useMemo(
    () => visibleCanvasCategories.map(category => category.name),
    [visibleCanvasCategories],
  );

  const canvasCategoryMetaByName = useMemo(() => {
    const map = new Map<string, CanvasCategoryMeta>();
    for (const category of visibleCanvasCategories) {
      map.set(category.name, category);
    }
    return map;
  }, [visibleCanvasCategories]);

  const filteredDrawings = useMemo(() => {
    const keyword = canvasSearch.trim().toLowerCase();
    return drawings.filter(drawing => {
      if (
        canvasCategoryFilter !== ALL_CANVAS_CATEGORY &&
        normalizeCanvasCategory(drawing.category) !== canvasCategoryFilter
      ) {
        return false;
      }
      if (!keyword) return true;
      return drawing.name.toLowerCase().includes(keyword);
    });
  }, [drawings, canvasSearch, canvasCategoryFilter]);

  const getCurrentSceneSnapshot = useCallback(() => {
    const api = excalidrawAPIRef.current;
    if (!api || !activeId) return null;
    return {
      elements: api.getSceneElements(),
      appState: pickAppState(api.getAppState()),
      files: api.getFiles(),
    };
  }, [activeId]);

  const updateCanvasCategories = useCallback((categories: Array<CanvasCategoryMeta | string>) => {
    const normalized = normalizeCanvasCategoryMetas(categories);
    setCanvasCategories(normalized);
    saveCanvasCategories(normalized);
    return normalized;
  }, []);

  const handleNewDrawing = useCallback(() => {
    const defaultCategory =
      canvasCategoryFilter !== ALL_CANVAS_CATEGORY
        ? canvasCategoryFilter
        : '';
    setNewCanvasDefaultCategory(defaultCategory);
    setIsNewCanvasModalOpen(true);
    setIsCanvasManagerOpen(true);
  }, [canvasCategoryFilter]);

  // 创建画布
  const handleCreateDrawing = useCallback((name: string, category: string) => {
    const finalCategory = category.trim();
    if (isReservedCanvasCategory(finalCategory)) {
      showToast('新建画布必须选择分类', 'error');
      return;
    }

    const defaults = loadDefaults();
    const now = Date.now();
    const currentSnapshot = getCurrentSceneSnapshot();
    const baseDrawings = currentSnapshot
      ? drawings.map(d => d.id === activeId ? { ...d, data: currentSnapshot, updatedAt: now } : d)
      : drawings;
    const newDrawing: DrawingFile = {
      id: generateId(),
      name: name.trim() || `画布 ${drawings.length + 1}`,
      data: { elements: [], appState: { ...defaults }, files: {} },
      category: finalCategory,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newDrawing, ...baseDrawings];
    setDrawings(updated);
    saveDrawings(updated);
    setActiveId(newDrawing.id);
    saveActiveId(newDrawing.id);
    if (!visibleCanvasCategoryNames.includes(finalCategory)) {
      updateCanvasCategories([...canvasCategories, finalCategory]);
    }
    setCanvasCategoryFilter(finalCategory);
    setIsCanvasManagerOpen(true);
    setIsNewCanvasModalOpen(false);
  }, [activeId, canvasCategories, drawings, getCurrentSceneSnapshot, showToast, updateCanvasCategories, visibleCanvasCategoryNames]);

  // 切换画布前先保存当前画布
  const saveCurrentScene = useCallback(() => {
    const snapshot = getCurrentSceneSnapshot();
    if (!snapshot || !activeId) return;
    const updated = drawings.map(d =>
      d.id === activeId ? { ...d, data: snapshot, updatedAt: Date.now() } : d
    );
    setDrawings(updated);
    saveDrawings(updated);
  }, [activeId, drawings, getCurrentSceneSnapshot]);

  // 切换画布
  const handleSwitchDrawing = useCallback((id: string) => {
    if (id === activeId) return;
    saveCurrentScene();
    setActiveId(id);
    saveActiveId(id);
  }, [activeId, saveCurrentScene]);

  // 手动保存
  const handleSave = useCallback(() => {
    saveCurrentScene();
    showToast('已保存');
  }, [saveCurrentScene, showToast]);

  const handleImportMermaid = useCallback(async (code: string, mode: 'append' | 'replace') => {
    if (!excalidrawAPIRef.current || !exportUtils?.convertToExcalidrawElements || !activeId) {
      showToast('绘图引擎未就绪', 'error');
      return;
    }

    setIsMermaidImporting(true);
    try {
      const api = excalidrawAPIRef.current;
      const currentAppState = api.getAppState();
      const preferredFontSize = Number(currentAppState.currentItemFontSize) || 22;
      const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw');
      const result = await parseMermaidToExcalidraw(code, {
        themeVariables: {
          fontSize: `${preferredFontSize}px`,
        },
      });

      const currentElements = api.getSceneElements().filter((el: any) => !el.isDeleted);
      const currentFiles = api.getFiles();
      const importedFiles = result.files || {};
      if (Object.keys(importedFiles).length) {
        api.addFiles(Object.values(importedFiles));
      }

      let importedElements = applyCurrentStyleToElements(
        exportUtils.convertToExcalidrawElements(result.elements || []),
        currentAppState,
      );
      if (!importedElements.length) {
        throw new Error('没有解析出可绘制元素');
      }

      if (mode === 'append' && currentElements.length) {
        const currentBounds = getElementsBounds(currentElements);
        const importedBounds = getElementsBounds(importedElements);
        const gap = 160;
        importedElements = offsetElements(
          importedElements,
          currentBounds.maxX - importedBounds.minX + gap,
          currentBounds.minY - importedBounds.minY,
        );
      }

      const nextElements = mode === 'replace' ? importedElements : [...currentElements, ...importedElements];
      const nextFiles = mode === 'replace' ? importedFiles : { ...currentFiles, ...importedFiles };

      api.updateScene({
        elements: nextElements,
        files: nextFiles,
      });

      const updated = drawings.map(d =>
        d.id === activeId
          ? {
              ...d,
              data: {
                elements: nextElements,
                appState: pickAppState(currentAppState),
                files: nextFiles,
              },
              updatedAt: Date.now(),
            }
          : d,
      );
      setDrawings(updated);
      saveDrawings(updated);

      setIsMermaidModalOpen(false);
      requestAnimationFrame(() => {
        try {
          api.scrollToContent?.(nextElements, {
            fitToContent: true,
          });
        } catch {}
      });
      showToast(mode === 'replace' ? 'Mermaid 已生成并替换当前画布' : 'Mermaid 已追加到当前画布');
    } catch (err: any) {
      console.error('Import Mermaid error:', err);
      showToast(err?.message || 'Mermaid 生成失败', 'error');
    } finally {
      setIsMermaidImporting(false);
    }
  }, [activeId, drawings, exportUtils, showToast]);

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
      saveActiveId(nextId);
    }
    setDeleteTarget(null);
    showToast('画布已删除');
  }, [drawings, activeId, showToast]);

  // 编辑画布信息
  const handleEditDrawing = useCallback((newName: string, newCategory: string) => {
    if (!renameTarget) return;
    const finalCategory = newCategory.trim();
    if (isReservedCanvasCategory(finalCategory)) {
      showToast('画布必须选择分类', 'error');
      return;
    }

    const snapshot = getCurrentSceneSnapshot();
    const baseDrawings = snapshot && activeId
      ? drawings.map(d => d.id === activeId ? { ...d, data: snapshot, updatedAt: Date.now() } : d)
      : drawings;
    const updated = baseDrawings.map(d =>
      d.id === renameTarget.id
        ? { ...d, name: newName, category: finalCategory, updatedAt: Date.now() }
        : d,
    );
    setDrawings(updated);
    saveDrawings(updated);
    if (!visibleCanvasCategoryNames.includes(finalCategory)) {
      updateCanvasCategories([...canvasCategories, finalCategory]);
    }
    setRenameTarget(null);
    showToast('已保存');
  }, [activeId, canvasCategories, drawings, getCurrentSceneSnapshot, renameTarget, showToast, updateCanvasCategories, visibleCanvasCategoryNames]);

  const handleAddCanvasCategory = useCallback((category: CanvasCategoryMeta) => {
    const name = category.name.trim();
    if (isReservedCanvasCategory(name)) {
      showToast('分类名称不可用', 'error');
      return;
    }
    if (visibleCanvasCategoryNames.includes(name)) {
      showToast('分类已存在', 'error');
      return;
    }
    updateCanvasCategories([...canvasCategories, { ...category, name }]);
    setCanvasCategoryFilter(name);
    showToast('分类已添加');
  }, [canvasCategories, showToast, updateCanvasCategories, visibleCanvasCategoryNames]);

  const handleSaveCanvasCategory = useCallback((oldName: string, nextCategory: CanvasCategoryMeta) => {
    const nextName = nextCategory.name.trim();
    if (isReservedCanvasCategory(nextName)) {
      showToast('分类名称不可用', 'error');
      return;
    }
    if (nextName !== oldName && visibleCanvasCategoryNames.includes(nextName)) {
      showToast('分类已存在', 'error');
      return;
    }

    const snapshot = getCurrentSceneSnapshot();
    const baseDrawings = snapshot && activeId
      ? drawings.map(d => d.id === activeId ? { ...d, data: snapshot, updatedAt: Date.now() } : d)
      : drawings;
    const updatedDrawings = baseDrawings.map(d =>
      normalizeCanvasCategory(d.category) === oldName ? { ...d, category: nextName, updatedAt: Date.now() } : d,
    );
    const normalizedNextCategory = {
      ...nextCategory,
      name: nextName,
      icon: nextCategory.icon || DEFAULT_CANVAS_CATEGORY_ICON,
      color: nextCategory.color || createCanvasCategoryMeta(nextName).color,
    };
    const updatedCategories = canvasCategories.some(category => category.name === oldName)
      ? canvasCategories.map(category => category.name === oldName ? normalizedNextCategory : category)
      : [...canvasCategories, normalizedNextCategory];

    setDrawings(updatedDrawings);
    saveDrawings(updatedDrawings);
    updateCanvasCategories(updatedCategories);
    if (canvasCategoryFilter === oldName) setCanvasCategoryFilter(nextName);
    showToast('分类已保存');
  }, [activeId, canvasCategories, canvasCategoryFilter, drawings, getCurrentSceneSnapshot, showToast, updateCanvasCategories, visibleCanvasCategoryNames]);

  const handleDeleteCanvasCategory = useCallback((name: string) => {
    const remainingCategories = visibleCanvasCategories.filter(category => category.name !== name);
    const fallbackCategory = remainingCategories[0]?.name || '';
    const snapshot = getCurrentSceneSnapshot();
    const baseDrawings = snapshot && activeId
      ? drawings.map(d => d.id === activeId ? { ...d, data: snapshot, updatedAt: Date.now() } : d)
      : drawings;
    const hasAffectedDrawings = baseDrawings.some(d => normalizeCanvasCategory(d.category) === name);
    if (hasAffectedDrawings && !fallbackCategory) {
      showToast('至少保留一个分类', 'error');
      return;
    }
    const updatedDrawings = baseDrawings.map(d =>
      normalizeCanvasCategory(d.category) === name ? { ...d, category: fallbackCategory, updatedAt: Date.now() } : d,
    );

    setDrawings(updatedDrawings);
    saveDrawings(updatedDrawings);
    updateCanvasCategories(canvasCategories.filter(category => category.name !== name));
    if (canvasCategoryFilter === name) setCanvasCategoryFilter(fallbackCategory || ALL_CANVAS_CATEGORY);
    showToast('分类已删除');
  }, [activeId, canvasCategories, canvasCategoryFilter, drawings, getCurrentSceneSnapshot, showToast, updateCanvasCategories, visibleCanvasCategories]);

  const handleDuplicateDrawing = useCallback((drawing: DrawingFile) => {
    const now = Date.now();
    const currentSnapshot = drawing.id === activeId ? getCurrentSceneSnapshot() : null;
    const baseDrawings = currentSnapshot
      ? drawings.map(d => d.id === drawing.id ? { ...d, data: currentSnapshot, updatedAt: now } : d)
      : drawings;
    const source = baseDrawings.find(d => d.id === drawing.id);
    if (!source) return;

    const duplicated: DrawingFile = {
      ...source,
      id: generateId(),
      name: `${source.name} 副本`,
      data: cloneSceneData(source.data),
      createdAt: now,
      updatedAt: now,
    };
    const sourceIndex = baseDrawings.findIndex(d => d.id === drawing.id);
    const updated = [
      ...baseDrawings.slice(0, sourceIndex + 1),
      duplicated,
      ...baseDrawings.slice(sourceIndex + 1),
    ];

    setDrawings(updated);
    saveDrawings(updated);
    setActiveId(duplicated.id);
    saveActiveId(duplicated.id);
    setIsCanvasManagerOpen(true);
    showToast('已复制画布');
  }, [activeId, drawings, getCurrentSceneSnapshot, showToast]);

  const handleMoveDrawing = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const snapshot = getCurrentSceneSnapshot();
    const baseDrawings = snapshot && activeId
      ? drawings.map(d => d.id === activeId ? { ...d, data: snapshot, updatedAt: Date.now() } : d)
      : drawings;
    const sourceIndex = baseDrawings.findIndex(d => d.id === sourceId);
    const targetIndex = baseDrawings.findIndex(d => d.id === targetId);
    const source = baseDrawings.find(d => d.id === sourceId);
    if (!source || sourceIndex < 0 || targetIndex < 0) return;

    const withoutSource = baseDrawings.filter(d => d.id !== sourceId);
    const targetIndexWithoutSource = withoutSource.findIndex(d => d.id === targetId);
    if (targetIndexWithoutSource < 0) return;
    const insertIndex = sourceIndex < targetIndex ? targetIndexWithoutSource + 1 : targetIndexWithoutSource;

    const updated = [
      ...withoutSource.slice(0, insertIndex),
      source,
      ...withoutSource.slice(insertIndex),
    ];

    setDrawings(updated);
    saveDrawings(updated);
  }, [activeId, drawings, getCurrentSceneSnapshot]);

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
    if (!isCanvasStorageReady) return;
    if (drawings.length === 0) {
      handleNewDrawing();
    } else if (!activeId || !drawings.find(d => d.id === activeId)) {
      setActiveId(drawings[0].id);
      saveActiveId(drawings[0].id);
    }
  }, [activeId, drawings, handleNewDrawing, isCanvasStorageReady]);

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

  useEffect(() => {
    if (!isCanvasFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCanvasFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCanvasFullscreen]);

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
    <div className={isCanvasFullscreen ? 'fixed inset-0 z-[95] flex flex-col bg-white dark:bg-gray-900' : 'h-full flex flex-col relative'}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10 shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setIsCanvasManagerOpen(open => !open)}
            className={`p-2 rounded-lg transition-colors ${
              isCanvasManagerOpen
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            title="画布库"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">绘图板</h2>
          </div>
          <button
            onClick={() => setIsCanvasManagerOpen(true)}
            className="hidden min-w-0 max-w-[420px] items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 md:flex"
            title={activeDrawing?.name || '未选择'}
          >
            <span className="truncate text-gray-700 dark:text-gray-200">{activeDrawing?.name || '未选择'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCanvasFullscreen(value => !value)}
            className="p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg"
            title={isCanvasFullscreen ? '退出全屏' : '全屏'}
          >
            {isCanvasFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

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

      <div className="min-h-0 flex flex-1 bg-gray-50 dark:bg-gray-900">
        {isCanvasManagerOpen && (
          <aside className="flex w-80 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 p-3 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    value={canvasSearch}
                    onChange={event => setCanvasSearch(event.target.value)}
                    placeholder="搜索画布"
                    className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </div>
                <button
                  onClick={handleNewDrawing}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-500 px-3 text-sm font-medium text-white hover:bg-blue-600"
                >
                  <Plus className="h-4 w-4" />
                  新建
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/60">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                    <Tag className="h-3.5 w-3.5" />
                    分类
                  </div>
                  <button
                    onClick={() => setIsCategoryManagerOpen(true)}
                    className="rounded-md px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >
                    管理
                  </button>
                </div>
                <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                  <button
                    onClick={() => setCanvasCategoryFilter(ALL_CANVAS_CATEGORY)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-800 ${
                      canvasCategoryFilter === ALL_CANVAS_CATEGORY
                        ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-300'
                        : 'text-gray-500 hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <span>全部</span>
                    <span>{drawings.length}</span>
                  </button>
                  {visibleCanvasCategories.map(category => (
                    <button
                      key={category.name}
                      onClick={() => setCanvasCategoryFilter(category.name)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-800 ${
                        canvasCategoryFilter === category.name
                          ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-300'
                          : 'text-gray-500 hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                          style={{ backgroundColor: `${category.color}18` }}
                        >
                          <CanvasCategoryIcon icon={category.icon} color={category.color} className="h-3 w-3" />
                        </span>
                        <span className="truncate">{category.name}</span>
                      </span>
                      <span>{canvasCategoryCounts[category.name] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredDrawings.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                  没有匹配画布
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredDrawings.map(drawing => {
                    const isActive = drawing.id === activeId;
                    const drawingCategory = normalizeCanvasCategory(drawing.category);
                    const drawingCategoryMeta = drawingCategory
                      ? canvasCategoryMetaByName.get(drawingCategory) || createCanvasCategoryMeta(drawingCategory)
                      : null;
                    return (
                      <div
                        key={drawing.id}
                        role="button"
                        tabIndex={0}
                        onDragOver={event => {
                          event.preventDefault();
                          if (draggedCanvasId && draggedCanvasId !== drawing.id) {
                            setDragOverCanvasId(drawing.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverCanvasId === drawing.id) setDragOverCanvasId(null);
                        }}
                        onDrop={event => {
                          event.preventDefault();
                          const sourceId = event.dataTransfer.getData('text/plain') || draggedCanvasId;
                          if (sourceId) handleMoveDrawing(sourceId, drawing.id);
                          setDraggedCanvasId(null);
                          setDragOverCanvasId(null);
                        }}
                        onClick={() => handleSwitchDrawing(drawing.id)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') handleSwitchDrawing(drawing.id);
                        }}
                        className={`group flex cursor-pointer gap-2 rounded-lg border p-2.5 outline-none transition-colors ${
                          isActive
                            ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/25'
                            : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-700/40'
                        } ${draggedCanvasId === drawing.id ? 'opacity-45' : ''} ${
                          dragOverCanvasId === drawing.id ? 'ring-2 ring-blue-300 dark:ring-blue-700' : ''
                        }`}
                      >
                        <div
                          draggable
                          onClick={event => event.stopPropagation()}
                          onDragStart={event => {
                            event.stopPropagation();
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', drawing.id);
                            setDraggedCanvasId(drawing.id);
                          }}
                          onDragEnd={() => {
                            setDraggedCanvasId(null);
                            setDragOverCanvasId(null);
                          }}
                          className="flex h-20 w-4 shrink-0 cursor-grab items-center justify-center text-gray-300 active:cursor-grabbing group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400"
                          title="拖拽排序"
                        >
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className={`flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
                          isActive
                            ? 'border-blue-200 bg-white text-blue-500 dark:border-blue-800 dark:bg-gray-900'
                            : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-900'
                        }`}>
                          <CanvasThumbnail drawing={drawing} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`truncate text-sm font-medium ${
                              isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'
                            }`}>
                              {drawing.name}
                            </span>
                          </div>
                          <div className="mt-2 flex h-6 min-w-0 items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                            {drawingCategoryMeta && (
                              <span
                                className="inline-flex h-6 min-w-0 max-w-[86px] shrink items-center gap-1 rounded-md px-1.5 leading-none shadow-sm dark:bg-gray-900"
                                style={{
                                  backgroundColor: `${drawingCategoryMeta.color}14`,
                                  color: drawingCategoryMeta.color,
                                }}
                              >
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                  <CanvasCategoryIcon icon={drawingCategoryMeta.icon} color={drawingCategoryMeta.color} className="h-3.5 w-3.5 shrink-0" />
                                </span>
                                <span className="min-w-0 truncate leading-none">{drawingCategory}</span>
                              </span>
                            )}
                            <span className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap leading-none">
                              <Clock3 className="h-3.5 w-3.5 shrink-0" />
                              <span className="leading-none">{formatDrawingTime(drawing.updatedAt)}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            onClick={event => { event.stopPropagation(); setRenameTarget(drawing); }}
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500 dark:hover:bg-gray-700"
                            title="重命名"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={event => { event.stopPropagation(); handleDuplicateDrawing(drawing); }}
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-emerald-500 dark:hover:bg-gray-700"
                            title="复制副本"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {drawings.length > 1 && (
                            <button
                              onClick={event => { event.stopPropagation(); setDeleteTarget(drawing); }}
                              className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                              title="删除"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Excalidraw 编辑器 */}
        <div className="relative min-w-0 flex-1" style={{ minHeight: 0 }} ref={canvasContainerRef}>
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
      <NewCanvasModal
        isOpen={isNewCanvasModalOpen}
        onClose={() => setIsNewCanvasModalOpen(false)}
        onCreate={handleCreateDrawing}
        categories={visibleCanvasCategories}
        defaultCategory={newCanvasDefaultCategory}
        defaultName={`画布 ${drawings.length + 1}`}
      />
      <CanvasEditModal
        isOpen={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        onSave={handleEditDrawing}
        currentName={renameTarget?.name || ''}
        currentCategory={normalizeCanvasCategory(renameTarget?.category)}
        categories={visibleCanvasCategories}
      />
      <CanvasCategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        categories={visibleCanvasCategories}
        counts={canvasCategoryCounts}
        onAdd={handleAddCanvasCategory}
        onSave={handleSaveCanvasCategory}
        onDelete={handleDeleteCanvasCategory}
      />
      <ExportToHostingModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportToHosting}
        isUploading={isUploading}
        defaultName={activeDrawing?.name || 'drawing'}
        availableCategories={imageCategories}
      />
      <MermaidImportModal
        isOpen={isMermaidModalOpen}
        onClose={() => {
          if (!isMermaidImporting) {
            mermaidDialogInterceptedRef.current = false;
            setIsMermaidModalOpen(false);
          }
        }}
        onImport={handleImportMermaid}
        isImporting={isMermaidImporting}
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
