import React, { useMemo, useState, useEffect } from 'react';

interface OJHeatmapProps {
  data: Record<string, number>; // 合并后的数据：{ "2025-01-06": 5 }
  viewMode: 'month' | 'year';
  yearMode?: 'fixed' | 'recent'; // 固定年份 或 近一年
  currentDate: Date;
  selectedDate: string | null;
  onDateClick: (date: string) => void;
}

// 获取热力值对应的颜色类（基于做题数量）
const getHeatColor = (value: number | undefined): string => {
  if (value === undefined || value === 0) {
    return 'bg-gray-100 dark:bg-gray-700';
  }
  if (value <= 2) {
    return 'bg-green-200 dark:bg-green-900';
  }
  if (value <= 5) {
    return 'bg-green-300 dark:bg-green-700';
  }
  if (value <= 9) {
    return 'bg-green-400 dark:bg-green-600';
  }
  return 'bg-green-600 dark:bg-green-400';
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

  // 获取第一天是星期几（0=周日，转换为周一=0）
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const weeks: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];

  // 填充第一周前面的空白
  for (let i = 0; i < startDay; i++) {
    currentWeek.push(null);
  }

  // 填充日期
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(new Date(year, month, day));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // 填充最后一周的空白
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
};

// 获取年度日历数据（按列组织，每列是一周，类似 GitHub 贡献图）
const getYearCalendar = (year: number): (Date | null)[][] => {
  const columns: (Date | null)[][] = [];

  // 从1月1日开始
  const startDate = new Date(year, 0, 1);
  // 到12月31日结束
  const endDate = new Date(year, 11, 31);

  // 获取1月1日是周几（0=周日，转换为周一=0的索引）
  let startDayOfWeek = startDate.getDay() - 1;
  if (startDayOfWeek < 0) startDayOfWeek = 6;

  // 第一列：填充1月1日之前的空白
  let currentColumn: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    currentColumn.push(null);
  }

  // 遍历全年每一天
  const current = new Date(startDate);
  while (current <= endDate) {
    currentColumn.push(new Date(current));

    // 如果是周日（一列结束，7天），开始新的一列
    if (currentColumn.length === 7) {
      columns.push(currentColumn);
      currentColumn = [];
    }

    current.setDate(current.getDate() + 1);
  }

  // 最后一列：填充12月31日之后的空白
  if (currentColumn.length > 0) {
    while (currentColumn.length < 7) {
      currentColumn.push(null);
    }
    columns.push(currentColumn);
  }

  return columns;
};

