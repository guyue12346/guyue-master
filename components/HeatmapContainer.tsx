import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, X, Save, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Heatmap } from './Heatmap';
import type { HeatmapData } from '../types';

interface HeatmapContainerProps {
  heatmapData: HeatmapData;
  onUpdateHeatmap: (person: 'guyue' | 'xiaohong', date: string, value: number) => void;
}

// 格式化日期为 YYYY-MM-DD
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const HeatmapContainer: React.FC<HeatmapContainerProps> = ({
  heatmapData,
  onUpdateHeatmap,
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 截图区域的 ref
  const heatmapRef = useRef<HTMLDivElement>(null);

  // 导出为PNG
  const handleExport = async () => {
    if (!heatmapRef.current) return;

    try {
      const canvas = await html2canvas(heatmapRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // 高清
      });

      const link = document.createElement('a');
      link.download = `热力图_${viewMode === 'month' ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月` : `${currentDate.getFullYear()}年`}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  // 编辑面板的值
  const [guyueValue, setGuyueValue] = useState<string>('');
  const [xiaohongValue, setXiaohongValue] = useState<string>('');

  // 计算当前视图的热力值统计
  const heatStats = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    let guyueTotal = 0;
    let xiaohongTotal = 0;

    // 遍历数据，筛选当前视图范围内的日期
    Object.entries(heatmapData.guyue).forEach(([dateStr, value]) => {
      const [y, m] = dateStr.split('-').map(Number);
      if (viewMode === 'year' && y === year) {
        guyueTotal += value;
      } else if (viewMode === 'month' && y === year && m === month + 1) {
        guyueTotal += value;
      }
    });

    Object.entries(heatmapData.xiaohong).forEach(([dateStr, value]) => {
      const [y, m] = dateStr.split('-').map(Number);
      if (viewMode === 'year' && y === year) {
        xiaohongTotal += value;
      } else if (viewMode === 'month' && y === year && m === month + 1) {
        xiaohongTotal += value;
      }
    });

    const total = guyueTotal + xiaohongTotal;
    const guyuePercent = total > 0 ? (guyueTotal / total) * 100 : 50;
    const xiaohongPercent = total > 0 ? (xiaohongTotal / total) * 100 : 50;

    return { guyueTotal, xiaohongTotal, total, guyuePercent, xiaohongPercent };
  }, [heatmapData, viewMode, currentDate]);

  // 当选中日期变化时，更新输入框的值
  useEffect(() => {
    if (selectedDate) {
      const gv = heatmapData.guyue[selectedDate];
      const xv = heatmapData.xiaohong[selectedDate];
      setGuyueValue(gv !== undefined ? String(gv) : '');
      setXiaohongValue(xv !== undefined ? String(xv) : '');
    } else {
      setGuyueValue('');
      setXiaohongValue('');
    }
  }, [selectedDate, heatmapData]);

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
    setSelectedDate(date);
  };

  const handleSave = () => {
    if (!selectedDate) return;

    const gv = guyueValue.trim() === '' ? 0 : parseInt(guyueValue, 10);
    const xv = xiaohongValue.trim() === '' ? 0 : parseInt(xiaohongValue, 10);

    // 验证输入值
    if (isNaN(gv) || gv < 0 || gv > 100) {
      alert('古月的值必须是 0-100 之间的数字');
      return;
    }
    if (isNaN(xv) || xv < 0 || xv > 100) {
      alert('小红的值必须是 0-100 之间的数字');
      return;
    }

    onUpdateHeatmap('guyue', selectedDate, gv);
    onUpdateHeatmap('xiaohong', selectedDate, xv);

    // 保存后隐藏编辑面板
    setSelectedDate(null);
  };

  const getDateLabel = () => {
    if (viewMode === 'month') {
      return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    }
    return `${currentDate.getFullYear()}年`;
  };

  // 格式化选中日期的显示
  const formatSelectedDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
  };

  return (
    <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-4 mb-4 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
      {/* 头部：视图切换 + 日期导航 */}
      <div className="flex items-center justify-between mb-4">
        {/* 视图切换 */}
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

        {/* 日期导航 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                       bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            今天
          </button>
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
          <button
            onClick={handleExport}
            className="ml-2 p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white
                       bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="导出为PNG"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* 图例 */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
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

      {/* 主体：热力图 + 侧边面板 */}
      <div ref={heatmapRef} className="flex gap-4 p-2 bg-white dark:bg-gray-800 rounded-lg">
        {/* 热力图区域 */}
        <div className={`flex-1 ${viewMode === 'year' ? 'flex flex-col items-center' : ''}`}>
          <Heatmap
            name="古月"
            data={heatmapData.guyue}
            viewMode={viewMode}
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateClick={handleDateClick}
          />
          <Heatmap
            name="小红"
            data={heatmapData.xiaohong}
            viewMode={viewMode}
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateClick={handleDateClick}
          />
        </div>

        {/* 侧边面板 */}
        {selectedDate ? (
          // 编辑面板
          <div className="w-48 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-200">
                编辑数据
              </h5>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {formatSelectedDate(selectedDate)}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                  古月
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={guyueValue}
                  onChange={(e) => setGuyueValue(e.target.value)}
                  placeholder="0-100"
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600
                             rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                  小红
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={xiaohongValue}
                  onChange={(e) => setXiaohongValue(e.target.value)}
                  placeholder="0-100"
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600
                             rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={handleSave}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2
                           bg-green-500 hover:bg-green-600 text-white text-sm font-medium
                           rounded-md transition-colors"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        ) : (
          // 占比统计竖条 - 炫酷版
          <div className="w-12 shrink-0 flex flex-col items-center">
            <div
              className="flex-1 w-6 rounded-full overflow-hidden flex flex-col-reverse relative"
              style={{
                background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.05) 100%)',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1), 0 0 20px rgba(0,0,0,0.05)'
              }}
            >
              {/* 小红的部分（下方）- 玫瑰金/紫罗兰 */}
              <div
                className="w-full transition-all duration-500 relative overflow-hidden"
                style={{
                  height: `${heatStats.xiaohongPercent}%`,
                  background: 'linear-gradient(180deg, #c4b5fd 0%, #a78bfa 50%, #8b5cf6 100%)',
                  boxShadow: '0 0 20px rgba(167,139,250,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              </div>
              {/* 古月的部分（上方）- 琥珀金/香槟 */}
              <div
                className="w-full transition-all duration-500 relative overflow-hidden"
                style={{
                  height: `${heatStats.guyuePercent}%`,
                  background: 'linear-gradient(180deg, #fcd34d 0%, #f59e0b 50%, #d97706 100%)',
                  boxShadow: '0 0 20px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              </div>
              {/* 分割线光效 */}
              <div
                className="absolute left-0 right-0 h-[2px] pointer-events-none"
                style={{
                  bottom: `${heatStats.xiaohongPercent}%`,
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
                  boxShadow: '0 0 10px rgba(255,255,255,0.6)'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeatmapContainer;
