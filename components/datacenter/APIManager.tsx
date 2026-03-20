import React, { useState, useMemo, Suspense } from 'react';
import { APIRecord, Category } from '../../types';
import { FolderTree, Plus, Search } from 'lucide-react';
import { APIList } from '../APIList';
import { CategoryManagerModal } from '../CategoryManagerModal';

const APIModal = React.lazy(() => import('../APIModal').then(m => ({ default: m.APIModal })));

interface APIManagerProps {
  records: APIRecord[];
  categories: Category[];
  onSave: (record: Partial<APIRecord>) => void;
  onDelete: (id: string) => void;
  onUpdateCategories: (categories: Category[]) => void;
  onDeleteCategory: (id: string) => void;
}

export const APIManager: React.FC<APIManagerProps> = ({
  records,
  categories,
  onSave,
  onDelete,
  onUpdateCategories,
  onDeleteCategory,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<APIRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  const categoryNames = useMemo(() => categories.map(c => c.name), [categories]);

  const allCategories = useMemo(() => {
    return Array.from(new Set([
      ...categories.map(c => c.name).filter(name => name && name !== '全部'),
      ...records.map(r => r.category).filter(Boolean),
    ]));
  }, [categories, records]);

  const filteredRecords = useMemo(() => {
    let result = records;
    if (selectedCategory && selectedCategory !== '全部') {
      result = result.filter(r => r.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.endpoint.toLowerCase().includes(q) ||
        r.note?.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      const pA = a.priority ?? 999;
      const pB = b.priority ?? 999;
      if (pA !== pB) return pA - pB;
      return a.createdAt - b.createdAt;
    });
  }, [records, selectedCategory, searchQuery]);

  const handleEdit = (record: APIRecord) => {
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

  const handleSave = (record: Partial<APIRecord>) => {
    onSave(record);
    handleClose();
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索 API..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700/50 border-none rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-gray-700 transition-all text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {['全部', ...allCategories].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
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
            添加 API
          </button>
        </div>
      </div>

      {/* API 列表 */}
      <div className="flex-1 overflow-auto">
        <APIList
          records={filteredRecords}
          onDelete={onDelete}
          onEdit={handleEdit}
        />
      </div>

      {/* API Modal */}
      <Suspense fallback={null}>
        <APIModal
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

export default APIManager;
