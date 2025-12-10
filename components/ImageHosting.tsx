import React, { useState, useEffect } from 'react';
import { ImageRecord, ImageHostingConfig } from '../types';
import { Upload, Settings, Copy, Trash2, ExternalLink, Image as ImageIcon, Loader2, X, FileText, Edit2 } from 'lucide-react';

interface ImageHostingProps {
  records: ImageRecord[];
  config: ImageHostingConfig;
  selectedCategory: string;
  categories: string[];
  onUpdateRecords: (records: ImageRecord[]) => void;
  onUpdateConfig: (config: ImageHostingConfig) => void;
}

export const ImageHosting: React.FC<ImageHostingProps> = ({ records, config, selectedCategory, categories, onUpdateRecords, onUpdateConfig }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Name Modal State
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ path: string; name: string } | null>(null);
  const [customName, setCustomName] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add Link Modal State
  const [isAddLinkModalOpen, setIsAddLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');

  // Edit Record Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ImageRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');

  // Category selection for upload/add
  const [selectedUploadCategory, setSelectedUploadCategory] = useState('');
  const [selectedLinkCategory, setSelectedLinkCategory] = useState('');

  // Settings State
  const [tempConfig, setTempConfig] = useState<ImageHostingConfig>(config);

  useEffect(() => {
    setTempConfig(config);
  }, [config]);

  const handleSaveSettings = () => {
    onUpdateConfig(tempConfig);
    setIsSettingsOpen(false);
  };

  const handleUpload = async () => {
    if (!config.accessToken || !config.owner || !config.repo) {
      alert('请先配置 Gitee 图床信息');
      setIsSettingsOpen(true);
      return;
    }

    try {
      const file = await window.electronAPI.selectFile();
      if (!file) return;

      const defaultName = file.name.substring(0, file.name.lastIndexOf('.'));
      setPendingFile(file);
      setCustomName(defaultName);
      setSelectedUploadCategory(selectedCategory === '全部' ? '未分类' : selectedCategory);
      setIsNameModalOpen(true);
    } catch (error: any) {
      console.error('File selection error:', error);
    }
  };

  const handleAddLink = () => {
    setLinkUrl('');
    setLinkName('');
    setSelectedLinkCategory(selectedCategory === '全部' ? '未分类' : selectedCategory);
    setIsAddLinkModalOpen(true);
  };

  const confirmAddLink = () => {
    if (!linkUrl.trim()) {
      alert('请输入图片链接');
      return;
    }

    const newRecord: ImageRecord = {
      id: Date.now().toString(),
      filename: linkName.trim() || '外部链接',
      name: linkName.trim() || '外部链接',
      url: linkUrl.trim(),
      sha: '', // External link doesn't have sha
      path: '', // External link doesn't have path
      category: selectedLinkCategory || '未分类',
      createdAt: Date.now(),
    };

    onUpdateRecords([newRecord, ...records]);
    setIsAddLinkModalOpen(false);
    showToast('链接已添加');
  };

  const handleEditRecord = (record: ImageRecord) => {
    setEditingRecord(record);
    setEditName(record.name || record.filename);
    setEditCategory(record.category || '未分类');
    setIsEditModalOpen(true);
  };

  const confirmEditRecord = () => {
    if (!editingRecord) return;

    const updatedRecords = records.map(r => 
      r.id === editingRecord.id 
        ? { ...r, name: editName.trim() || r.filename, category: editCategory }
        : r
    );

    onUpdateRecords(updatedRecords);
    setIsEditModalOpen(false);
    showToast('记录已更新');
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    
    setIsNameModalOpen(false);
    setIsUploading(true);
    setUploadError(null);

    try {
      const file = pendingFile;
      const base64Content = await window.electronAPI.readFileBase64(file.path);
      
      // Generate a unique filename to avoid conflicts
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || 'png';
      const filename = `${timestamp}_${Math.random().toString(36).substring(7)}.${ext}`;
      const path = config.path ? `${config.path}/${filename}` : filename;

      const data = await window.electronAPI.uploadImage({
        accessToken: config.accessToken,
        owner: config.owner,
        repo: config.repo,
        path: path,
        content: base64Content,
        message: `Upload ${filename} via Guyue Master`
      });

      const defaultName = file.name.substring(0, file.name.lastIndexOf('.'));
      const newRecord: ImageRecord = {
        id: timestamp.toString(),
        filename: filename,
        name: customName || defaultName,
        url: data.content.download_url,
        sha: data.content.sha,
        path: data.content.path,
        category: selectedUploadCategory || '未分类',
        createdAt: Date.now(),
      };

      onUpdateRecords([newRecord, ...records]);

    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError(error.message || '上传失败，请检查配置或网络');
    } finally {
      setIsUploading(false);
      setPendingFile(null);
    }
  };

  const handleDelete = async (record: ImageRecord) => {
    if (!confirm('确定要删除这条记录吗？注意：这不会删除 Gitee 仓库中的文件。')) {
      return;
    }
    onUpdateRecords(records.filter(r => r.id !== record.id));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToastMessage('已复制到剪贴板');
    setTimeout(() => setToastMessage(null), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-blue-600" />
          图床管理
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            title="配置"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={handleAddLink}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-500/30"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="font-medium">添加链接</span>
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span className="font-medium">上传图片</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {uploadError && (
          <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center justify-between">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <ImageIcon className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-600">暂无上传记录</h3>
            <p className="text-sm mt-2">配置 Gitee Token 后即可开始上传图片</p>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="mt-4 text-blue-600 hover:underline text-sm"
            >
              去配置
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {records.map(record => (
              <div key={record.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg transition-all group">
                <div className="aspect-video bg-gray-100 rounded-lg mb-3 overflow-hidden relative flex items-center justify-center">
                  <img 
                    src={record.url} 
                    alt={record.name || record.filename} 
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x200?text=Image+Load+Error';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-800 truncate text-sm" title={record.name || record.filename}>
                      {record.name || record.filename}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {new Date(record.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-50 justify-end">
                    <button 
                      onClick={() => copyToClipboard(`![${record.name || record.filename}](${record.url})`)}
                      className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                      title="复制 Markdown 格式"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>MD</span>
                    </button>
                    <button 
                      onClick={() => copyToClipboard(record.url)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="复制链接"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => window.open(record.url, '_blank')}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="在浏览器打开"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleEditRecord(record)}
                      className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                      title="编辑记录"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(record)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      title="删除记录"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-800/90 text-white px-4 py-2 rounded-full shadow-lg text-sm backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 z-50">
          {toastMessage}
        </div>
      )}

      {/* Name Input Modal */}
      {isNameModalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-800">输入图片名称</h3>
              <button onClick={() => setIsNameModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图片名称</label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  placeholder="请输入图片名称"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmUpload();
                    if (e.key === 'Escape') setIsNameModalOpen(false);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择分类</label>
                <select
                  value={selectedUploadCategory}
                  onChange={e => setSelectedUploadCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  {categories.filter(c => c !== '全部').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsNameModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmUpload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
              >
                确认上传
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Link Modal */}
      {isAddLinkModalOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-800">添加图片链接</h3>
              <button onClick={() => setIsAddLinkModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图片链接 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  placeholder="https://example.com/image.jpg"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmAddLink();
                    if (e.key === 'Escape') setIsAddLinkModalOpen(false);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图片名称 (可选)</label>
                <input
                  type="text"
                  value={linkName}
                  onChange={e => setLinkName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  placeholder="请输入图片名称"
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmAddLink();
                    if (e.key === 'Escape') setIsAddLinkModalOpen(false);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择分类</label>
                <select
                  value={selectedLinkCategory}
                  onChange={e => setSelectedLinkCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  {categories.filter(c => c !== '全部').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsAddLinkModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmAddLink}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-lg shadow-green-500/30"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-800">编辑记录</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图片名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  placeholder="请输入图片名称"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmEditRecord();
                    if (e.key === 'Escape') setIsEditModalOpen(false);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择分类</label>
                <select
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  {categories.filter(c => c !== '全部').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmEditRecord}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors shadow-lg shadow-orange-500/30"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-semibold text-gray-800">图床配置 (Gitee)</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                <input
                  type="password"
                  value={tempConfig.accessToken}
                  onChange={e => setTempConfig({...tempConfig, accessToken: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  placeholder="Gitee 私人令牌"
                />
                <p className="mt-1 text-xs text-gray-400">
                  请在 Gitee 设置 - 安全设置 - 私人令牌 中生成
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Owner (用户名)</label>
                  <input
                    type="text"
                    value={tempConfig.owner}
                    onChange={e => setTempConfig({...tempConfig, owner: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    placeholder="Gitee 用户名"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repo (仓库名)</label>
                  <input
                    type="text"
                    value={tempConfig.repo}
                    onChange={e => setTempConfig({...tempConfig, repo: e.target.value})}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    placeholder="仓库名称"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">存储路径 (可选)</label>
                <input
                  type="text"
                  value={tempConfig.path}
                  onChange={e => setTempConfig({...tempConfig, path: e.target.value})}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  placeholder="例如: images/blog"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
