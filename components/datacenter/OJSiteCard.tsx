import React, { useState } from 'react';
import { Pencil, ExternalLink } from 'lucide-react';
import type { OJSite, OJSubmission } from '../../types';

interface OJSiteCardProps {
  site: OJSite;
  submissions: OJSubmission[]; // 该网站的所有提交记录
  onEdit: (site: OJSite) => void;
  viewMode?: 'month' | 'year';
  yearMode?: 'fixed' | 'recent';
  currentDate?: Date;
}

// 多色环形进度条组件（类似 LeetCode 的难度分布）
const MultiColorCircle: React.FC<{
  segments: { value: number; color: string; name: string }[];
  total: number;
  size?: number;
}> = ({ segments, total, size = 90 }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // 计算每个分段的起始和结束位置
  let currentOffset = 0;
  const segmentArcs = segments.map(seg => {
    const percentage = total > 0 ? seg.value / total : 0;
    const length = percentage * circumference;
    const arc = {
      ...seg,
      offset: currentOffset,
      length,
      percentage,
    };
    currentOffset += length;
    return arc;
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* 各分类的弧形 */}
        {segmentArcs.map((seg, index) => (
          seg.length > 0 && (
            <circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.offset}
              className="transition-all duration-500"
            />
          )
        ))}
      </svg>
      {/* 中心文字 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900 dark:text-white">
          {total}
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          题
        </span>
      </div>
    </div>
  );
};

export const OJSiteCard: React.FC<OJSiteCardProps> = ({
  site,
  submissions,
  onEdit,
  viewMode = 'year',
  yearMode = 'recent',
  currentDate = new Date(),
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // 根据视图模式过滤提交记录
  const filteredSubmissions = React.useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // 计算近一年的日期范围（只比较日期字符串，避免时区问题）
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`;

    return submissions.filter(sub => {
      // 元数据始终保留
      if (sub.categoryId === 'meta') return true;

      if (viewMode === 'year') {
        if (yearMode === 'recent') {
          // 近一年：直接比较日期字符串
          return sub.date >= oneYearAgoStr && sub.date <= todayStr;
        } else {
          // 固定年份
          const [y] = sub.date.split('-').map(Number);
          return y === year;
        }
      } else if (viewMode === 'month') {
        const [y, m] = sub.date.split('-').map(Number);
        return y === year && m === month + 1;
      }
      return true;
    });
  }, [submissions, viewMode, yearMode, currentDate]);

  // 检查是否有 LeetCode 的元数据统计（仅在近一年视图使用）
  const metaStats = React.useMemo(() => {
    // 只在近一年视图下使用元数据
    if (site.id !== 'leetcode' || viewMode !== 'year' || yearMode !== 'recent') return null;

    const metaRecord = filteredSubmissions.find(s => s.id === 'lc_stats_meta');
    if (!metaRecord) return null;

    // 解析 "统计:20,82,9" 格式
    const match = metaRecord.problemId.match(/统计:(\d+),(\d+),(\d+)/);
    if (!match) return null;

    return {
      easy: parseInt(match[1]),
      medium: parseInt(match[2]),
      hard: parseInt(match[3]),
    };
  }, [site.id, filteredSubmissions, viewMode, yearMode]);

  // 过滤掉元数据和汇总记录，只保留真实提交
  const realSubmissions = React.useMemo(() => {
    return filteredSubmissions.filter(s =>
      s.categoryId !== 'meta' &&
      s.categoryId !== 'unknown' &&
      !s.problemId.startsWith('(')
    );
  }, [filteredSubmissions]);

  // 计算各分类的做题数（不重复计算）
  const categoryStats = React.useMemo(() => {
    if (!site.categories || site.categories.length === 0) {
      return {};
    }

    // 如果有元数据统计（LeetCode），使用元数据
    if (metaStats) {
      return {
        easy: metaStats.easy,
        medium: metaStats.medium,
        hard: metaStats.hard,
      };
    }

    // 否则从提交记录计算
    const stats: Record<string, number> = {};
    const uniqueProblems: Record<string, Set<string>> = {};

    site.categories.forEach(cat => {
      stats[cat.id] = 0;
      uniqueProblems[cat.id] = new Set();
    });

    realSubmissions.forEach(sub => {
      if (uniqueProblems[sub.categoryId] && !uniqueProblems[sub.categoryId].has(sub.problemId)) {
        uniqueProblems[sub.categoryId].add(sub.problemId);
        stats[sub.categoryId]++;
      }
    });

    return stats;
  }, [site.categories, realSubmissions, metaStats]);

  // 计算总做题数（不重复）
  const totalSolved = React.useMemo(() => {
    // 如果有元数据统计，使用元数据
    if (metaStats) {
      return metaStats.easy + metaStats.medium + metaStats.hard;
    }

    // 否则从提交记录计算
    const uniqueProblems = new Set<string>();
    realSubmissions.forEach(sub => {
      uniqueProblems.add(`${sub.categoryId}-${sub.problemId}`);
    });
    return uniqueProblems.size;
  }, [realSubmissions, metaStats]);

  // 计算总提交次数（从日历数据或记录数）
  const totalSubmissions = React.useMemo(() => {
    // 过滤掉元数据记录
    const nonMetaSubmissions = filteredSubmissions.filter(s => s.categoryId !== 'meta');

    // 计算汇总记录中的提交次数
    let summaryCount = 0;
    nonMetaSubmissions.forEach(s => {
      if (s.problemId.startsWith('(')) {
        const match = s.problemId.match(/\((\d+)次提交\)/);
        if (match) {
          summaryCount += parseInt(match[1]);
        }
      }
    });
    // 非汇总记录数 + 汇总数
    const detailRecords = nonMetaSubmissions.filter(s => !s.problemId.startsWith('('));
    return detailRecords.length + summaryCount;
  }, [filteredSubmissions]);

  const hasCategories = site.categories && site.categories.length > 0;

  // 准备环形图数据
  const segments = React.useMemo(() => {
    if (!site.categories) return [];
    return site.categories.map(cat => ({
      value: categoryStats[cat.id] || 0,
      color: cat.color,
      name: cat.name,
    }));
  }, [site.categories, categoryStats]);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 头部：网站名称 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: site.color }}
          />
          <span className="font-medium text-gray-900 dark:text-white">
            {site.name}
          </span>
          {/* 链接按钮 - 悬停时显示 */}
          {site.url && (
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-gray-400 hover:text-blue-500 transition-all duration-200 ${
                isHovered ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {/* 编辑按钮 - 悬停时显示 */}
        <button
          onClick={() => onEdit(site)}
          className={`p-1 text-gray-400 hover:text-blue-500 transition-all duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      {hasCategories ? (
        <div className="flex items-center gap-4">
          {/* 左侧：多色环形进度 */}
          <MultiColorCircle
            segments={segments}
            total={totalSolved}
            size={90}
          />

          {/* 右侧：分类统计 */}
          <div className="flex-1 space-y-2">
            {site.categories!.map((category) => (
              <div key={category.id} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {category.name}
                  </span>
                </div>
                <span
                  className="text-sm font-semibold"
                  style={{ color: category.color }}
                >
                  {categoryStats[category.id] || 0}
                </span>
              </div>
            ))}
            {/* 提交次数 */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs text-gray-400">
                提交次数
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {totalSubmissions}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* 无分类时显示简单统计 */
        <div className="flex items-center justify-center py-2">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalSolved}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              题
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {totalSubmissions} 次提交
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OJSiteCard;
