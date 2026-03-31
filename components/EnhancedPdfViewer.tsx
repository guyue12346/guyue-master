import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { ZoomIn, ZoomOut, Download, AlertCircle, Loader2 } from 'lucide-react';
import 'pdfjs-dist/build/pdf.worker.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface EnhancedPdfViewerProps {
  filePath: string;
  onDownload?: () => void;
}

interface PdfPosition {
  scale: number;
  scrollTop: number;
  scrollLeft: number;
  currentPage?: number;
  timestamp: number;
}

/**
 * 生成PDF位置存储的键
 * 使用文件路径的哈希来避免特殊字符问题
 */
const getPdfPositionKey = (filePath: string): string => {
  // 简单的哈希实现
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    const char = filePath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `pdf_position_${Math.abs(hash)}`;
};

/**
 * 保存PDF阅读位置
 */
const savePdfPosition = (filePath: string, position: PdfPosition): void => {
  try {
    const key = getPdfPositionKey(filePath);
    localStorage.setItem(key, JSON.stringify(position));
  } catch (error) {
    console.warn('Failed to save PDF position:', error);
  }
};

/**
 * 恢复PDF阅读位置
 */
const loadPdfPosition = (filePath: string, maxLifetime: number = 30 * 24 * 60 * 60 * 1000): PdfPosition | null => {
  try {
    const key = getPdfPositionKey(filePath);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const position: PdfPosition = JSON.parse(stored);
    const now = Date.now();
    
    // 如果超过最大保留时间（默认30天），删除记录
    if (now - position.timestamp > maxLifetime) {
      localStorage.removeItem(key);
      return null;
    }

    return position;
  } catch (error) {
    console.warn('Failed to load PDF position:', error);
    return null;
  }
};

/**
 * 清除PDF阅读位置记录
 */
const clearPdfPosition = (filePath: string): void => {
  try {
    const key = getPdfPositionKey(filePath);
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to clear PDF position:', error);
  }
};

export const EnhancedPdfViewer: React.FC<EnhancedPdfViewerProps> = ({ 
  filePath, 
  onDownload 
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.2);
  const [numPages, setNumPages] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  const savedPositionRef = useRef<PdfPosition | null>(null);
  const scrollRestoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

  /**
   * 读取PDF文件并加载
   */
  const loadPdfFromFile = useCallback(async (path: string): Promise<string | null> => {
    if (!window.electronAPI?.readFileBase64) {
      console.error('electronAPI.readFileBase64 not available');
      return null;
    }

    try {
      return await window.electronAPI.readFileBase64(path);
    } catch (error) {
      console.error('Failed to read PDF file:', error);
      throw error;
    }
  }, []);

  /**
   * 渲染所有PDF页面
   */
  const renderAllPages = useCallback(async (doc: pdfjs.PDFDocumentProxy, s: number, startPage?: number) => {
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
      wrapper.setAttribute('data-page', String(i));

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

    // 恢复之前的滚动位置
    if (isInitialLoadRef.current && savedPositionRef.current) {
      if (scrollRestoreTimeoutRef.current) {
        clearTimeout(scrollRestoreTimeoutRef.current);
      }
      scrollRestoreTimeoutRef.current = setTimeout(() => {
        if (canvasContainerRef.current) {
          canvasContainerRef.current.scrollTop = savedPositionRef.current!.scrollTop;
          canvasContainerRef.current.scrollLeft = savedPositionRef.current!.scrollLeft;
        }
        isInitialLoadRef.current = false;
      }, 100);
    }
  }, []);

  /**
   * 加载PDF文件
   */
  useEffect(() => {
    if (!filePath) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setRenderError(null);
    setLoading(true);
    isInitialLoadRef.current = true;

    // 加载保存的位置信息
    savedPositionRef.current = loadPdfPosition(filePath);
    if (savedPositionRef.current) {
      setScale(savedPositionRef.current.scale);
      if (savedPositionRef.current.currentPage) {
        setCurrentPage(savedPositionRef.current.currentPage);
      }
    }

    const load = async () => {
      try {
        // 从文件加载PDF
        const base64 = await loadPdfFromFile(filePath);
        if (cancelled || !base64) {
          setLoading(false);
          return;
        }

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const loadingTask = pdfjs.getDocument({ data: bytes });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        
        // 使用保存的缩放比例渲染
        const renderScale = savedPositionRef.current?.scale || 1.2;
        await renderAllPages(doc, renderScale);
        
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          console.error('PDF load error', e);
          setRenderError(e?.message || '无法加载 PDF 文件');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (scrollRestoreTimeoutRef.current) {
        clearTimeout(scrollRestoreTimeoutRef.current);
      }
    };
  }, [filePath, loadPdfFromFile, renderAllPages]);

  // 监听滚动事件，实时保存位置
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      // 防抖保存
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (pdfDocRef.current && container) {
          const position: PdfPosition = {
            scale,
            scrollTop: container.scrollTop,
            scrollLeft: container.scrollLeft,
            currentPage,
            timestamp: Date.now(),
          };
          savePdfPosition(filePath, position);
        }
      }, 1000);
    };

    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, [filePath, scale, currentPage]);

  // 重新渲染当缩放改变时
  useEffect(() => {
    if (pdfDocRef.current) {
      renderAllPages(pdfDocRef.current, scale);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const handleZoomIn = () => {
    setScale(s => Math.min(s + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setScale(s => Math.max(s - 0.2, 0.4));
  };

  const handleResetZoom = () => {
    setScale(1.2);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-400">正在加载 PDF...</p>
      </div>
    );
  }

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3 select-none">
        <AlertCircle className="w-16 h-16 text-gray-300" />
        <p className="text-sm text-gray-400">未选择PDF文件</p>
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
      {/* PDF 工具栏 */}
      <div className="h-10 flex items-center justify-between px-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors min-w-[46px] text-center"
            title="重置缩放"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
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
          {onDownload && (
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
      {/* Canvas 容器 */}
      <div className="flex-1 overflow-auto py-4 px-2" ref={canvasContainerRef} />
    </div>
  );
};

// 导出辅助函数，用于测试或手动清理
export { clearPdfPosition, loadPdfPosition, savePdfPosition, getPdfPositionKey };
