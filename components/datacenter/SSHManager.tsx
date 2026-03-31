import React, { useState, useMemo, Suspense } from 'react';
import { SSHRecord, Category } from '../../types';
import { FolderTree, Plus, Search, Terminal } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { SSHList } from '../SSHList';
import { CategoryManagerModal } from '../CategoryManagerModal';

// 动态导入 SSHModal（避免循环依赖）
const SSHModal = React.lazy(() => import('../SSHModal').then(m => ({ default: m.SSHModal })));

interface SSHManagerProps {
  records: SSHRecord[];
  categories: Category[];
  onSave: (record: Partial<SSHRecord>) => void;
  onDelete: (id: string) => void;
  onOpenInTerminal: (command: string, title: string) => void;
  onUpdateCategories: (categories: Category[]) => void;
  onDeleteCategory: (id: string) => void;
}

export const SSHManager: React.FC<SSHManagerProps> = ({
  records,
  categories,
  onSave,
  onDelete,
  onOpenInTerminal,
  onUpdateCategories,
  onDeleteCategory,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SSHRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  const categoryNames = useMemo(
    () => categories.map(c => c.name),
    [categories]
  );

  const filteredRecords = useMemo(() => {
    let result = records;
    if (selectedCategory && selectedCategory !== '全部') {
      result = result.filter(r => r.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.host.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }, [records, selectedCategory, searchQuery]);

  const handleEdit = (record: SSHRecord) => {
    setEditingRecord(record);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingRecord(null);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
  };

  const handleSave = (record: Partial<SSHRecord>) => {
    onSave(record);
    handleClose();
  };

  // 所有存在的分类
  const allCategories = useMemo(() => {
    return Array.from(new Set([
      ...categories.map(c => c.name).filter(name => name && name !== '全部'),
      ...records.map(r => r.category).filter(Boolean),
    ]));
  }, [categories, records]);

  const activeCategoryCount = selectedCategory === '全部'
    ? records.length
    : records.filter(record => record.category === selectedCategory).length;

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索服务器..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-700 transition-all text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsCategoryManagerOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm text-sm font-medium"
            >
              <FolderTree className="w-4 h-4" />
              分类管理
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium shrink-0"
            >
              <Plus className="w-4 h-4" />
              添加连接
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white/70 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {['全部', ...allCategories].map(catName => {
              const categoryObj = categories.find(c => c.name === catName);
              const color = categoryObj?.color;
              const iconName = categoryObj?.icon;
              const CatIcon = iconName ? ((LucideIcons as any)[iconName] || null) : null;
              const isActive = selectedCategory === catName;
              return (
                <button
                  key={catName}
                  onClick={() => setSelectedCategory(catName)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {!isActive && CatIcon && color && (
                    <CatIcon className="w-3 h-3" style={{ color }} />
                  )}
                  {!isActive && !CatIcon && color && (
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  )}
                  {catName}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SSH 列表 */}
      <div className="flex-1 overflow-auto">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700/50 rounded-full flex items-center justify-center mb-3">
              <Terminal className="w-8 h-8 text-gray-300 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">暂无 SSH 记录</p>
            <p className="text-xs text-gray-400 mt-1">点击右上角添加服务器连接</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700/50 rounded-full flex items-center justify-center mb-3">
              <Search className="w-8 h-8 text-gray-300 dark:text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">没有匹配的 SSH 记录</p>
            <p className="text-xs text-gray-400 mt-1">换个关键词，或切换上方分类筛选</p>
          </div>
        ) : (
          <SSHList
            records={filteredRecords}
            categories={categories}
            onDelete={onDelete}
            onEdit={handleEdit}
            onOpenInTerminal={onOpenInTerminal}
          />
        )}
      </div>

      {/* SSH Modal */}
      <Suspense fallback={null}>
        <SSHModal
          isOpen={isModalOpen}
          onClose={handleClose}
          onSave={handleSave}
          initialData={editingRecord}
          categories={categoryNames}
        />
      </Suspense>

      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        categories={categories}
        onUpdateCategories={onUpdateCategories}
        onDeleteCategory={onDeleteCategory}
      />
    </div>
  );
};

export default SSHManager;