// 获取近一年日历数据（从今天往前推365天）
const getRecentYearCalendar = (): { columns: (Date | null)[][], monthLabels: { month: string, position: number }[] } => {
  const columns: (Date | null)[][] = [];
  const monthLabels: { month: string, position: number }[] = [];

  const today = new Date();
  // 从一年前开始
  const startDate = new Date(today);
  startDate.setFullYear(startDate.getFullYear() - 1);
  startDate.setDate(startDate.getDate() + 1); // 从一年前的明天开始

  // 调整到该周的周一
  let dayOfWeek = startDate.getDay() - 1;
  if (dayOfWeek < 0) dayOfWeek = 6;
  startDate.setDate(startDate.getDate() - dayOfWeek);

  // 第一列
  let currentColumn: (Date | null)[] = [];
  let lastMonth = -1;
  let colIndex = 0;

  // 遍历到今天
  const current = new Date(startDate);
  while (current <= today) {
    // 检查是否需要记录月份标签
    if (current.getMonth() !== lastMonth) {
      const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
      monthLabels.push({ month: monthNames[current.getMonth()], position: colIndex });
      lastMonth = current.getMonth();
    }

    currentColumn.push(new Date(current));

    // 如果是周日（一列结束，7天），开始新的一列
    if (currentColumn.length === 7) {
      columns.push(currentColumn);
      currentColumn = [];
      colIndex++;
    }

    current.setDate(current.getDate() + 1);
  }

  // 最后一列：填充剩余空白
  if (currentColumn.length > 0) {
    while (currentColumn.length < 7) {
      currentColumn.push(null);
    }
    columns.push(currentColumn);
  }

  return { columns, monthLabels };
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export const OJHeatmap: React.FC<OJHeatmapProps> = ({
  data,
  viewMode,
  yearMode = 'recent',
  currentDate,
  selectedDate,
  onDateClick,
}) => {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  // 用于追踪今天的日期，确保跨午夜时自动更新
  const [today, setToday] = useState<string>(() => formatDate(new Date()));

  // 每分钟检查一次日期是否变化
  useEffect(() => {
    const checkDateChange = () => {
      const newToday = formatDate(new Date());
      if (newToday !== today) {
        setToday(newToday);
      }
    };

    // 每分钟检查一次
    const interval = setInterval(checkDateChange, 60000);
    return () => clearInterval(interval);
  }, [today]);

  const monthCalendar = useMemo(() => {
    if (viewMode !== 'month') return [];
    return getMonthCalendar(currentDate.getFullYear(), currentDate.getMonth());
  }, [viewMode, currentDate]);

  const yearCalendar = useMemo(() => {
    if (viewMode !== 'year' || yearMode !== 'fixed') return [];
    return getYearCalendar(currentDate.getFullYear());
  }, [viewMode, yearMode, currentDate]);

  const recentYearCalendar = useMemo(() => {
    if (viewMode !== 'year' || yearMode !== 'recent') return { columns: [], monthLabels: [] };
    return getRecentYearCalendar();
  }, [viewMode, yearMode, today]); // 添加 today 依赖，跨午夜时自动更新

  const renderDayCell = (date: Date | null, isYearView: boolean = false) => {
    if (!date) {
      return (
        <div
          className={`${isYearView ? 'w-full aspect-square' : 'w-8 h-8'} rounded-sm`}
        />
      );
    }

    const dateStr = formatDate(date);
    const value = data[dateStr];
    const isSelected = selectedDate === dateStr;
    const isHovered = hoveredDate === dateStr;
    const isToday = today === dateStr;

    return (
      <div
        className={`
          ${isYearView ? 'w-full aspect-square' : 'w-8 h-8'}
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
          <span className={`${value && value > 5 ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
            {date.getDate()}
          </span>
        )}

        {/* Tooltip */}
        {isHovered && (
          <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1
                          bg-gray-800 text-white text-xs rounded shadow-lg whitespace-nowrap">
            <div>{dateStr}</div>
            <div>{value !== undefined ? `${value} 次提交` : '无数据'}</div>
          </div>
        )}
      </div>
    );
  };

  // 渲染固定年份视图
  const renderFixedYearView = () => {
    // 计算每个月份的起始列索引
    const monthPositions: { month: string, colIndex: number }[] = [];
    let lastMonth = -1;
    yearCalendar.forEach((column, colIndex) => {
      const firstValidDate = column.find(d => d !== null);
      if (firstValidDate && firstValidDate.getMonth() !== lastMonth) {
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        monthPositions.push({ month: monthNames[firstValidDate.getMonth()], colIndex });
        lastMonth = firstValidDate.getMonth();
      }
    });

    const totalCols = yearCalendar.length;

    return (
      <div className="w-full">
        {/* 月份标签 - 放在顶部 */}
        <div className="flex h-5 mb-1 text-[10px] text-gray-500 ml-5">
          {monthPositions.map((label, index) => {
            const nextPosition = monthPositions[index + 1]?.colIndex || totalCols;
            const widthPercent = ((nextPosition - label.colIndex) / totalCols) * 100;
            return (
              <div
                key={index}
                className="shrink-0"
                style={{ width: `${widthPercent}%` }}
              >
                {label.month}
              </div>
            );
          })}
        </div>

        {/* 年视图 - 类似 GitHub 贡献图 */}
        <div className="flex w-full">
          {/* 星期标签 */}
          <div className="flex flex-col justify-between mr-1 text-[10px] text-gray-500 shrink-0 py-[2px]" style={{ width: 16 }}>
            <div className="h-[calc((100%-12px)/7)] flex items-center">一</div>
            <div className="h-[calc((100%-12px)/7)] flex items-center"></div>
            <div className="h-[calc((100%-12px)/7)] flex items-center">三</div>
            <div className="h-[calc((100%-12px)/7)] flex items-center"></div>
            <div className="h-[calc((100%-12px)/7)] flex items-center">五</div>
            <div className="h-[calc((100%-12px)/7)] flex items-center"></div>
            <div className="h-[calc((100%-12px)/7)] flex items-center">日</div>
          </div>

          {/* 周网格 - 自适应宽度 */}
          <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${totalCols}, 1fr)` }}>
            {yearCalendar.map((column, colIndex) => (
              <div
                key={colIndex}
                className="flex flex-col gap-[2px]"
              >
                {column.map((date, dayIndex) => (
                  <div key={dayIndex}>
                    {renderDayCell(date, true)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 渲染近一年视图
  const renderRecentYearView = () => {
    const { columns, monthLabels } = recentYearCalendar;
    const totalCols = columns.length;

    // 计算每个月的宽度百分比
    const monthWidths: { month: string, widthPercent: number }[] = [];
    for (let i = 0; i < monthLabels.length; i++) {
      const currentPos = monthLabels[i].position;
      const nextPos = monthLabels[i + 1]?.position || totalCols;
      monthWidths.push({
        month: monthLabels[i].month,
        widthPercent: ((nextPos - currentPos) / totalCols) * 100,
      });
    }

    return (
      <div className="w-full">
        {/* 月份标签 - 放在顶部 */}
        <div className="flex h-5 mb-1 text-[10px] text-gray-500 ml-5">
          {monthWidths.map((label, index) => (
            <div
              key={index}
              className="shrink-0"
              style={{ width: `${label.widthPercent}%` }}
            >
              {label.month}
            </div>
          ))}
        </div>

        {/* 年视图 - 近一年 */}
        <div className="flex w-full">
          {/* 星期标签 */}
          <div className="flex flex-col justify-between mr-1 text-[10px] text-gray-500 shrink-0 py-[2px]" style={{ width: 16 }}>
            <div className="h-[calc((100%-12px)/7)] flex items-center">一</div>
            <div className="h-[calc((100%-12px)/7)] flex items-center"></div>
            <div className="h-[calc((100%-12px)/7)] flex items-center">三</div>
            <div className="h-[calc((100%-12px)/7)] flex items-center"></div>
            <div className="h-[calc((100%-12px)/7)] flex items-center">五</div>
            <div className="h-[calc((100%-12px)/7)] flex items-center"></div>
            <div className="h-[calc((100%-12px)/7)] flex items-center">日</div>
          </div>

          {/* 周网格 - 自适应宽度 */}
          <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${totalCols}, 1fr)` }}>
            {columns.map((column, colIndex) => (
              <div
                key={colIndex}
                className="flex flex-col gap-[2px]"
              >
                {column.map((date, dayIndex) => (
                  <div key={dayIndex}>
                    {renderDayCell(date, true)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mb-4">
      {viewMode === 'month' ? (
        <div>
          {/* 星期头部 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((day) => (
              <div key={day} className="w-8 h-6 flex items-center justify-center text-xs text-gray-500">
                {day}
              </div>
            ))}
          </div>

          {/* 日历网格 */}
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
        yearMode === 'fixed' ? renderFixedYearView() : renderRecentYearView()
      )}
    </div>
  );
};

export default OJHeatmap;
