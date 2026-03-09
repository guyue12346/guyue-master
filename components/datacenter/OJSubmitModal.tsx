import React, { useState, useEffect } from 'react';
import { X, Send, Info } from 'lucide-react';
import type { OJSite, OJSubmission } from '../../types';

interface OJSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (submission: OJSubmission) => void;
  sites: OJSite[];
}

// 格式化日期为 YYYY-MM-DD
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const OJSubmitModal: React.FC<OJSubmitModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  sites,
}) => {
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [problemId, setProblemId] = useState<string>('');

  // 获取当前选中的网站
  const selectedSite = sites.find(s => s.id === selectedSiteId);

  // 重置表单
  useEffect(() => {
    if (isOpen) {
      // 默认选中第一个网站
      if (sites.length > 0 && !selectedSiteId) {
        setSelectedSiteId(sites[0].id);
        if (sites[0].categories && sites[0].categories.length > 0) {
          setSelectedCategoryId(sites[0].categories[0].id);
        }
      }
      setProblemId('');
    }
  }, [isOpen, sites]);

  // 当网站变化时，重置分类选择
  useEffect(() => {
    if (selectedSite?.categories && selectedSite.categories.length > 0) {
      setSelectedCategoryId(selectedSite.categories[0].id);
    } else {
      setSelectedCategoryId('');
    }
  }, [selectedSiteId]);

  const handleSubmit = () => {
    if (!selectedSiteId) {
      alert('请选择 OJ 网站');
      return;
    }

    if (selectedSite?.categories && selectedSite.categories.length > 0 && !selectedCategoryId) {
      alert('请选择题目难度');
      return;
    }

    if (!problemId.trim()) {
      alert('请输入题号');
      return;
    }

    const submission: OJSubmission = {
      id: `sub_${Date.now()}`,
      siteId: selectedSiteId,
      categoryId: selectedCategoryId || 'default',
      problemId: problemId.trim(),
      timestamp: Date.now(),
      date: formatDate(new Date()),
    };

    onSubmit(submission);
    setProblemId(''); // 清空题号，方便连续提交
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-96 max-w-[90vw]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            提交做题记录
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单 */}
        <div className="p-4 space-y-4">
          {/* 选择 OJ 网站 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              OJ 网站
            </label>
            <div className="flex flex-wrap gap-2">
              {sites.map(site => (
                <button
                  key={site.id}
                  onClick={() => setSelectedSiteId(site.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors
                    ${selectedSiteId === site.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: site.color }}
                  />
                  <span className={`text-sm ${
                    selectedSiteId === site.id
                      ? 'text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}>
                    {site.name}
                  </span>
                </button>
              ))}
            </div>
            {/* LeetCode 提示 */}
            {selectedSiteId === 'leetcode' && (
              <div className="mt-3 flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <Info className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  LeetCode 建议使用右下角设置里的「同步 LeetCode」功能自动同步，无需手动提交。
                </p>
              </div>
            )}
          </div>

          {/* 选择难度分类 */}
          {selectedSite?.categories && selectedSite.categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                题目难度
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedSite.categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                      ${selectedCategoryId === cat.id
                        ? 'text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    style={selectedCategoryId === cat.id ? { backgroundColor: cat.color } : {}}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 输入题号 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              题号
            </label>
            <input
              type="text"
              value={problemId}
              onChange={(e) => setProblemId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="如：1, 两数之和, P1001"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-400">
              按 Enter 快速提交
            </p>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                       bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                       rounded-lg transition-colors"
          >
            关闭
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
            提交
          </button>
        </div>
      </div>
    </div>
  );
};

export default OJSubmitModal;
