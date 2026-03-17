import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play, ChevronDown, ChevronUp, FolderOpen, Save,
  AlertCircle, AlertTriangle, Info, Loader2, FileType2, CheckCircle2,
  ZoomIn, ZoomOut, Settings2, X, FolderSearch, Download, Package, Search,
  Copy, Plus, Trash2, Image, Check, Omega
} from 'lucide-react';
import { LatexCompileResult, LatexEnvironment, LatexLogEntry, LatexSettings } from '../types';
import { GoogleGenAI } from '@google/genai';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const ENGINES = ['xelatex', 'pdflatex', 'lualatex'] as const;
type Engine = typeof ENGINES[number];

const DEFAULT_TEX = `\\documentclass[12pt, a4paper, fontset=macnew]{ctexart}

\\usepackage{amsmath}
\\usepackage{geometry}
\\usepackage{hologo}
\\geometry{margin=2.5cm}

\\title{标题}
\\author{作者}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{简介}
这是一份用 \\hologo{XeLaTeX} 编译的中文示例文档。

\\section{数学公式}
行内公式：$E = mc^2$

独立公式：
\\begin{equation}
  \\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}
\\end{equation}

\\end{document}
`;

// ─── PDF Viewer ───────────────────────────────────────────────────────────────

interface PdfViewerProps {
  pdfBase64: string | null;
  loading: boolean;
  onDownload?: () => void;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ pdfBase64, loading, onDownload }) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.2);
  const [numPages, setNumPages] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  const renderAllPages = useCallback(async (doc: pdfjs.PDFDocumentProxy, s: number) => {
    if (!canvasContainerRef.current) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const container = canvasContainerRef.current;
    container.innerHTML = '';

    const totalPages = doc.numPages;
    for (let i = 1; i <= totalPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: s });

      const wrapper = document.createElement('div');
      wrapper.style.marginBottom = '16px';
      wrapper.style.display = 'flex';
      wrapper.style.justifyContent = 'center';

      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
      canvas.style.borderRadius = '2px';
      canvas.style.background = '#fff';
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') {
          console.error('PDF render error', e);
        }
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (!pdfBase64) {
      pdfDocRef.current = null;
      setNumPages(0);
      return;
    }

    let cancelled = false;
    setRenderError(null);

    const load = async () => {
      try {
        const binary = atob(pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const loadingTask = pdfjs.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        await renderAllPages(doc, scale);
      } catch (e: any) {
        if (!cancelled) {
          console.error('PDF load error', e);
          setRenderError(e?.message || '无法渲染 PDF');
        }
      }
    };

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBase64]);

  // Re-render when scale changes
  useEffect(() => {
    if (pdfDocRef.current) {
      renderAllPages(pdfDocRef.current, scale);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const zoomIn = () => setScale(s => Math.min(s + 0.2, 3.0));
  const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.4));
  const resetZoom = () => setScale(1.2);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-400">正在编译...</p>
      </div>
    );
  }

  if (!pdfBase64) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3 select-none">
        <FileType2 className="w-16 h-16 text-gray-300" />
        <p className="text-sm text-gray-400">点击「编译」生成 PDF 预览</p>
        <p className="text-xs text-gray-300">快捷键：Cmd+Enter</p>
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm text-red-400">{renderError}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
      {/* PDF toolbar */}
      <div className="h-10 flex items-center justify-between px-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors min-w-[46px] text-center"
            title="重置缩放 (100%)"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={zoomIn}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="放大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {numPages > 0 && (
            <span className="text-xs text-gray-400 mr-1">{numPages} 页</span>
          )}
          {onDownload && pdfBase64 && (
            <button
              onClick={onDownload}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="下载 PDF"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Canvas container */}
      <div className="flex-1 overflow-auto py-4 px-2" ref={canvasContainerRef} />
    </div>
  );
};

// ─── Log Panel ────────────────────────────────────────────────────────────────

interface LogPanelProps {
  result: LatexCompileResult | null;
  isOpen: boolean;
  onToggle: () => void;
}

