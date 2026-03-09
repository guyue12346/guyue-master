import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, Download, Plus, BarChart2, Send, RefreshCw, Settings, Trash2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { OJHeatmap } from './OJHeatmap';
import { OJSiteCard } from './OJSiteCard';
import { OJSiteModal } from './OJSiteModal';
import { OJSubmitModal } from './OJSubmitModal';
import { LeetCodeSyncModal } from './LeetCodeSyncModal';
import type { OJSite, OJHeatmapData, OJSubmission } from '../../types';

interface OJHeatmapContainerProps {
  data: OJHeatmapData;
  onUpdateData: (data: OJHeatmapData) => void;
}

// 格式化日期为 YYYY-MM-DD
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 默认预设网站
const DEFAULT_SITES: OJSite[] = [
  {
    id: 'leetcode',
    name: 'LeetCode',
    color: '#f59e0b',
    url: 'https://leetcode.cn',
    categories: [
      { id: 'easy', name: '简单', color: '#22c55e' },
      { id: 'medium', name: '中等', color: '#f59e0b' },
      { id: 'hard', name: '困难', color: '#ef4444' },
    ],
  },
  {
    id: 'luogu',
    name: '洛谷',
    color: '#22c55e',
    url: 'https://www.luogu.com.cn',
    categories: [
      { id: 'easy', name: '入门', color: '#a3e635' },
      { id: 'normal', name: '普及', color: '#22c55e' },
      { id: 'improve', name: '提高', color: '#14b8a6' },
      { id: 'advanced', name: '省选', color: '#06b6d4' },
    ],
  },
  {
    id: 'acwing',
    name: 'AcWing',
    color: '#3b82f6',
    url: 'https://www.acwing.com',
    categories: [
      { id: 'easy', name: '简单', color: '#22c55e' },
      { id: 'medium', name: '中等', color: '#f59e0b' },
      { id: 'hard', name: '困难', color: '#ef4444' },
    ],
  },
];

// 生成 LeetCode 初始数据（基于爬取的统计：简单20、中等82、困难9）
const generateInitialSubmissions = (): OJSubmission[] => {
  const submissions: OJSubmission[] = [];
  const today = formatDate(new Date());
  const baseTimestamp = Date.now();

  // LeetCode 简单题 20 道
  for (let i = 0; i < 20; i++) {
    submissions.push({
      id: `init_lc_easy_${i}`,
      siteId: 'leetcode',
      categoryId: 'easy',
      problemId: `E${i + 1}`,
      timestamp: baseTimestamp - i * 1000,
      date: today,
    });
  }

  // LeetCode 中等题 82 道
  for (let i = 0; i < 82; i++) {
    submissions.push({
      id: `init_lc_medium_${i}`,
      siteId: 'leetcode',
      categoryId: 'medium',
      problemId: `M${i + 1}`,
      timestamp: baseTimestamp - (20 + i) * 1000,
      date: today,
    });
  }

  // LeetCode 困难题 9 道
  for (let i = 0; i < 9; i++) {
    submissions.push({
      id: `init_lc_hard_${i}`,
      siteId: 'leetcode',
      categoryId: 'hard',
      problemId: `H${i + 1}`,
      timestamp: baseTimestamp - (102 + i) * 1000,
      date: today,
    });
  }

  return submissions;
};

