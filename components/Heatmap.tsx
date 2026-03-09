import React, { useMemo, useState } from 'react';

interface HeatmapProps {
  name: string;
  data: Record<string, number>;
  viewMode: 'month' | 'year';
  currentDate: Date;
  selectedDate: string | null;
  onDateClick: (date: string) => void;
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
  let current = new Date(startDate);
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

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export const Heatmap: React.FC<HeatmapProps> = ({
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
        <div
          className={`${isYearView ? 'w-3 h-3' : 'w-8 h-8'} rounded-sm`}
        />
      );
    }

    const dateStr = formatDate(date);
    const value = data[dateStr];
    const isSelected = selectedDate === dateStr;
    const isHovered = hoveredDate === dateStr;
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

        {/* Tooltip */}
        {isHovered && (
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
        <div>
          {/* 年视图 - 类似 GitHub 贡献图 */}
          <div className="flex">
            {/* 星期标签 */}
            <div className="flex flex-col gap-[2px] mr-1 text-[10px] text-gray-500">
              <div className="h-3 leading-3">一</div>
              <div className="h-3 leading-3"></div>
              <div className="h-3 leading-3">三</div>
              <div className="h-3 leading-3"></div>
              <div className="h-3 leading-3">五</div>
              <div className="h-3 leading-3"></div>
              <div className="h-3 leading-3">日</div>
            </div>

            {/* 周网格 */}
            <div className="flex gap-[2px] overflow-x-auto">
              {yearCalendar.map((column, colIndex) => {
                // 检查这一列是否包含某月的第1天（新月份开始）
                const hasFirstOfMonth = column.some(date => date && date.getDate() === 1);
                // 第一列不需要额外间隔
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

          {/* 月份标签 */}
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

export default Heatmap;
