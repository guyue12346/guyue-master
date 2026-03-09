import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CalendarDays, X, Save, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import type { HeatmapData } from '../../types';

interface CoupleHeatmapContainerProps {
  heatmapData: HeatmapData;
  onUpdateHeatmap: (person: 'guyue' | 'xiaohong', date: string, value: number) => void;
}

// 获取热力值对应的颜色类
const getHeatColor = (value: number | undefined): string => {
  if (value === undefined || value === 0) {
    return 'bg-gray-100 dark:bg-gray-700';
  }
  if (value <= 25) {
    return 'bg-green-200 dark:bg-green-900';
  }
  if (value <= 50) {
    return 'bg-green-300 dark:bg-green-700';
  }
  if (value <= 75) {
    return 'bg-green-400 dark:bg-green-600';
  }
  return 'bg-green-500 dark:bg-green-500';
};

// 格式化日期为 YYYY-MM-DD
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 获取月份的日历数据
const getMonthCalendar = (year: number, month: number): (Date | null)[][] => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const weeks: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];

  for (let i = 0; i < startDay; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(new Date(year, month, day));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
};

// 获取年度日历数据
const getYearCalendar = (year: number): (Date | null)[][] => {
  const columns: (Date | null)[][] = [];
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  let startDayOfWeek = startDate.getDay() - 1;
  if (startDayOfWeek < 0) startDayOfWeek = 6;

  let currentColumn: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    currentColumn.push(null);
  }

  let current = new Date(startDate);
  while (current <= endDate) {
    currentColumn.push(new Date(current));
    if (currentColumn.length === 7) {
      columns.push(currentColumn);
      currentColumn = [];
    }
    current.setDate(current.getDate() + 1);
  }

  if (currentColumn.length > 0) {
    while (currentColumn.length < 7) {
      currentColumn.push(null);
    }
    columns.push(currentColumn);
  }

  return columns;
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

// 单个热力图组件
interface HeatmapProps {
  name: string;
  data: Record<string, number>;
  viewMode: 'month' | 'year';
  currentDate: Date;
  selectedDate: string | null;
  onDateClick: (date: string) => void;
}

const Heatmap: React.FC<HeatmapProps> = ({
  name,
  data,
  viewMode,
  currentDate,
  selectedDate,
  onDateClick,
}) => {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const monthCalendar = useMemo(() => {
    if (viewMode !== 'month') return [];
    return getMonthCalendar(currentDate.getFullYear(), currentDate.getMonth());
  }, [viewMode, currentDate]);

  const yearCalendar = useMemo(() => {
    if (viewMode !== 'year') return [];
    return getYearCalendar(currentDate.getFullYear());
  }, [viewMode, currentDate]);

  const renderDayCell = (date: Date | null, isYearView: boolean = false) => {
    if (!date) {
      return (
        <div className={`${isYearView ? 'w-3 h-3' : 'w-8 h-8'} rounded-sm`} />
      );
    }

    const dateStr = formatDate(date);
    const value = data[dateStr];
    const isSelected = selectedDate === dateStr;
    const isToday = formatDate(new Date()) === dateStr;

    return (
      <div
        className={`
          ${isYearView ? 'w-3 h-3' : 'w-8 h-8'}
          rounded-sm cursor-pointer transition-all duration-150
          ${getHeatColor(value)}
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
          ${isToday ? 'ring-1 ring-purple-400' : ''}
          hover:ring-2 hover:ring-gray-400
          relative
          ${!isYearView ? 'flex items-center justify-center text-xs' : ''}
        `}
        onClick={() => onDateClick(dateStr)}
        onMouseEnter={() => setHoveredDate(dateStr)}
        onMouseLeave={() => setHoveredDate(null)}
      >
        {!isYearView && (
          <span className={`${value && value > 50 ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
            {date.getDate()}
          </span>
        )}

        {hoveredDate === dateStr && (
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1
                          bg-gray-800 text-white text-xs rounded shadow-lg whitespace-nowrap">
            <div>{dateStr}</div>
            <div>{value !== undefined ? `${value}` : '无数据'}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{name}</h4>

      {viewMode === 'month' ? (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((day) => (
              <div key={day} className="w-8 h-6 flex items-center justify-center text-xs text-gray-500">
                {day}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {monthCalendar.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((date, dayIndex) => (
                  <div key={dayIndex}>
                    {renderDayCell(date, false)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex">
            <div className="flex flex-col gap-[2px] mr-1 text-[10px] text-gray-500">
              <div className="h-3 leading-3">一</div>
              <div className="h-3 leading-3"></div>
              <div className="h-3 leading-3">三</div>
              <div className="h-3 leading-3"></div>
              <div className="h-3 leading-3">五</div>
              <div className="h-3 leading-3"></div>
              <div className="h-3 leading-3">日</div>
            </div>

            <div className="flex gap-[2px] overflow-x-auto">
              {yearCalendar.map((column, colIndex) => {
                const hasFirstOfMonth = column.some(date => date && date.getDate() === 1);
                const needsGap = hasFirstOfMonth && colIndex > 0;

                return (
                  <div
                    key={colIndex}
                    className={`flex flex-col gap-[2px] ${needsGap ? 'ml-2' : ''}`}
                  >
                    {column.map((date, dayIndex) => (
                      <div key={dayIndex}>
                        {renderDayCell(date, true)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex mt-1 ml-4 text-[10px] text-gray-500">
            {['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'].map((month, index) => (
              <div key={index} style={{ width: `${100 / 12}%` }}>{month}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const CoupleHeatmapContainer: React.FC<CoupleHeatmapContainerProps> = ({
  heatmapData,
  onUpdateHeatmap,
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const heatmapRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!heatmapRef.current) return;

    try {
      const canvas = await html2canvas(heatmapRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const link = document.createElement('a');
      link.download = `热力图_${viewMode === 'month' ? `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月` : `${currentDate.getFullYear()}年`}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  const [guyueValue, setGuyueValue] = useState<string>('');
  const [xiaohongValue, setXiaohongValue] = useState<string>('');

  const heatStats = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    let guyueTotal = 0;
    let xiaohongTotal = 0;

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

    setSelectedDate(null);
  };

  const getDateLabel = () => {
    if (viewMode === 'month') {
      return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    }
    return `${currentDate.getFullYear()}年`;
  };

  const formatSelectedDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
  };

  return (
    <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-4 mb-4 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
        {/* 头部：视图切换 + 日期导航 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
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
              <div className="w-3 h-3 rounded-sm bg-green-500" />
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

export default CoupleHeatmapContainer;
