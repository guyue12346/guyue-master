import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus, Save, Trash2, X, Download, Upload, Image as ImageIcon,
  FileText, Edit2, Copy, CheckCircle, AlertCircle, Loader2, Pencil,
  FolderOpen, ChevronDown
} from 'lucide-react';
import '@excalidraw/excalidraw/index.css';

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
const STORAGE_KEY_IMAGE_CONFIG = 'linkmaster_image_hosting_config_v1';
const STORAGE_KEY_IMAGE_RECORDS = 'linkmaster_image_records_v1';

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
  onExport: (name: string, format: 'png' | 'svg') => void;
  isUploading: boolean;
  defaultName: string;
}> = ({ isOpen, onClose, onExport, isUploading, defaultName }) => {
  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  useEffect(() => { if (isOpen) setName(defaultName); }, [isOpen, defaultName]);
  if (!isOpen) return null;
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
              onClick={() => { if (name.trim()) onExport(name.trim(), format); }}
              disabled={isUploading || !name.trim()}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-xl flex items-center gap-1.5 disabled:opacity-50"
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

  // 获取当前激活的画布
  const activeDrawing = useMemo(() => {
    return drawings.find(d => d.id === activeId) || null;
  }, [drawings, activeId]);

  // 新建画布
  const handleNewDrawing = useCallback(() => {
    const newDrawing: DrawingFile = {
      id: generateId(),
      name: `画布 ${drawings.length + 1}`,
      data: { elements: [], appState: {}, files: {} },
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
      d.id === activeId ? { ...d, data: { elements, appState: { viewBackgroundColor: appState.viewBackgroundColor }, files }, updatedAt: Date.now() } : d
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
    const elements = api.getSceneElements();
    if (!elements || !elements.length) { showToast('画布为空', 'error'); return; }
    try {
      const blob = await exportUtils.exportToBlob({
        elements,
        appState: { ...api.getAppState(), exportWithDarkMode: isDark, exportBackground: true },
        files: api.getFiles(),
        getDimensions: (width: number, height: number) => ({ width, height, scale: 3 }),
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
    const elements = api.getSceneElements();
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
  const handleExportToHosting = useCallback(async (name: string, format: 'png' | 'svg') => {
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
    const elements = api.getSceneElements();
    if (!elements || !elements.length) { showToast('画布为空', 'error'); return; }

    setIsUploading(true);
    try {
      let base64Content: string;
      let ext: string;

      if (format === 'png') {
        const blob = await exportUtils.exportToBlob({
          elements,
          appState: { ...api.getAppState(), exportWithDarkMode: isDark, exportBackground: true },
          files: api.getFiles(),
          getDimensions: (width: number, height: number) => ({ width, height, scale: 3 }),
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
      const path = hostingConfig.path ? `${hostingConfig.path}/${filename}` : filename;

      const data = await window.electronAPI.uploadImage({
        accessToken: hostingConfig.accessToken,
        owner: hostingConfig.owner,
        repo: hostingConfig.repo,
        path,
        content: base64Content,
        message: `Upload ${name}.${ext} via Guyue Master Excalidraw`,
      });

      // 添加到图床记录
      const newRecord = {
        id: timestamp.toString(),
        filename,
        name: name,
        url: data.content.download_url,
        sha: data.content.sha,
        path: data.content.path,
        category: '绘图',
        createdAt: Date.now(),
      };

      try {
        const existingRaw = localStorage.getItem(STORAGE_KEY_IMAGE_RECORDS);
        const existingRecords = existingRaw ? JSON.parse(existingRaw) : [];
        localStorage.setItem(STORAGE_KEY_IMAGE_RECORDS, JSON.stringify([newRecord, ...existingRecords]));
      } catch {}

      // 复制 Markdown 链接到剪贴板
      const mdLink = `![${name}](${data.content.download_url})`;
      await navigator.clipboard.writeText(mdLink);

      setIsExportModalOpen(false);
      showToast('已上传到图床，Markdown 链接已复制');
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
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">绘图板</h2>
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

        <div className="flex items-center gap-1.5">
          {/* 保存按钮 */}
          <button onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="保存 (自动保存每30秒)">
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">保存</span>
          </button>

          {/* 导出菜单 */}
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">导出</span>
              <ChevronDown className="w-3 h-3" />
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
        </div>
      </div>

      {/* Excalidraw 编辑器 */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {activeDrawing && (
          <ExcalidrawComp
            excalidrawAPI={(api: any) => { excalidrawAPIRef.current = api; }}
            key={activeId}
            initialData={activeDrawing.data}
            theme={isDark ? 'dark' : 'light'}
            langCode="zh-CN"
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
      />
    </div>
  );
};

export default ExcalidrawEditor;
