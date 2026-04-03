import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

interface EnhancedPdfViewerProps {
  filePath: string;
  onDownload?: () => void;
}

/**
 * PDF 阅读器 —— 使用 Chromium 内置 PDF 查看器
 * 通过 blob URL + iframe 实现，原生支持滚动、缩放、搜索、页码导航
 */
export const EnhancedPdfViewer: React.FC<EnhancedPdfViewerProps> = ({
  filePath,
  onDownload,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const api = (window as any).electronAPI;
        if (!api?.readFileBase64) {
          setError('electronAPI.readFileBase64 不可用');
          setLoading(false);
          return;
        }

        const base64: string | null = await api.readFileBase64(filePath);
        if (cancelled) return;
        if (!base64) {
          setError('无法读取 PDF 文件，请检查文件路径');
          setLoading(false);
          return;
        }

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // 清理上一次的 blob URL
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = url;

        if (!cancelled) {
          setBlobUrl(url);
          setLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('PDF load error:', e);
          setError(e?.message || '加载 PDF 失败');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [filePath]);

  if (!filePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3 select-none">
        <AlertCircle className="w-16 h-16 text-gray-300" />
        <p className="text-sm text-gray-400">未选择 PDF 文件</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (loading || !blobUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-400">正在加载 PDF...</p>
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      className="w-full h-full border-none"
      title="PDF 阅读器"
      style={{ flex: 1, minHeight: 0 }}
    />
  );
};