export const OJHeatmapContainer: React.FC<OJHeatmapContainerProps> = ({
  data,
  onUpdateData,
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'year'>('year');
  const [yearMode, setYearMode] = useState<'fixed' | 'recent'>('recent');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<OJSite | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // 截图区域的 ref
  const heatmapRef = useRef<HTMLDivElement>(null);

  // 初始化数据（如果没有网站则使用默认网站和初始数据，或者补充现有网站的分类）
  useEffect(() => {
    if (data.sites.length === 0 && data.submissions.length === 0) {
      // 首次使用：加载默认网站和 LeetCode 初始数据
      onUpdateData({
        sites: DEFAULT_SITES,
        submissions: generateInitialSubmissions(),
      });
    } else if (data.sites.length === 0) {
      // 只有提交记录没有网站配置
      onUpdateData({
        sites: DEFAULT_SITES,
        submissions: data.submissions,
      });
    } else {
      // 检查现有网站是否缺少分类，如果缺少则用默认分类补充
      let needsUpdate = false;
      const updatedSites = data.sites.map(site => {
        if (!site.categories || site.categories.length === 0) {
          const defaultSite = DEFAULT_SITES.find(ds => ds.id === site.id);
          if (defaultSite?.categories) {
            needsUpdate = true;
            return { ...site, categories: defaultSite.categories };
          }
        }
        return site;
      });

      if (needsUpdate) {
        onUpdateData({
          ...data,
          sites: updatedSites,
        });
      }
    }
  }, []);

  // 从提交记录计算热力图数据
  const heatmapData = useMemo(() => {
    const result: Record<string, number> = {};

    data.submissions.forEach(sub => {
      // 跳过元数据记录
      if (sub.categoryId === 'meta') return;

      // 检查是否是汇总记录 "(N次提交)"
      if (sub.problemId.startsWith('(')) {
        const match = sub.problemId.match(/\((\d+)次提交\)/);
        if (match) {
          result[sub.date] = (result[sub.date] || 0) + parseInt(match[1]);
        }
      } else {
        result[sub.date] = (result[sub.date] || 0) + 1;
      }
    });

    return result;
  }, [data.submissions]);

  // 按网站分组提交记录
  const submissionsBySite = useMemo(() => {
    const result: Record<string, OJSubmission[]> = {};

    data.sites.forEach(site => {
      result[site.id] = [];
    });

    data.submissions.forEach(sub => {
      if (result[sub.siteId]) {
        result[sub.siteId].push(sub);
      }
    });

    return result;
  }, [data.sites, data.submissions]);

  // 计算统计数据（与 OJSiteCard 保持一致的逻辑）
  const stats = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const siteStats: Record<string, { submissions: number; problems: number }> = {};
    let totalSubmissions = 0;
    let totalProblems = 0;

    // 近一年的日期范围（使用字符串比较，避免时区问题）
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`;

    data.sites.forEach(site => {
      const siteSubmissions = submissionsBySite[site.id] || [];
      
      // 检查是否有 LeetCode 的元数据统计
      let metaStats: { easy: number; medium: number; hard: number } | null = null;
      if (site.id === 'leetcode') {
        const metaRecord = siteSubmissions.find(s => s.id === 'lc_stats_meta');
        if (metaRecord) {
          const match = metaRecord.problemId.match(/统计:(\d+),(\d+),(\d+)/);
          if (match) {
            metaStats = {
              easy: parseInt(match[1]),
              medium: parseInt(match[2]),
              hard: parseInt(match[3]),
            };
          }
        }
      }

      // 过滤掉元数据和汇总记录，只保留真实提交
      const realSubmissions = siteSubmissions.filter(s =>
        s.categoryId !== 'meta' &&
        s.categoryId !== 'unknown' &&
        !s.problemId.startsWith('(')
      );

      // 根据视图模式过滤时间范围
      let filteredRealSubmissions = realSubmissions;
      let filteredAllSubmissions = siteSubmissions.filter(s => s.categoryId !== 'meta');
      
      if (viewMode === 'year') {
        if (yearMode === 'recent') {
          // 近一年：使用字符串比较
          filteredRealSubmissions = realSubmissions.filter(sub => {
            return sub.date >= oneYearAgoStr && sub.date <= todayStr;
          });
          filteredAllSubmissions = siteSubmissions.filter(sub => {
            if (sub.categoryId === 'meta') return false;
            return sub.date >= oneYearAgoStr && sub.date <= todayStr;
          });
        } else {
          // 固定年份
          filteredRealSubmissions = realSubmissions.filter(sub => {
            const [y] = sub.date.split('-').map(Number);
            return y === year;
          });
          filteredAllSubmissions = siteSubmissions.filter(sub => {
            if (sub.categoryId === 'meta') return false;
            const [y] = sub.date.split('-').map(Number);
            return y === year;
          });
        }
      } else if (viewMode === 'month') {
        filteredRealSubmissions = realSubmissions.filter(sub => {
          const [y, m] = sub.date.split('-').map(Number);
          return y === year && m === month + 1;
        });
        filteredAllSubmissions = siteSubmissions.filter(sub => {
          if (sub.categoryId === 'meta') return false;
          const [y, m] = sub.date.split('-').map(Number);
          return y === year && m === month + 1;
        });
      }

      // 计算不重复的 AC 题目数（与 OJSiteCard 一致）
      let problemCount = 0;
      if (metaStats && viewMode === 'year' && yearMode === 'recent') {
        // 对于近一年视图且有元数据的 LeetCode，使用元数据
        problemCount = metaStats.easy + metaStats.medium + metaStats.hard;
      } else {
        const uniqueProblems = new Set<string>();
        filteredRealSubmissions.forEach(sub => {
          // 使用 categoryId-problemId 作为唯一键，与 OJSiteCard 保持一致
          uniqueProblems.add(`${sub.categoryId}-${sub.problemId}`);
        });
        problemCount = uniqueProblems.size;
      }

      // 计算总提交次数（与 OJSiteCard 一致）
      let submissionCount = 0;
      // 计算汇总记录中的提交次数
      let summaryCount = 0;
      filteredAllSubmissions.forEach(s => {
        if (s.problemId.startsWith('(')) {
          const match = s.problemId.match(/\((\d+)次提交\)/);
          if (match) {
            summaryCount += parseInt(match[1]);
          }
        }
      });
      // 真实记录数（排除汇总记录）+ 汇总数
      const filteredRealForCount = filteredAllSubmissions.filter(s => 
        !s.problemId.startsWith('(')
      );
      submissionCount = filteredRealForCount.length + summaryCount;

      siteStats[site.id] = {
        submissions: submissionCount,
        problems: problemCount,
      };

      totalSubmissions += submissionCount;
      totalProblems += problemCount;
    });

    return { siteStats, totalSubmissions, totalProblems };
  }, [data, submissionsBySite, viewMode, yearMode, currentDate]);

  // 导出为 PNG
  const handleExport = async () => {
    if (!heatmapRef.current) return;

    try {
      const canvas = await html2canvas(heatmapRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const link = document.createElement('a');
      const dateLabel = viewMode === 'month'
        ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`
        : yearMode === 'recent'
          ? '近一年'
          : `${currentDate.getFullYear()}年`;
      link.download = `OJ热力图_${dateLabel}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setFullYear(newDate.getFullYear() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setFullYear(newDate.getFullYear() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(formatDate(new Date()));
  };

  const handleDateClick = (date: string) => {
    setSelectedDate(date === selectedDate ? null : date);
  };

  const handleAddSite = () => {
    setEditingSite(null);
    setIsSiteModalOpen(true);
  };

  const handleEditSite = (site: OJSite) => {
    setEditingSite(site);
    setIsSiteModalOpen(true);
  };

  const handleDeleteSite = (siteId: string) => {
    if (!confirm('确定要删除这个网站吗？相关数据也会被删除。')) return;

    const newSites = data.sites.filter(s => s.id !== siteId);
    const newSubmissions = data.submissions.filter(s => s.siteId !== siteId);

    onUpdateData({
      sites: newSites,
      submissions: newSubmissions,
    });
  };

  const handleSaveSite = (site: OJSite) => {
    let newSites: OJSite[];

    if (editingSite) {
      newSites = data.sites.map(s => s.id === site.id ? site : s);
    } else {
      newSites = [...data.sites, site];
    }

    onUpdateData({
      ...data,
      sites: newSites,
    });
  };

  const handleSubmit = (submission: OJSubmission) => {
    onUpdateData({
      ...data,
      submissions: [...data.submissions, submission],
    });
  };

  // 删除单条提交记录
  const handleDeleteSubmission = (submissionId: string) => {
    onUpdateData({
      ...data,
      submissions: data.submissions.filter(s => s.id !== submissionId),
    });
  };

  // 同步 LeetCode 数据
  const handleSyncLeetCode = (newSubmissions: OJSubmission[], isIncremental: boolean) => {
    if (isIncremental) {
      // 增量同步：保留旧数据，添加新数据（去重）
      const existingIds = new Set(data.submissions.map(s => s.id));
      const uniqueNewSubmissions = newSubmissions.filter(s => !existingIds.has(s.id));
      
      // 更新 meta 信息（统计数据）
      const otherSubmissions = data.submissions.filter(s => s.id !== 'lc_stats_meta');
      const newMeta = newSubmissions.find(s => s.id === 'lc_stats_meta');
      
      onUpdateData({
        ...data,
        submissions: [
          ...otherSubmissions, 
          ...uniqueNewSubmissions.filter(s => s.id !== 'lc_stats_meta'),
          ...(newMeta ? [newMeta] : [])
        ],
      });
    } else {
      // 全量同步：移除旧的 LeetCode 数据，添加新的
      const otherSubmissions = data.submissions.filter(s => s.siteId !== 'leetcode');
      onUpdateData({
        ...data,
        submissions: [...otherSubmissions, ...newSubmissions],
      });
    }
  };

  const getDateLabel = () => {
    if (viewMode === 'month') {
      return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    }
    if (yearMode === 'recent') {
      return '近一年';
    }
    return `${currentDate.getFullYear()}年`;
  };

  // 点击外部关闭设置菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsOpen]);

  return (
    <div className="h-full flex flex-col overflow-auto relative">
      {/* 网站统计卡片区域 */}
      <div className="p-4 pb-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {data.sites.map(site => (
            <OJSiteCard
              key={site.id}
              site={site}
              submissions={submissionsBySite[site.id] || []}
              onEdit={handleEditSite}
              viewMode={viewMode}
              yearMode={yearMode}
              currentDate={currentDate}
            />
          ))}
        </div>
      </div>

      {/* 热力图区域 */}
      <div className="p-4 pt-0 flex-1">
        <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-4 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
          {/* 头部：视图切换 + 日期导航 + 提交按钮 */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            {/* 视图切换 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('month')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    viewMode === 'month'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  月
                </button>
                <button
                  onClick={() => setViewMode('year')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    viewMode === 'year'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  年
                </button>
              </div>

              {/* 年视图模式切换 */}
              {viewMode === 'year' && (
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setYearMode('recent')}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      yearMode === 'recent'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    近一年
                  </button>
                  <button
                    onClick={() => setYearMode('fixed')}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      yearMode === 'fixed'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    固定年份
                  </button>
                </div>
              )}
            </div>

            {/* 日期导航 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToday}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                           bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                今天
              </button>
              {!(viewMode === 'year' && yearMode === 'recent') && (
                <>
                  <button
                    onClick={handlePrevious}
                    className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                               bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 min-w-[100px] text-center">
                    {getDateLabel()}
                  </span>
                  <button
                    onClick={handleNext}
                    className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                               bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              {viewMode === 'year' && yearMode === 'recent' && (
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {getDateLabel()}
                </span>
              )}
            </div>

            {/* 右侧按钮组 */}
            <div className="flex items-center gap-2">
              {/* 统计按钮 */}
              <button
                onClick={() => setIsStatsOpen(!isStatsOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors
                  ${isStatsOpen
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                title="显示统计"
              >
                <BarChart2 className="w-4 h-4" />
                统计
              </button>

              {/* 提交按钮 */}
              <button
                onClick={() => setIsSubmitModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white bg-green-500 hover:bg-green-600 rounded-md transition-colors"
              >
                <Send className="w-4 h-4" />
                提交
              </button>

              {/* 导出按钮 */}
              <button
                onClick={handleExport}
                className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                           bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="导出为PNG"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* 图例 */}
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 ml-2">
                <span>少</span>
                <div className="flex gap-[2px]">
                  <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-700" />
                  <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900" />
                  <div className="w-3 h-3 rounded-sm bg-green-300 dark:bg-green-700" />
                  <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-600" />
                  <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-400" />
                </div>
                <span>多</span>
              </div>
            </div>
          </div>

          {/* 统计面板（可折叠） */}
          {isStatsOpen && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                {viewMode === 'month' ? '本月统计' : yearMode === 'recent' ? '近一年统计' : '本年统计'}
              </h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.sites.map(site => (
                  <div key={site.id} className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: site.color }}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{site.name}</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      {stats.siteStats[site.id]?.problems || 0}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {stats.siteStats[site.id]?.submissions || 0} 次提交
                    </div>
                  </div>
                ))}
                <div className="text-center border-l border-gray-200 dark:border-gray-600 pl-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">总计</div>
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">
                    {stats.totalProblems}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {stats.totalSubmissions} 次提交
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 热力图 */}
          <div ref={heatmapRef} className="p-2 bg-white dark:bg-gray-800 rounded-lg">
            <OJHeatmap
              data={heatmapData}
              viewMode={viewMode}
              yearMode={yearMode}
              currentDate={currentDate}
              selectedDate={selectedDate}
              onDateClick={handleDateClick}
            />
          </div>

          {/* 选中日期的提交记录 */}
          {selectedDate && (() => {
            // 过滤出当天的记录，排除元数据
            const daySubmissions = data.submissions.filter(s =>
              s.date === selectedDate && s.categoryId !== 'meta'
            );
            // 分离详细记录和汇总记录
            const detailRecords = daySubmissions.filter(s => !s.problemId.startsWith('('));
            const summaryRecord = daySubmissions.find(s => s.problemId.startsWith('('));
            // 计算总提交次数
            let totalCount = detailRecords.length;
            if (summaryRecord) {
              const match = summaryRecord.problemId.match(/\((\d+)次提交\)/);
              if (match) totalCount += parseInt(match[1]);
            }

            return (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {selectedDate} 的提交记录
                  </h5>
                  <span className="text-xs text-gray-400">
                    {totalCount} 次提交
                  </span>
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {detailRecords
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map(sub => {
                      const site = data.sites.find(s => s.id === sub.siteId);
                      const category = site?.categories?.find(c => c.id === sub.categoryId);
                      return (
                        <div
                          key={sub.id}
                          className="flex items-center gap-2 py-1 text-sm"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: site?.color || '#gray' }}
                          />
                          <span className="text-gray-600 dark:text-gray-300">{site?.name}</span>
                          {category && (
                            <span
                              className="px-1.5 py-0.5 text-xs rounded"
                              style={{ backgroundColor: category.color + '20', color: category.color }}
                            >
                              {category.name}
                            </span>
                          )}
                          <span className="text-gray-900 dark:text-white font-medium">
                            {sub.problemId}
                            {sub.problemTitle && (
                              <span className="text-gray-500 dark:text-gray-400 font-normal ml-1">
                                {sub.problemTitle}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {new Date(sub.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button
                            onClick={() => handleDeleteSubmission(sub.id)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-1"
                            title="删除此记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  {/* 显示未获取到详情的提交数 */}
                  {summaryRecord && (
                    <div className="flex items-center gap-2 py-1 text-sm text-gray-400 italic">
                      <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                      <span>{summaryRecord.problemId.replace('(', '还有 ').replace('次提交)', ' 次提交未获取详情')}</span>
                    </div>
                  )}
                  {daySubmissions.length === 0 && (
                    <div className="text-center text-sm text-gray-400 py-2">
                      暂无提交记录
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 网站编辑模态框 */}
      <OJSiteModal
        isOpen={isSiteModalOpen}
        onClose={() => setIsSiteModalOpen(false)}
        onSave={handleSaveSite}
        onDelete={handleDeleteSite}
        editingSite={editingSite}
      />

      {/* 提交记录模态框 */}
      <OJSubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmit={handleSubmit}
        sites={data.sites}
      />

      {/* LeetCode 同步模态框 */}
      <LeetCodeSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSync={handleSyncLeetCode}
        existingSubmissions={data.submissions.filter(s => s.siteId === 'leetcode')}
      />

      {/* 右下角设置按钮 */}
      <div ref={settingsRef} className="fixed bottom-6 right-6 z-40">
        {/* 设置菜单 */}
        {isSettingsOpen && (
          <div className="absolute bottom-12 right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]">
            <button
              onClick={() => {
                setIsSyncModalOpen(true);
                setIsSettingsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-orange-500" />
              同步 LeetCode
            </button>
            <button
              onClick={() => {
                handleAddSite();
                setIsSettingsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Plus className="w-4 h-4 text-blue-500" />
              添加网站
            </button>
          </div>
        )}

        {/* 设置按钮 */}
        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className={`p-3 rounded-full shadow-lg transition-all duration-200 ${
            isSettingsOpen
              ? 'bg-gray-700 text-white rotate-90'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          } border border-gray-200 dark:border-gray-700`}
          title="设置"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default OJHeatmapContainer;
