import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play, ChevronDown, ChevronUp, FilePlus, FolderOpen, Save, SaveAll,
  AlertCircle, AlertTriangle, Info, Loader2, FileType2, CheckCircle2,
  ZoomIn, ZoomOut, Settings2, X, FolderSearch
} from 'lucide-react';
import { LatexCompileResult, LatexEnvironment, LatexLogEntry, LatexSettings } from '../types';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const ENGINES = ['xelatex', 'pdflatex', 'lualatex'] as const;
type Engine = typeof ENGINES[number];

const DEFAULT_TEX = `\\documentclass[12pt, a4paper]{ctexart}

\\usepackage{amsmath}
\\usepackage{geometry}
\\geometry{margin=2.5cm}

\\title{标题}
\\author{作者}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{简介}
这是一份用 \\XeLaTeX{} 编译的中文示例文档。

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
}

const PdfViewer: React.FC<PdfViewerProps> = ({ pdfBase64, loading }) => {
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
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
      canvas.style.borderRadius = '2px';
      canvas.style.background = '#fff';
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);

      const ctx = canvas.getContext('2d')!;
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
        {numPages > 0 && (
          <span className="text-xs text-gray-400">{numPages} 页</span>
        )}
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
}

const LatexSettingsPanel: React.FC<LatexSettingsPanelProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<LatexSettings>({
    xelatexPath: '',
    pdflatexPath: '',
    lualatexPath: '',
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
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/30 pt-20">
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg mx-4">
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
        <div className="px-5 py-4 space-y-4">
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

// ─── Main Editor ──────────────────────────────────────────────────────────────

interface LatexEditorProps {
  /** Called by LatexSidebar to inject template content */
  onLoadTemplateRef?: React.MutableRefObject<((content: string) => void) | null>;
  /** Called by LatexSidebar to open a managed file (content + path) */
  onOpenFileRef?: React.MutableRefObject<((file: { path: string; content: string }) => void) | null>;
}

export const LatexEditor: React.FC<LatexEditorProps> = ({ onLoadTemplateRef, onOpenFileRef }) => {
  const [content, setContent] = useState(DEFAULT_TEX);
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
  const engineMenuRef = useRef<HTMLDivElement>(null);
  const jobIdRef = useRef(0);

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

  const handleNew = useCallback(() => {
    if (
      isDirty &&
      !window.confirm('有未保存的修改，确定要新建文档吗？')
    )
      return;
    setContent(DEFAULT_TEX);
    setFilePath(null);
    setIsDirty(false);
    setCompileResult(null);
    setPdfBase64(null);
  }, [isDirty]);

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
      setIsDirty(false);
      setCompileResult(null);
      setPdfBase64(null);
    }
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI) return;
    if (filePath && window.electronAPI.latexSaveFile) {
      await window.electronAPI.latexSaveFile({ filePath, content });
      setIsDirty(false);
    } else if (window.electronAPI.latexSaveFileAs) {
      const savedPath = await window.electronAPI.latexSaveFileAs(content);
      if (savedPath) {
        setFilePath(savedPath);
        setIsDirty(false);
      }
    }
  }, [filePath, content]);

  const handleSaveAs = useCallback(async () => {
    if (!window.electronAPI?.latexSaveFileAs) return;
    const savedPath = await window.electronAPI.latexSaveFileAs(content);
    if (savedPath) {
      setFilePath(savedPath);
      setIsDirty(false);
    }
  }, [content]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    setContent(value ?? '');
    setIsDirty(true);
  }, []);

  // Load template — expose via ref so LatexSidebar (via App.tsx) can call it
  const handleLoadTemplate = useCallback(
    (templateContent: string) => {
      if (
        isDirty &&
        !window.confirm('有未保存的修改，确定要加载模板吗？')
      )
        return;
      setContent(templateContent);
      setFilePath(null);
      setIsDirty(false);
      setCompileResult(null);
      setPdfBase64(null);
    },
    [isDirty]
  );

  // Open managed file — expose via ref so LatexSidebar (via App.tsx) can call it
  const handleOpenManagedFile = useCallback(
    (file: { path: string; content: string }) => {
      if (
        isDirty &&
        !window.confirm('有未保存的修改，确定要打开此文件吗？')
      )
        return;
      setContent(file.content);
      setFilePath(file.path);
      setIsDirty(false);
      setCompileResult(null);
      setPdfBase64(null);
    },
    [isDirty]
  );

  // Register load-template handler in ref so parent (App.tsx) can forward calls from sidebar
  useEffect(() => {
    if (onLoadTemplateRef) {
      onLoadTemplateRef.current = handleLoadTemplate;
    }
    return () => {
      if (onLoadTemplateRef) {
        onLoadTemplateRef.current = null;
      }
    };
  }, [handleLoadTemplate, onLoadTemplateRef]);

  // Register open-file handler in ref
  useEffect(() => {
    if (onOpenFileRef) {
      onOpenFileRef.current = handleOpenManagedFile;
    }
    return () => {
      if (onOpenFileRef) {
        onOpenFileRef.current = null;
      }
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

  const fileName = filePath
    ? filePath.split('/').pop() ??
      filePath.split('\\').pop() ??
      'document.tex'
    : '未命名.tex';

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
            onClick={handleNew}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="新建"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpen}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="打开 .tex 文件"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="保存 (Cmd+S)"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            onClick={handleSaveAs}
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="另存为"
          >
            <SaveAll className="w-4 h-4" />
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
          />
        )}

        {/* Left: Monaco Editor */}
        <div className="flex-1 flex flex-col border-r border-gray-200 min-w-0">
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
        </div>

        {/* Right: PDF Viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          <PdfViewer pdfBase64={pdfBase64} loading={compiling} />
        </div>
      </div>

      {/* ── Log Panel ── */}
      <LogPanel
        result={compileResult}
        isOpen={logOpen}
        onToggle={() => setLogOpen(v => !v)}
      />
    </div>
  );
};