const LogPanel: React.FC<LogPanelProps> = ({ result, isOpen, onToggle }) => {
  const errorCount = result?.errors.length ?? 0;
  const warnCount = result?.warnings.length ?? 0;
  const hasIssues = errorCount > 0 || warnCount > 0;

  const statusColor = !result
    ? 'text-gray-400'
    : result.success
    ? 'text-green-600'
    : 'text-red-500';

  const renderEntry = (entry: LatexLogEntry, i: number) => {
    const Icon =
      entry.type === 'error'
        ? AlertCircle
        : entry.type === 'warning'
        ? AlertTriangle
        : Info;
    const color =
      entry.type === 'error'
        ? 'text-red-500'
        : entry.type === 'warning'
        ? 'text-yellow-600'
        : 'text-blue-500';
    return (
      <div
        key={i}
        className={`flex gap-2 items-start py-1.5 px-3 hover:bg-gray-50 text-xs font-mono border-b border-gray-100 ${color}`}
      >
        <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span className="flex-1 break-all text-gray-700">
          {entry.file && (
            <span className="text-gray-400">
              {entry.file}
              {entry.line ? `:${entry.line}` : ''}
              {' '}
            </span>
          )}
          {entry.message}
        </span>
      </div>
    );
  };

  return (
    <div
      className={`shrink-0 bg-white border-t border-gray-200 flex flex-col transition-all duration-150 ${
        isOpen ? 'h-44' : 'h-9'
      }`}
    >
      {/* Log header */}
      <button
        onClick={onToggle}
        className="h-9 flex items-center gap-3 px-3 w-full hover:bg-gray-50 transition-colors shrink-0"
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
        )}
        <span className="text-xs font-medium text-gray-500">编译日志</span>
        {result && (
          <>
            <span className={`text-xs font-medium ${statusColor}`}>
              {result.success ? '✓ 成功' : '✗ 失败'} · {result.duration}ms
            </span>
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <AlertCircle className="w-3 h-3" />
                {errorCount} 错误
              </span>
            )}
            {warnCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-600">
                <AlertTriangle className="w-3 h-3" />
                {warnCount} 警告
              </span>
            )}
          </>
        )}
      </button>

      {/* Log content */}
      {isOpen && (
        <div className="flex-1 overflow-auto">
          {!result ? (
            <p className="text-xs text-gray-600 px-4 py-3">尚未编译</p>
          ) : (
            <>
              {result.errors.map((e, i) => renderEntry(e, i))}
              {result.warnings.map((w, i) =>
                renderEntry(w, i + result.errors.length)
              )}
              {!hasIssues && result.success && (
                <div className="flex items-center gap-2 py-2 px-4 text-xs text-green-500">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  编译成功，无错误或警告
                </div>
              )}
              {result.rawLog && (
                <details className="px-3 py-1">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
                    原始日志
                  </summary>
                  <pre className="text-[10px] text-gray-600 whitespace-pre-wrap break-all mt-1 max-h-32 overflow-auto leading-relaxed">
                    {result.rawLog}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Environment Banner ───────────────────────────────────────────────────────

interface EnvBannerProps {
  env: LatexEnvironment | null;
  engine: Engine;
}

const EnvBanner: React.FC<EnvBannerProps> = ({ env, engine }) => {
  if (!env) return null;

  const available = env[engine];
  if (available) return null;

  const anyAvailable = ENGINES.some(e => env[e]);

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-xs text-amber-700 shrink-0">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      {anyAvailable
        ? `当前引擎 ${engine} 未找到，请切换到已安装的引擎`
        : '未检测到 LaTeX 发行版，请安装 MacTeX（macOS）或 MiKTeX（Windows）'}
    </div>
  );
};

// ─── Settings Panel ───────────────────────────────────────────────────────────

interface LatexSettingsPanelProps {
  onClose: () => void;
  env: LatexEnvironment | null;
}

const LatexSettingsPanel: React.FC<LatexSettingsPanelProps> = ({ onClose, env }) => {
  const [settings, setSettings] = useState<LatexSettings>({
    xelatexPath: '',
    pdflatexPath: '',
    lualatexPath: '',
    tlmgrPath: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electronAPI?.latexGetSettings?.().then(s => {
      if (s) setSettings(s);
    }).catch(() => {});
  }, []);

  const handleBrowse = async (engine: keyof LatexSettings) => {
    const p = await window.electronAPI?.latexBrowseExecutable?.();
    if (p) setSettings(prev => ({ ...prev, [engine]: p }));
  };

  const handleSave = async () => {
    setSaving(true);
    await window.electronAPI?.latexSaveSettings?.(settings).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const engines: { key: keyof LatexSettings; label: string; placeholder: string }[] = [
    {
      key: 'xelatexPath',
      label: 'XeLaTeX',
      placeholder: '留空则自动检测，例：/Library/TeX/texbin/xelatex',
    },
    {
      key: 'pdflatexPath',
      label: 'pdfLaTeX',
      placeholder: '留空则自动检测，例：/Library/TeX/texbin/pdflatex',
    },
    {
      key: 'lualatexPath',
      label: 'LuaLaTeX',
      placeholder: '留空则自动检测，例：/Library/TeX/texbin/lualatex',
    },
    {
      key: 'tlmgrPath',
      label: 'tlmgr (包管理器)',
      placeholder: '留空则自动检测，例：/Library/TeX/texbin/tlmgr',
    },
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-12">
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">LaTeX 编译器设置</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-auto flex-1">
          <p className="text-xs text-gray-500 leading-relaxed">
            留空时应用会自动检测系统 PATH 中的编译器。如果自动检测失败（常见于 Electron 应用无法读取完整 PATH），请手动填写编译器的绝对路径或点击「浏览」选择。
          </p>

          {engines.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings[key]}
                  onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 font-mono"
                  spellCheck={false}
                />
                <button
                  onClick={() => handleBrowse(key)}
                  className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  title="浏览文件"
                >
                  <FolderSearch className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          <div className="pt-1 text-xs text-gray-400">
            <span className="font-medium text-gray-500">macOS MacTeX 默认路径：</span>
            {' '}/Library/TeX/texbin/xelatex
            <br />
            <span className="font-medium text-gray-500">Windows MiKTeX 默认路径：</span>
            {' '}C:\Program Files\MiKTeX\miktex\bin\x64\xelatex.exe
          </div>

          {/* Environment Info */}
          {env && (
            <div className="pt-3 mt-3 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-600 mb-2">本地环境检测</div>
              <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100">
                {/* Engines */}
                {[
                  { label: 'XeLaTeX', path: env.xelatex, desc: '支持 Unicode / 系统字体，推荐中文排版' },
                  { label: 'pdfLaTeX', path: env.pdflatex, desc: '经典引擎，英文文档首选' },
                  { label: 'LuaLaTeX', path: env.lualatex, desc: '内置 Lua 脚本，支持 Unicode' },
                ].map(({ label, path, desc }) => (
                  <div key={label} className="flex items-center gap-2 px-3 py-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${path ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className="text-xs font-medium text-gray-600 min-w-[70px]">{label}</span>
                    {path ? (
                      <span className="text-[10px] font-mono text-gray-400 truncate" title={path}>{path}</span>
                    ) : (
                      <span className="text-[10px] text-red-400">未安装</span>
                    )}
                    <span className="ml-auto text-[10px] text-gray-300 shrink-0 hidden sm:inline">{desc}</span>
                  </div>
                ))}
                {/* Package managers */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${env.tlmgr ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <span className="text-xs font-medium text-gray-600 min-w-[70px]">tlmgr</span>
                  {env.tlmgr ? (
                    <span className="text-[10px] font-mono text-gray-400 truncate" title={env.tlmgr}>{env.tlmgr}</span>
                  ) : (
                    <span className="text-[10px] text-gray-400">未找到</span>
                  )}
                  <span className="ml-auto text-[10px] text-gray-300 shrink-0 hidden sm:inline">TeX Live 包管理器</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${env.mpm ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <span className="text-xs font-medium text-gray-600 min-w-[70px]">mpm</span>
                  {env.mpm ? (
                    <span className="text-[10px] font-mono text-gray-400 truncate" title={env.mpm}>{env.mpm}</span>
                  ) : (
                    <span className="text-[10px] text-gray-400">未找到</span>
                  )}
                  <span className="ml-auto text-[10px] text-gray-300 shrink-0 hidden sm:inline">MiKTeX 包管理器</span>
                </div>
                {/* ctex */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${env.ctexInstalled ? 'bg-green-400' : 'bg-yellow-400'}`} />
                  <span className="text-xs font-medium text-gray-600 min-w-[70px]">ctex 宏包</span>
                  <span className={`text-[10px] ${env.ctexInstalled ? 'text-green-600' : 'text-yellow-600'}`}>
                    {env.ctexInstalled ? '已安装' : '未安装（中文排版需要）'}
                  </span>
                </div>
                {/* Platform */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-400" />
                  <span className="text-xs font-medium text-gray-600 min-w-[70px]">系统</span>
                  <span className="text-[10px] text-gray-400">
                    {env.platform === 'darwin' ? 'macOS' : env.platform === 'win32' ? 'Windows' : 'Linux'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : null}
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Package List Panel ───────────────────────────────────────────────────────

interface PackageInfo {
  name: string;
  description: string;
  category: string;
}

const COMMON_PACKAGES: PackageInfo[] = [
  // 文档与中文
  { name: 'ctexart / ctexrep / ctexbook', description: '中文文档类，自动配置中文排版', category: '文档与中文' },
  { name: 'CJKutf8', description: 'pdfLaTeX 下的 CJK 中文支持', category: '文档与中文' },
  // 数学
  { name: 'amsmath', description: '数学公式增强（align, equation 等环境）', category: '数学' },
  { name: 'amssymb', description: 'AMS 数学符号（\\mathbb, \\therefore 等）', category: '数学' },
  { name: 'mathtools', description: 'amsmath 增强，提供更多数学工具', category: '数学' },
  { name: 'amsthm', description: '定理、定义、证明等环境', category: '数学' },
  { name: 'bm', description: '粗体数学符号 \\bm{x}', category: '数学' },
  { name: 'unicode-math', description: 'XeLaTeX/LuaLaTeX 下使用 Unicode 数学字体', category: '数学' },
  // 排版布局
  { name: 'geometry', description: '页边距与纸张大小设置', category: '排版布局' },
  { name: 'fancyhdr', description: '自定义页眉页脚', category: '排版布局' },
  { name: 'titlesec', description: '自定义章节标题样式', category: '排版布局' },
  { name: 'enumitem', description: '自定义列表（itemize/enumerate）间距', category: '排版布局' },
  { name: 'multicol', description: '多栏排版', category: '排版布局' },
  { name: 'setspace', description: '设置行距（\\onehalfspacing 等）', category: '排版布局' },
  { name: 'parskip', description: '段间距替代首行缩进', category: '排版布局' },
  // 图表浮动
  { name: 'graphicx', description: '插入图片 \\includegraphics', category: '图表浮动' },
  { name: 'float', description: '精确控制浮动体位置 [H]', category: '图表浮动' },
  { name: 'caption', description: '自定义图表标题样式', category: '图表浮动' },
  { name: 'subcaption', description: '子图排版 subfigure 环境', category: '图表浮动' },
  { name: 'booktabs', description: '高质量三线表 \\toprule \\midrule \\bottomrule', category: '图表浮动' },
  { name: 'longtable', description: '跨页长表格', category: '图表浮动' },
  { name: 'tabularx', description: '自动列宽表格', category: '图表浮动' },
  { name: 'multirow', description: '表格跨行合并', category: '图表浮动' },
  // 绘图
  { name: 'tikz (pgf)', description: '强大的矢量绘图工具', category: '绘图' },
  { name: 'pgfplots', description: '基于 TikZ 的函数/数据绘图', category: '绘图' },
  { name: 'circuitikz', description: '电路图绘制', category: '绘图' },
  // 代码
  { name: 'listings', description: '代码高亮排版', category: '代码' },
  { name: 'minted', description: '基于 Pygments 的高级代码高亮（需 -shell-escape）', category: '代码' },
  { name: 'algorithm2e', description: '伪代码/算法排版', category: '代码' },
  { name: 'algorithmicx', description: '伪代码排版（另一种风格）', category: '代码' },
  // 字体
  { name: 'fontspec', description: 'XeLaTeX/LuaLaTeX 系统字体选择', category: '字体' },
  { name: 'xeCJK', description: 'XeLaTeX 中日韩字体配置', category: '字体' },
  { name: 'hologo', description: 'LaTeX 引擎标志（\\hologo{XeLaTeX} 等）', category: '字体' },
  // 引用链接
  { name: 'hyperref', description: '超链接、PDF 书签、交叉引用可点击', category: '引用链接' },
  { name: 'cleveref', description: '智能交叉引用（自动加"图""表"等前缀）', category: '引用链接' },
  { name: 'biblatex', description: '现代参考文献管理', category: '引用链接' },
  { name: 'natbib', description: '经典参考文献引用样式', category: '引用链接' },
  { name: 'url', description: 'URL 排版与断行', category: '引用链接' },
  // 颜色与装饰
  { name: 'xcolor', description: '颜色支持，定义自定义颜色', category: '颜色与装饰' },
  { name: 'tcolorbox', description: '彩色文本框、定理框', category: '颜色与装饰' },
  { name: 'mdframed', description: '带边框的文本块', category: '颜色与装饰' },
  // 实用工具
  { name: 'appendix', description: '附录管理', category: '实用工具' },
  { name: 'tocbibind', description: '将目录/参考文献等加入目录', category: '实用工具' },
  { name: 'siunitx', description: '国际单位制排版 \\SI{9.8}{m/s^2}', category: '实用工具' },
  { name: 'ulem', description: '各类下划线与删除线', category: '实用工具' },
  { name: 'import', description: '相对路径 \\input / \\include', category: '实用工具' },
  { name: 'pdfpages', description: '将已有 PDF 页面插入文档', category: '实用工具' },
];

interface PackageListPanelProps {
  onClose: () => void;
}

const PackageListPanel: React.FC<PackageListPanelProps> = ({ onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [installPkg, setInstallPkg] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<{ success: boolean; output: string } | null>(null);

  const handleInstall = async () => {
    const name = installPkg.trim();
    if (!name || !window.electronAPI?.latexInstallPackage) return;
    setInstalling(true);
    setInstallResult(null);
    try {
      const result = await window.electronAPI.latexInstallPackage(name);
      setInstallResult(result);
    } catch (e: any) {
      setInstallResult({ success: false, output: e?.message || '未知错误' });
    } finally {
      setInstalling(false);
    }
  };

  const filtered = COMMON_PACKAGES.filter(pkg =>
    pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, PackageInfo[]>>((acc, pkg) => {
    (acc[pkg.category] ??= []).push(pkg);
    return acc;
  }, {});

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-12">
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">常用宏包速查</span>
            <span className="text-xs text-gray-400">({COMMON_PACKAGES.length} 个)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索宏包名称或功能..."
              className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {Object.entries(grouped).map(([category, pkgs]) => (
            <div key={category} className="mb-4">
              <div className="text-xs font-semibold text-gray-500 mb-2 sticky top-0 bg-white py-1">{category}</div>
              <div className="space-y-1">
                {pkgs.map(pkg => (
                  <div
                    key={pkg.name}
                    className="flex items-baseline gap-3 py-1.5 px-2 rounded hover:bg-gray-50 transition-colors"
                  >
                    <code className="text-xs font-mono text-blue-600 shrink-0 min-w-[160px]">{pkg.name}</code>
                    <span className="text-xs text-gray-500">{pkg.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">未找到匹配的宏包</p>
          )}
        </div>

        {/* Install package */}
        <div className="px-5 py-3 border-t border-gray-200 shrink-0 space-y-2">
          <div className="text-xs font-medium text-gray-600">安装宏包 (tlmgr)</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={installPkg}
              onChange={e => setInstallPkg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleInstall(); }}
              placeholder="输入包名，如 tikz、minted..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 font-mono"
              disabled={installing}
            />
            <button
              onClick={handleInstall}
              disabled={installing || !installPkg.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {installing ? '安装中...' : '安装'}
            </button>
          </div>
          {installResult && (
            <div className={`text-[11px] font-mono rounded-lg px-3 py-2 max-h-24 overflow-auto whitespace-pre-wrap break-all ${
              installResult.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {installResult.output}
            </div>
          )}
          <p className="text-[10px] text-gray-400 leading-relaxed">
            需要 tlmgr（TeX Live 包管理器）。macOS 下可能需要管理员权限，如安装失败请在终端执行 <code className="bg-gray-100 px-1 rounded">sudo tlmgr install 包名</code>
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Symbol Palette ───────────────────────────────────────────────────────────

interface SymbolItem {
  label: string;   // display name
  code: string;    // LaTeX code
  category: string;
}

const BUILTIN_SYMBOLS: SymbolItem[] = [
  // 希腊字母
  { label: 'α', code: '\\alpha', category: '希腊字母' },
  { label: 'β', code: '\\beta', category: '希腊字母' },
  { label: 'γ', code: '\\gamma', category: '希腊字母' },
  { label: 'δ', code: '\\delta', category: '希腊字母' },
  { label: 'ε', code: '\\epsilon', category: '希腊字母' },
  { label: 'ζ', code: '\\zeta', category: '希腊字母' },
  { label: 'η', code: '\\eta', category: '希腊字母' },
  { label: 'θ', code: '\\theta', category: '希腊字母' },
  { label: 'λ', code: '\\lambda', category: '希腊字母' },
  { label: 'μ', code: '\\mu', category: '希腊字母' },
  { label: 'π', code: '\\pi', category: '希腊字母' },
  { label: 'σ', code: '\\sigma', category: '希腊字母' },
  { label: 'φ', code: '\\phi', category: '希腊字母' },
  { label: 'ω', code: '\\omega', category: '希腊字母' },
  { label: 'Γ', code: '\\Gamma', category: '希腊字母' },
  { label: 'Δ', code: '\\Delta', category: '希腊字母' },
  { label: 'Θ', code: '\\Theta', category: '希腊字母' },
  { label: 'Λ', code: '\\Lambda', category: '希腊字母' },
  { label: 'Σ', code: '\\Sigma', category: '希腊字母' },
  { label: 'Φ', code: '\\Phi', category: '希腊字母' },
  { label: 'Ω', code: '\\Omega', category: '希腊字母' },
  // 运算符
  { label: '±', code: '\\pm', category: '运算符' },
  { label: '∓', code: '\\mp', category: '运算符' },
  { label: '×', code: '\\times', category: '运算符' },
  { label: '÷', code: '\\div', category: '运算符' },
  { label: '·', code: '\\cdot', category: '运算符' },
  { label: '∘', code: '\\circ', category: '运算符' },
  { label: '⊕', code: '\\oplus', category: '运算符' },
  { label: '⊗', code: '\\otimes', category: '运算符' },
  // 关系符
  { label: '≤', code: '\\leq', category: '关系符' },
  { label: '≥', code: '\\geq', category: '关系符' },
  { label: '≠', code: '\\neq', category: '关系符' },
  { label: '≈', code: '\\approx', category: '关系符' },
  { label: '≡', code: '\\equiv', category: '关系符' },
  { label: '∼', code: '\\sim', category: '关系符' },
  { label: '≪', code: '\\ll', category: '关系符' },
  { label: '≫', code: '\\gg', category: '关系符' },
  { label: '⊂', code: '\\subset', category: '关系符' },
  { label: '⊃', code: '\\supset', category: '关系符' },
  { label: '∈', code: '\\in', category: '关系符' },
  { label: '∉', code: '\\notin', category: '关系符' },
  { label: '⊆', code: '\\subseteq', category: '关系符' },
  { label: '⊇', code: '\\supseteq', category: '关系符' },
  // 箭头
  { label: '←', code: '\\leftarrow', category: '箭头' },
  { label: '→', code: '\\rightarrow', category: '箭头' },
  { label: '↔', code: '\\leftrightarrow', category: '箭头' },
  { label: '⇐', code: '\\Leftarrow', category: '箭头' },
  { label: '⇒', code: '\\Rightarrow', category: '箭头' },
  { label: '⇔', code: '\\Leftrightarrow', category: '箭头' },
  { label: '↦', code: '\\mapsto', category: '箭头' },
  { label: '↑', code: '\\uparrow', category: '箭头' },
  { label: '↓', code: '\\downarrow', category: '箭头' },
  // 大型运算
  { label: '∑', code: '\\sum', category: '大型运算' },
  { label: '∏', code: '\\prod', category: '大型运算' },
  { label: '∫', code: '\\int', category: '大型运算' },
  { label: '∬', code: '\\iint', category: '大型运算' },
  { label: '∮', code: '\\oint', category: '大型运算' },
  { label: '⋃', code: '\\bigcup', category: '大型运算' },
  { label: '⋂', code: '\\bigcap', category: '大型运算' },
  { label: 'lim', code: '\\lim', category: '大型运算' },
  { label: 'sup', code: '\\sup', category: '大型运算' },
  { label: 'inf', code: '\\inf', category: '大型运算' },
  // 其他
  { label: '∞', code: '\\infty', category: '其他常用' },
  { label: '∂', code: '\\partial', category: '其他常用' },
  { label: '∇', code: '\\nabla', category: '其他常用' },
  { label: '∅', code: '\\emptyset', category: '其他常用' },
  { label: '∀', code: '\\forall', category: '其他常用' },
  { label: '∃', code: '\\exists', category: '其他常用' },
  { label: '¬', code: '\\neg', category: '其他常用' },
  { label: '∧', code: '\\wedge', category: '其他常用' },
  { label: '∨', code: '\\vee', category: '其他常用' },
  { label: '…', code: '\\dots', category: '其他常用' },
  { label: '⋯', code: '\\cdots', category: '其他常用' },
  { label: '⋮', code: '\\vdots', category: '其他常用' },
  { label: '√', code: '\\sqrt{}', category: '其他常用' },
  { label: 'x/y', code: '\\frac{}{}', category: '其他常用' },
  { label: 'x²', code: '^{}', category: '其他常用' },
  { label: 'xₙ', code: '_{}', category: '其他常用' },
  { label: '()', code: '\\left( \\right)', category: '其他常用' },
  { label: '[]', code: '\\left[ \\right]', category: '其他常用' },
  { label: '{}', code: '\\left\\{ \\right\\}', category: '其他常用' },
  { label: '||', code: '\\left| \\right|', category: '其他常用' },
  { label: '‖‖', code: '\\left\\| \\right\\|', category: '其他常用' },
  // 数学环境
  { label: 'matrix', code: '\\begin{matrix}  \\\\  \\end{matrix}', category: '环境片段' },
  { label: 'pmatrix', code: '\\begin{pmatrix}  \\\\  \\end{pmatrix}', category: '环境片段' },
  { label: 'bmatrix', code: '\\begin{bmatrix}  \\\\  \\end{bmatrix}', category: '环境片段' },
  { label: 'cases', code: '\\begin{cases}  \\\\  \\end{cases}', category: '环境片段' },
  { label: 'align', code: '\\begin{align}\n  & = \\\\\n  & = \n\\end{align}', category: '环境片段' },
];

const CUSTOM_SYMBOLS_KEY = 'latex-custom-symbols';

interface SymbolPalettePanelProps {
  onClose: () => void;
}

const SymbolPalettePanel: React.FC<SymbolPalettePanelProps> = ({ onClose }) => {
  const [customSymbols, setCustomSymbols] = useState<SymbolItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newCode, setNewCode] = useState('');

  // Load custom symbols
  useEffect(() => {
    window.electronAPI?.loadAppData?.(CUSTOM_SYMBOLS_KEY).then((data: any) => {
      if (Array.isArray(data)) setCustomSymbols(data);
    }).catch(() => {});
  }, []);

  const saveCustomSymbols = async (syms: SymbolItem[]) => {
    setCustomSymbols(syms);
    await window.electronAPI?.saveAppData?.(CUSTOM_SYMBOLS_KEY, syms).catch(() => {});
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const handleAdd = () => {
    if (!newLabel.trim() || !newCode.trim()) return;
    const item: SymbolItem = { label: newLabel.trim(), code: newCode.trim(), category: '自定义' };
    saveCustomSymbols([...customSymbols, item]);
    setNewLabel('');
    setNewCode('');
    setShowAddForm(false);
  };

  const handleDelete = (index: number) => {
    saveCustomSymbols(customSymbols.filter((_, i) => i !== index));
  };

  const allSymbols = [...BUILTIN_SYMBOLS, ...customSymbols.map(s => ({ ...s, category: '自定义' }))];
  const filtered = allSymbols.filter(s =>
    s.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.category.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const grouped = filtered.reduce<Record<string, SymbolItem[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-12">
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <Omega className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">符号面板</span>
            <span className="text-xs text-gray-400">点击符号复制代码</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-3 h-3" /> 自定义
            </button>
            <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="px-5 py-3 border-b border-gray-100 shrink-0 flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-gray-500 mb-1">显示名称</label>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="如：∇²"
                className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex-[2]">
              <label className="block text-[10px] text-gray-500 mb-1">LaTeX 代码</label>
              <input
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                placeholder="如：\\nabla^2"
                className="w-full bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={!newLabel.trim() || !newCode.trim()}
              className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
            >
              添加
            </button>
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索符号或代码..."
              className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Symbols grid */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {Object.entries(grouped).map(([category, syms]) => (
            <div key={category} className="mb-4">
              <div className="text-xs font-semibold text-gray-500 mb-2 sticky top-0 bg-white py-1">{category}</div>
              <div className="flex flex-wrap gap-1.5">
                {syms.map((sym, i) => {
                  const isCustom = category === '自定义';
                  const customIndex = isCustom ? customSymbols.findIndex(c => c.label === sym.label && c.code === sym.code) : -1;
                  const isCopied = copiedCode === sym.code;
                  return (
                    <div key={`${sym.code}-${i}`} className="group relative">
                      <button
                        onClick={() => handleCopy(sym.code)}
                        className={`flex flex-col items-center justify-center w-16 h-14 rounded-lg border transition-all ${
                          isCopied
                            ? 'border-green-400 bg-green-50'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                        title={sym.code}
                      >
                        <span className="text-base leading-none mb-0.5">{sym.label}</span>
                        {isCopied ? (
                          <span className="text-[9px] text-green-600 flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />已复制</span>
                        ) : (
                          <span className="text-[9px] text-gray-400 font-mono truncate max-w-[56px]">{sym.code}</span>
                        )}
                      </button>
                      {isCustom && customIndex >= 0 && (
                        <button
                          onClick={() => handleDelete(customIndex)}
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title="删除"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">未找到匹配的符号</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Image to LaTeX Panel ─────────────────────────────────────────────────────

const OCR_SETTINGS_KEY = 'latex-ocr-settings';

type OcrProvider = 'zenmux' | 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'custom' | 'deepseek' | 'zhipu' | 'moonshot' | 'minimax';

interface OcrSettings {
  provider: OcrProvider;
  apiKey: string;
  apiUrl: string;
  model: string;
}

const OCR_PROVIDER_DEFAULTS: Record<OcrProvider, { url: string; model: string; label: string }> = {
  zenmux:    { url: 'https://zenmux.ai/api/v1',              model: 'openai/gpt-4o',     label: 'Zenmux' },
  gemini:    { url: '',                                       model: 'gemini-2.5-flash',  label: 'Gemini' },
  openai:    { url: 'https://api.openai.com/v1',              model: 'gpt-4o',            label: 'OpenAI' },
  anthropic: { url: 'https://api.anthropic.com/v1',           model: 'claude-sonnet-4-6', label: 'Anthropic' },
  deepseek:  { url: 'https://api.deepseek.com/v1',            model: 'deepseek-chat',     label: 'DeepSeek' },
  zhipu:     { url: 'https://open.bigmodel.cn/api/paas/v4',   model: 'glm-4-plus',        label: '智谱 AI' },
  moonshot:  { url: 'https://api.moonshot.cn/v1',              model: 'kimi-k2.5',         label: 'Moonshot' },
  minimax:   { url: 'https://api.minimax.chat/v1',             model: 'MiniMax-M2.5',      label: 'MiniMax' },
  ollama:    { url: 'http://localhost:11434/v1',               model: 'llava',             label: 'Ollama' },
  custom:    { url: '',                                        model: '',                  label: '自定义' },
};

const DEFAULT_OCR_SETTINGS: OcrSettings = {
  provider: 'zenmux',
  apiKey: '',
  apiUrl: OCR_PROVIDER_DEFAULTS.zenmux.url,
  model: OCR_PROVIDER_DEFAULTS.zenmux.model,
};

interface ImageToLatexPanelProps {
  onClose: () => void;
}

const ImageToLatexPanel: React.FC<ImageToLatexPanelProps> = ({ onClose }) => {
  const [ocrSettings, setOcrSettings] = useState<OcrSettings>(DEFAULT_OCR_SETTINGS);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [resultLatex, setResultLatex] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings
  useEffect(() => {
    window.electronAPI?.loadAppData?.(OCR_SETTINGS_KEY).then((data: any) => {
      if (data && data.apiKey) setOcrSettings({ ...DEFAULT_OCR_SETTINGS, ...data, provider: data.provider || 'openai' });
      else setShowSettings(true); // First time: show settings
    }).catch(() => setShowSettings(true));
  }, []);

  const saveSettings = async (s: OcrSettings) => {
    setOcrSettings(s);
    await window.electronAPI?.saveAppData?.(OCR_SETTINGS_KEY, s).catch(() => {});
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Part = result.split(',')[1];
      if (base64Part) setImageBase64(base64Part);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleSelectImage = async () => {
    // Use file input for image, more reliable cross-platform
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:image/png;base64,xxxxx"
      const base64Part = result.split(',')[1];
      if (base64Part) setImageBase64(base64Part);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset
  };

  const OCR_PROMPT = '请识别图片中的数学公式，只返回 LaTeX 代码，不要任何解释文字。如果有多个公式，每个公式单独一行。不要用 ``` 包裹。';

  const recognizeViaGemini = async (base64: string, settings: OcrSettings): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const response = await ai.models.generateContent({
      model: settings.model,
      contents: [{
        role: 'user',
        parts: [
          { text: OCR_PROMPT },
          { inlineData: { mimeType: 'image/png', data: base64 } },
        ],
      }],
    });
    return response.text?.trim() || '';
  };

  const recognizeViaOpenAICompat = async (base64: string, settings: OcrSettings): Promise<string> => {
    const baseUrl = settings.apiUrl.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.provider === 'anthropic') {
      headers['x-api-key'] = settings.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: settings.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
          ],
        }],
        max_tokens: 2048,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`API 请求失败 (${resp.status}): ${errBody.slice(0, 200)}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  };

  const handleRecognize = async () => {
    if (!imageBase64 || !ocrSettings.apiKey) return;
    setLoading(true);
    setError('');
    setResultLatex('');

    try {
      let content: string;
      if (ocrSettings.provider === 'gemini') {
        content = await recognizeViaGemini(imageBase64, ocrSettings);
      } else {
        content = await recognizeViaOpenAICompat(imageBase64, ocrSettings);
      }
      if (!content) throw new Error('API 返回空结果');
      setResultLatex(content);
    } catch (e: any) {
      setError(e?.message || '识别失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(resultLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-12">
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">图片识别公式</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(v => !v)}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="API 设置"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* API Settings */}
        {showSettings && (
          <div className="px-5 py-3 border-b border-gray-100 shrink-0 space-y-2">
            <div className="text-xs font-medium text-gray-600">API 设置</div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">服务商</label>
              <select
                value={ocrSettings.provider}
                onChange={e => {
                  const p = e.target.value as OcrProvider;
                  const d = OCR_PROVIDER_DEFAULTS[p];
                  saveSettings({ ...ocrSettings, provider: p, apiUrl: d.url, model: d.model });
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              >
                {Object.entries(OCR_PROVIDER_DEFAULTS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={ocrSettings.apiKey}
                onChange={e => saveSettings({ ...ocrSettings, apiKey: e.target.value })}
                placeholder={ocrSettings.provider === 'gemini' ? 'AIza...' : 'sk-...'}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              />
            </div>
            {ocrSettings.provider !== 'gemini' && (
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">API URL</label>
                <input
                  type="text"
                  value={ocrSettings.apiUrl}
                  onChange={e => saveSettings({ ...ocrSettings, apiUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                />
              </div>
            )}
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">模型</label>
              <input
                type="text"
                value={ocrSettings.model}
                onChange={e => saveSettings({ ...ocrSettings, model: e.target.value })}
                placeholder={OCR_PROVIDER_DEFAULTS[ocrSettings.provider].model}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              />
            </div>
            <p className="text-[10px] text-gray-400">
              支持所有具备图片识别能力的大模型。切换服务商会自动填入默认端点和模型，也可手动修改。
            </p>
          </div>
        )}

        {/* Image upload area */}
        <div className="px-5 py-4 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {imageBase64 ? (
            <div className="relative">
              <img
                src={`data:image/png;base64,${imageBase64}`}
                alt="uploaded"
                className="max-h-48 mx-auto rounded-lg border border-gray-200 object-contain"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400 truncate">{imageName}</span>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectImage}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    更换图片
                  </button>
                  <button
                    onClick={handleRecognize}
                    disabled={loading || !ocrSettings.apiKey}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {loading ? '识别中...' : '识别公式'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={handleSelectImage}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 transition-colors ${
                dragOver
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
              }`}
            >
              <Image className={`w-8 h-8 ${dragOver ? 'text-blue-400' : 'text-gray-300'}`} />
              <span className="text-xs text-gray-400">点击或拖拽图片到此处</span>
              <span className="text-[10px] text-gray-300">支持 PNG / JPG / WEBP</span>
            </button>
          )}
          {!ocrSettings.apiKey && (
            <p className="text-[10px] text-amber-600 mt-2">请先点击右上角齿轮配置 API Key</p>
          )}
        </div>

        {/* Result */}
        {(resultLatex || error) && (
          <div className="px-5 pb-4 shrink-0">
            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{error}</div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-xs font-medium text-gray-600">识别结果</span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
                <pre className="px-3 py-2 text-xs font-mono text-gray-700 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                  {resultLatex}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Editor ──────────────────────────────────────────────────────────────

interface LatexEditorProps {
  /** Called by LatexSidebar to edit a template (save will update the template) */
  onEditTemplateRef?: React.MutableRefObject<((template: { id: string; name: string; content: string; category: string; createdAt: number; updatedAt: number; description?: string }) => void) | null>;
  /** Called by LatexSidebar to create a new file from template content */
  onLoadTemplateAsFileRef?: React.MutableRefObject<((content: string) => void) | null>;
  /** Called by LatexSidebar to open a managed file (content + path) */
  onOpenFileRef?: React.MutableRefObject<((file: { path: string; content: string }) => void) | null>;
}

export const LatexEditor: React.FC<LatexEditorProps> = ({ onEditTemplateRef, onLoadTemplateAsFileRef, onOpenFileRef }) => {
  const [content, setContent] = useState('');
  const [engine, setEngine] = useState<Engine>('xelatex');
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<LatexCompileResult | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [env, setEnv] = useState<LatexEnvironment | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showEngineMenu, setShowEngineMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPackages, setShowPackages] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);
  const [showImageOcr, setShowImageOcr] = useState(false);
  // Template editing state: when non-null, Save will update the template
  const [editingTemplate, setEditingTemplate] = useState<{ id: string; name: string; category: string; createdAt: number; description?: string } | null>(null);
  // New file dialog
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  // Pending template content for "load as new file"
  const [pendingTemplateContent, setPendingTemplateContent] = useState<string | null>(null);
  const engineMenuRef = useRef<HTMLDivElement>(null);
  const jobIdRef = useRef(0);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  // Check environment on mount
  const checkEnv = useCallback(() => {
    if (window.electronAPI?.latexCheckEnv) {
      window.electronAPI
        .latexCheckEnv()
        .then(result => {
          setEnv(result);
          // Auto-select best available engine
          if (result.xelatex) setEngine('xelatex');
          else if (result.pdflatex) setEngine('pdflatex');
          else if (result.lualatex) setEngine('lualatex');
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    checkEnv();
  }, [checkEnv]);

  // Close engine menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        engineMenuRef.current &&
        !engineMenuRef.current.contains(e.target as Node)
      ) {
        setShowEngineMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCompile = useCallback(async () => {
    if (!window.electronAPI?.latexCompile) return;
    if (compiling) return;

    setCompiling(true);
    setLogOpen(true);
    const jobId = `job-${++jobIdRef.current}-${Date.now()}`;

    try {
      const result = await window.electronAPI.latexCompile({
        content,
        engine,
        jobId,
      });
      setCompileResult(result);

      if (
        result.success &&
        result.pdfPath &&
        window.electronAPI.latexReadPdf
      ) {
        const b64 = await window.electronAPI.latexReadPdf(result.pdfPath);
        setPdfBase64(b64);
      }
    } catch (e: any) {
      console.error('Compile error', e);
      setCompileResult({
        success: false,
        errors: [
          {
            type: 'error',
            message: e?.message || '编译过程中发生未知错误',
          },
        ],
        warnings: [],
        rawLog: '',
        duration: 0,
      });
    } finally {
      setCompiling(false);
    }
  }, [content, engine, compiling]);

  const handleNewFile = useCallback(async (name: string, templateContent?: string) => {
    if (!name.trim()) return;
    if (isDirty && !window.confirm('有未保存的修改，确定要新建文档吗？')) return;
    const base = templateContent || DEFAULT_TEX;
    const result = await window.electronAPI?.latexNewManagedFile?.(name).catch(() => null);
    if (result) {
      // Save template content to the new file
      await window.electronAPI?.latexSaveManagedFile?.({ filePath: result.path, content: base }).catch(() => {});
      setContent(base);
      setFilePath(result.path);
      setEditingTemplate(null);
      setIsDirty(false);
      setCompileResult(null);
      setPdfBase64(null);
    }
  }, [isDirty]);

  const handleShowNewFileDialog = useCallback((templateContent?: string) => {
    if (isDirty && !window.confirm('有未保存的修改，确定要新建文档吗？')) return;
    setPendingTemplateContent(templateContent ?? null);
    setNewFileName('');
    setShowNewFileDialog(true);
    setTimeout(() => newFileInputRef.current?.focus(), 50);
  }, [isDirty]);

  const handleConfirmNewFile = useCallback(() => {
    if (!newFileName.trim()) return;
    handleNewFile(newFileName.trim(), pendingTemplateContent ?? undefined);
    setShowNewFileDialog(false);
    setPendingTemplateContent(null);
    setNewFileName('');
  }, [newFileName, pendingTemplateContent, handleNewFile]);

  const handleOpen = useCallback(async () => {
    if (!window.electronAPI?.latexOpenFile) return;
    if (
      isDirty &&
      !window.confirm('有未保存的修改，确定要打开新文件吗？')
    )
      return;
    const result = await window.electronAPI.latexOpenFile();
    if (result) {
      setContent(result.content);
      setFilePath(result.path);
      setEditingTemplate(null);
      setIsDirty(false);
      setCompileResult(null);
      setPdfBase64(null);
    }
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return;
    // Template editing mode: save content back to template
    if (editingTemplate) {
      await window.electronAPI.latexSaveTemplate?.({
        id: editingTemplate.id,
        name: editingTemplate.name,
        description: editingTemplate.description,
        content,
        category: editingTemplate.category,
        createdAt: editingTemplate.createdAt,
        updatedAt: Date.now(),
      }).catch(() => {});
      setIsDirty(false);
      return;
    }
    // File mode
    if (filePath) {
      // Check if it's a managed file (in the app's latex/files dir)
      if (window.electronAPI.latexSaveManagedFile && filePath.includes('/latex/files/')) {
        await window.electronAPI.latexSaveManagedFile({ filePath, content });
      } else if (window.electronAPI.latexSaveFile) {
        await window.electronAPI.latexSaveFile({ filePath, content });
      }
      setIsDirty(false);
    } else if (window.electronAPI.latexSaveFileAs) {
      const savedPath = await window.electronAPI.latexSaveFileAs(content);
      if (savedPath) {
        setFilePath(savedPath);
        setIsDirty(false);
      }
    }
  }, [filePath, content, editingTemplate]);

  const handleDownloadPdf = useCallback(() => {
    if (!pdfBase64) return;
    const binary = atob(pdfBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = filePath
      ? (filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'document')
          .replace(/\.tex$/i, '')
      : editingTemplate?.name ?? 'document';
    a.download = `${baseName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pdfBase64, filePath, editingTemplate]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    setContent(value ?? '');
    setIsDirty(true);
  }, []);

  // Edit template — load content into editor, save will update the template
  const handleEditTemplate = useCallback(
    (template: { id: string; name: string; content: string; category: string; createdAt: number; updatedAt: number; description?: string }) => {
      if (isDirty && !window.confirm('有未保存的修改，确定要编辑模板吗？')) return;
      setContent(template.content);
      setFilePath(null);
      setEditingTemplate({
        id: template.id,
        name: template.name,
        category: template.category,
        createdAt: template.createdAt,
        description: template.description,
      });
      setIsDirty(false);
      setCompileResult(null);
      setPdfBase64(null);
    },
    [isDirty]
  );

  // Load template as new file — show filename dialog then create managed file
  const handleLoadTemplateAsFile = useCallback(
    (templateContent: string) => {
      if (isDirty && !window.confirm('有未保存的修改，确定要新建文件吗？')) return;
      handleShowNewFileDialog(templateContent);
    },
    [isDirty, handleShowNewFileDialog]
  );

  // Open managed file — expose via ref so LatexSidebar (via App.tsx) can call it
  const handleOpenManagedFile = useCallback(
    (file: { path: string; content: string }) => {
      if (isDirty && !window.confirm('有未保存的修改，确定要打开此文件吗？')) return;
      setContent(file.content);
      setFilePath(file.path);
      setEditingTemplate(null);
      setIsDirty(false);
      setCompileResult(null);
      setPdfBase64(null);
    },
    [isDirty]
  );

  // Register edit-template handler in ref
  useEffect(() => {
    if (onEditTemplateRef) {
      onEditTemplateRef.current = handleEditTemplate;
    }
    return () => {
      if (onEditTemplateRef) onEditTemplateRef.current = null;
    };
  }, [handleEditTemplate, onEditTemplateRef]);

  // Register load-template-as-file handler in ref
  useEffect(() => {
    if (onLoadTemplateAsFileRef) {
      onLoadTemplateAsFileRef.current = handleLoadTemplateAsFile;
    }
    return () => {
      if (onLoadTemplateAsFileRef) onLoadTemplateAsFileRef.current = null;
    };
  }, [handleLoadTemplateAsFile, onLoadTemplateAsFileRef]);

  // Register open-file handler in ref
  useEffect(() => {
    if (onOpenFileRef) {
      onOpenFileRef.current = handleOpenManagedFile;
    }
    return () => {
      if (onOpenFileRef) onOpenFileRef.current = null;
    };
  }, [handleOpenManagedFile, onOpenFileRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleCompile]);

  const fileName = editingTemplate
    ? `📝 模板: ${editingTemplate.name}`
    : filePath
      ? filePath.split('/').pop() ??
        filePath.split('\\').pop() ??
        'document.tex'
      : '';

  // Whether the editor has a document open (not in empty state)
  const hasDocument = content.length > 0 || filePath !== null || editingTemplate !== null;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* ── Toolbar ── */}
      <div
        className="h-12 flex items-center gap-1.5 px-3 bg-white border-b border-gray-200 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* File ops */}
          <button
            onClick={handleOpen}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="打开外部 .tex 文件"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={!hasDocument}
            className={`p-1.5 rounded transition-colors ${isDirty ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'} disabled:opacity-30 disabled:cursor-not-allowed`}
            title={editingTemplate ? '保存模板 (Cmd+S)' : '保存 (Cmd+S)'}
          >
            <Save className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* Engine selector */}
          <div className="relative" ref={engineMenuRef}>
            <button
              onClick={() => setShowEngineMenu(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {engine}
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {showEngineMenu && (
              <div className="absolute top-9 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                {ENGINES.map(e => {
                  const available = env ? !!env[e] : null;
                  return (
                    <button
                      key={e}
                      onClick={() => {
                        setEngine(e);
                        setShowEngineMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                        e === engine
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span>{e}</span>
                      {available === true && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="已安装" />
                      )}
                      {available === false && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="未安装" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* Compile button */}
          <button
            onClick={handleCompile}
            disabled={compiling}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow"
            title="编译 (Cmd+Enter)"
          >
            {compiling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {compiling ? '编译中...' : '编译'}
          </button>
        </div>

        {/* File name center */}
        <div
          className="flex-1 flex items-center justify-center min-w-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className="text-xs text-gray-400 truncate max-w-xs">
            {fileName}
            {isDirty ? (
              <span className="ml-1 text-amber-500">●</span>
            ) : null}
          </span>
        </div>

        {/* Compile status + Settings button */}
        <div
          className="shrink-0 flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {compileResult &&
            (compileResult.success ? (
              <span title="编译成功"><CheckCircle2 className="w-4 h-4 text-green-500" /></span>
            ) : (
              <span title="编译失败"><AlertCircle className="w-4 h-4 text-red-500" /></span>
            ))}
          <button
            onClick={() => setShowSymbols(true)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="符号面板"
          >
            <Omega className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowImageOcr(true)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="图片识别公式"
          >
            <Image className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowPackages(true)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="宏包速查"
          >
            <Package className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="编译器设置"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Env Banner ── */}
      <EnvBanner env={env} engine={engine} />

      {/* ── Split Pane ── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Settings overlay */}
        {showSettings && (
          <LatexSettingsPanel
            onClose={() => {
              setShowSettings(false);
              checkEnv(); // re-check env after settings change
            }}
            env={env}
          />
        )}

        {/* Package list overlay */}
        {showPackages && (
          <PackageListPanel onClose={() => setShowPackages(false)} />
        )}

        {/* Symbol palette overlay */}
        {showSymbols && (
          <SymbolPalettePanel onClose={() => setShowSymbols(false)} />
        )}

        {/* Image to LaTeX OCR overlay */}
        {showImageOcr && (
          <ImageToLatexPanel onClose={() => setShowImageOcr(false)} />
        )}

        {/* Left: Monaco Editor or Empty State */}
        <div className="flex-1 flex flex-col border-r border-gray-200 min-w-0">
          {hasDocument ? (
            <Editor
              height="100%"
              defaultLanguage="latex"
              language="latex"
              value={content}
              onChange={handleEditorChange}
              theme="vs"
              options={{
                fontSize: 13,
                lineHeight: 22,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                folding: true,
                renderLineHighlight: 'line',
                tabSize: 2,
                padding: { top: 12, bottom: 12 },
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
                smoothScrolling: true,
                cursorBlinking: 'smooth',
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-300">
              <button
                onClick={() => handleShowNewFileDialog()}
                className="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 flex items-center justify-center transition-colors group"
                title="新建 .tex 文件"
              >
                <Plus className="w-8 h-8 text-gray-300 group-hover:text-blue-400 transition-colors" />
              </button>
              <p className="text-sm text-gray-400">新建文件开始编辑</p>
              <p className="text-xs text-gray-300">或从左侧模板/文件列表打开</p>
            </div>
          )}
        </div>

        {/* Right: PDF Viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          <PdfViewer pdfBase64={pdfBase64} loading={compiling} onDownload={handleDownloadPdf} />
        </div>
      </div>

      {/* ── New File Dialog ── */}
      {showNewFileDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) { setShowNewFileDialog(false); setPendingTemplateContent(null); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-80 p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">
              {pendingTemplateContent ? '从模板新建文件' : '新建文件'}
            </h3>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">文件名称</label>
              <input
                ref={newFileInputRef}
                autoFocus
                type="text"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                placeholder="例如: my-paper"
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleConfirmNewFile(); }
                  if (e.key === 'Escape') { setShowNewFileDialog(false); setPendingTemplateContent(null); }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <p className="text-[10px] text-gray-400 mt-1">将自动添加 .tex 后缀</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowNewFileDialog(false); setPendingTemplateContent(null); }}
                className="flex-1 py-2 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmNewFile}
                disabled={!newFileName.trim()}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log Panel ── */}
      <LogPanel
        result={compileResult}
        isOpen={logOpen}
        onToggle={() => setLogOpen(v => !v)}
      />
    </div>
  );
};
