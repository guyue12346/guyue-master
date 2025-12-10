
import React, { useState, useEffect, useRef } from 'react';
import { FileRecord } from '../types';
import { X, Upload, File as FileIcon, Tag, AlertTriangle, FileText, HardDrive, Cloud, Link as LinkIcon, FolderOpen } from 'lucide-react';

interface FileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: Partial<FileRecord>) => void;
  initialData?: FileRecord | null;
  categories: string[];
  mode?: 'file' | 'note';
  defaultCategory?: string;
}

type StorageType = 'reference' | 'local_archive' | 'cloud';

export const FileModal: React.FC<FileModalProps> = ({ isOpen, onClose, onSave, initialData, categories, mode = 'file', defaultCategory }) => {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [size, setSize] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [importance, setImportance] = useState<number>(50);
  const [storageType, setStorageType] = useState<StorageType>('reference');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setPath(initialData.path);
      setSize(initialData.size);
      setType(initialData.type);
      setCategory(initialData.category);
      setNote(initialData.note);
      setImportance(initialData.importance);
      setStorageType('reference'); // Default to reference for existing items
    } else {
      resetForm();
      if (defaultCategory) {
        setCategory(defaultCategory);
      }
      if (mode === 'note') {
        setType('MARKDOWN');
        setSize('0 B');
        setPath('internal://new');
      }
    }
  }, [initialData, isOpen, mode, defaultCategory]);

  const resetForm = () => {
    setName('');
    setPath('');
    setSize('');
    setType('');
    setCategory('');
    setNote('');
    setImportance(50);
    setStorageType('reference');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSelectFile = async () => {
    if (window.electronAPI && window.electronAPI.selectFile) {
      const fileInfo = await window.electronAPI.selectFile();
      if (fileInfo) {
        setName(fileInfo.name);
        setSize(formatFileSize(fileInfo.size));
        setType(fileInfo.type);
        setPath(fileInfo.path);
      }
    } else {
      // Fallback for web browser (demo only)
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setName(file.name);
      setSize(formatFileSize(file.size));
      const ext = file.name.split('.').pop() || 'file';
      setType(ext.toUpperCase());
      setPath(file.name); // Web fallback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate .md extension for note mode
    if (mode === 'note' && !name.toLowerCase().endsWith('.md')) {
      alert('文件名必须以 .md 结尾');
      return;
    }
    
    setIsProcessing(true);

    let finalPath = path;

    // Handle Local Archive Logic or New Note Creation
    if ((storageType === 'local_archive' || mode === 'note') && window.electronAPI) {
      const archiveRoot = localStorage.getItem('linkmaster_archive_path');
      if (!archiveRoot) {
        alert('请先在设置中配置本地归档根目录');
        setIsProcessing(false);
        return;
      }

      try {
        // 1. Construct target directory: Root / Category / Type
        // Sanitize category name to be safe for folder name
        const safeCategory = category.replace(/[\\/:*?"<>|]/g, '_');
        const safeType = type.replace(/[\\/:*?"<>|]/g, '_');
        
        const targetDir = await window.electronAPI.pathJoin(archiveRoot, safeCategory, safeType);
        
        // 2. Ensure directory exists
        const dirCreated = await window.electronAPI.ensureDir(targetDir);
        if (!dirCreated) throw new Error('无法创建目标文件夹');

        // 3. Construct target file path
        const targetPath = await window.electronAPI.pathJoin(targetDir, name);

        // 4. Create or Copy file
        if (mode === 'note') {
            // Create new empty file
            const writeSuccess = await window.electronAPI.writeFile(targetPath, '');
            if (!writeSuccess) throw new Error('文件创建失败');
        } else {
            // Copy existing file
            const copySuccess = await window.electronAPI.copyFile(path, targetPath);
            if (!copySuccess) throw new Error('文件复制失败');
        }

        finalPath = targetPath;
      } catch (err) {
        alert(`操作失败: ${(err as Error).message}`);
        setIsProcessing(false);
        return;
      }
    }

    onSave({
      id: initialData?.id,
      name,
      path: finalPath,
      size,
      type,
      category,
      note,
      importance
    });
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg border border-white/50 overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50">
          <h2 className="text-lg font-semibold text-gray-800">
            {initialData ? '编辑文件记录' : (mode === 'note' ? '创建 Markdown 笔记' : '添加重要文件')}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* File Selector - Only for 'file' mode */}
          {!initialData && mode === 'file' && (
             <div 
               onClick={handleSelectFile}
               className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 hover:border-blue-400 hover:bg-blue-50/30 hover:text-blue-500 cursor-pointer transition-all"
             >
               <Upload className="w-8 h-8 mb-2 opacity-50" />
               <span className="text-sm font-medium">点击选择文件</span>
               <span className="text-xs opacity-60 mt-1">自动识别名称、大小和类型</span>
               {/* Hidden input for web fallback */}
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 onChange={handleFileSelect} 
                 className="hidden" 
               />
             </div>
          )}

          {/* Storage Options (Only for new files) */}
          {!initialData && path && mode === 'file' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">存储方式</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStorageType('reference')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    storageType === 'reference' 
                      ? 'bg-blue-50 border-blue-500 text-blue-700' 
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <LinkIcon className="w-5 h-5 mb-1" />
                  <span className="text-xs font-medium">仅引用</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!localStorage.getItem('linkmaster_archive_path')) {
                        alert('请先在设置中配置本地归档根目录');
                        return;
                    }
                    setStorageType('local_archive');
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    storageType === 'local_archive' 
                      ? 'bg-blue-50 border-blue-500 text-blue-700' 
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <HardDrive className="w-5 h-5 mb-1" />
                  <span className="text-xs font-medium">本地归档</span>
                </button>

                <button
                  type="button"
                  disabled
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                >
                  <Cloud className="w-5 h-5 mb-1" />
                  <span className="text-xs font-medium">云空间</span>
                </button>
              </div>
              {storageType === 'local_archive' && (
                <p className="text-[10px] text-blue-600 bg-blue-50 p-2 rounded-lg">
                  文件将被复制到设置中指定的归档目录，并按分类和类型自动整理。
                </p>
              )}
            </div>
          )}

          {/* Name & Path */}
          <div className="space-y-4">
             <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">文件名</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileIcon className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="example.pdf"
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                  />
                </div>
             </div>
             
             {/* Read-only Metadata Row */}
             <div className="grid grid-cols-2 gap-4">
                 <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 text-xs text-gray-500 flex justify-between">
                    <span>Size:</span>
                    <span className="font-mono text-gray-800">{size || '--'}</span>
                 </div>
                 <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 text-xs text-gray-500 flex justify-between">
                    <span>Type:</span>
                    <span className="font-mono text-gray-800">{type || '--'}</span>
                 </div>
             </div>
          </div>

          {/* Category & Importance */}
          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                {mode ? '文件夹' : '分类'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  {mode ? <FolderOpen className="h-4 w-4 text-gray-400" /> : <Tag className="h-4 w-4 text-gray-400" />}
                </div>
                <input
                  list="categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={mode ? "选择或输入文件夹" : "选择或输入分类"}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
                <datalist id="categories">
                  {categories.filter(c => c !== '全部').map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                重要程度 ({importance})
              </label>
              <div className="relative flex items-center h-[42px]">
                 <input 
                   type="range"
                   min="0"
                   max="100"
                   value={importance}
                   onChange={(e) => setImportance(parseInt(e.target.value))}
                   className="w-full accent-gray-900 cursor-pointer"
                 />
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">备注</label>
            <div className="relative">
               <div className="absolute top-3 left-3 pointer-events-none">
                  <FileText className="h-4 w-4 text-gray-400" />
                </div>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="文件内容描述..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              disabled={isProcessing}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-xl shadow-lg shadow-gray-900/20 hover:bg-black hover:scale-105 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  处理中...
                </>
              ) : (
                '保存'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
