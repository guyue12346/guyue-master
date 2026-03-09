import React, { useState, useEffect } from 'react';
import { X, Check, Plus, Trash2 } from 'lucide-react';
import type { OJSite, OJStatCategory } from '../../types';

interface OJSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (site: OJSite) => void;
  onDelete?: (siteId: string) => void;
  editingSite: OJSite | null;
}

// 预设颜色
const PRESET_COLORS = [
  '#f59e0b', // 琥珀
  '#22c55e', // 绿色
  '#3b82f6', // 蓝色
  '#ef4444', // 红色
  '#8b5cf6', // 紫色
  '#ec4899', // 粉色
  '#06b6d4', // 青色
  '#f97316', // 橙色
  '#84cc16', // 黄绿
  '#6366f1', // 靛蓝
];

// 分类颜色预设
const CATEGORY_COLORS = [
  '#22c55e', // 绿色 (简单)
  '#f59e0b', // 琥珀 (中等)
  '#ef4444', // 红色 (困难)
  '#a3e635', // 黄绿
  '#14b8a6', // 青绿
  '#06b6d4', // 青色
  '#3b82f6', // 蓝色
  '#8b5cf6', // 紫色
];

export const OJSiteModal: React.FC<OJSiteModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  editingSite,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [url, setUrl] = useState('');
  const [categories, setCategories] = useState<OJStatCategory[]>([]);

  // 当模态框打开或编辑网站变化时，初始化表单
  useEffect(() => {
    if (isOpen) {
      if (editingSite) {
        setName(editingSite.name);
        setColor(editingSite.color);
        setUrl(editingSite.url || '');
        setCategories(editingSite.categories || []);
      } else {
        setName('');
        setColor(PRESET_COLORS[0]);
        setUrl('');
        setCategories([]);
      }
    }
  }, [isOpen, editingSite]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('请输入网站名称');
      return;
    }

    // 验证分类数据
    for (const cat of categories) {
      if (!cat.name.trim()) {
        alert('分类名称不能为空');
        return;
      }
    }

    const site: OJSite = {
      id: editingSite?.id || `site_${Date.now()}`,
      name: name.trim(),
      color,
      url: url.trim() || undefined,
      categories: categories.length > 0 ? categories : undefined,
    };

    onSave(site);
    onClose();
  };

  const handleDelete = () => {
    if (editingSite && onDelete) {
      onDelete(editingSite.id);
      onClose();
    }
  };

  const handleAddCategory = () => {
    const usedColors = categories.map(c => c.color);
    const availableColor = CATEGORY_COLORS.find(c => !usedColors.includes(c)) || CATEGORY_COLORS[0];
    const newId = `cat_${Date.now()}`;

    setCategories([
      ...categories,
      { id: newId, name: '', color: availableColor },
    ]);
  };

  const handleRemoveCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const handleUpdateCategory = (index: number, updates: Partial<OJStatCategory>) => {
    setCategories(categories.map((cat, i) =>
      i === index ? { ...cat, ...updates } : cat
    ));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-[480px] max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {editingSite ? '编辑网站' : '添加网站'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单 - 可滚动 */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* 网站名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              网站名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：LeetCode、洛谷"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              标识颜色
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform hover:scale-110
                             ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800' : ''}`}
                  style={{ backgroundColor: c }}
                >
                  {color === c && (
                    <Check className="w-4 h-4 text-white mx-auto" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 网站链接 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              网站链接 <span className="text-gray-400">(可选)</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://leetcode.cn"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* 分类统计 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                题目难度分类
              </label>
              <button
                onClick={handleAddCategory}
                className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400
                           hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                添加分类
              </button>
            </div>

            {categories.length > 0 ? (
              <div className="space-y-2">
                {categories.map((category, index) => (
                  <div key={category.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    {/* 颜色选择 */}
                    <div className="relative">
                      <div
                        className="w-6 h-6 rounded-full cursor-pointer"
                        style={{ backgroundColor: category.color }}
                        onClick={() => {
                          const currentIndex = CATEGORY_COLORS.indexOf(category.color);
                          const nextIndex = (currentIndex + 1) % CATEGORY_COLORS.length;
                          handleUpdateCategory(index, { color: CATEGORY_COLORS[nextIndex] });
                        }}
                      />
                    </div>

                    {/* 分类名称 */}
                    <input
                      type="text"
                      value={category.name}
                      onChange={(e) => handleUpdateCategory(index, { name: e.target.value })}
                      placeholder="如：简单、中等、困难"
                      className="flex-1 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600
                                 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                                 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />

                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleRemoveCategory(index)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                添加难度分类（如简单/中等/困难）
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          {/* 删除按钮（仅编辑时显示） */}
          {editingSite && onDelete ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 dark:text-red-400
                         hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              删除网站
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                         bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                         rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OJSiteModal;
