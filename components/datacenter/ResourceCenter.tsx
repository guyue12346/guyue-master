import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, ExternalLink, Clock, HardDrive, DollarSign, Zap, FolderPlus, X, Save, AlertTriangle, CheckCircle, Settings, LayoutGrid, List, Timer, Calendar, User, Bell, XCircle, AlertCircle } from 'lucide-react';
import * as Icons from 'lucide-react';
import type { ResourceCenterData, ResourceCategory, ResourceItem } from '../../types';

interface ResourceCenterProps {
  data: ResourceCenterData;
  onUpdateData: (data: ResourceCenterData) => void;
}

// 默认分类
const DEFAULT_CATEGORIES: ResourceCategory[] = [
  { id: 'cloud', name: '云盘资源', icon: 'Cloud', color: '#3b82f6' },
  { id: 'ai', name: 'AI资源', icon: 'Bot', color: '#8b5cf6' },
  { id: 'server', name: '服务器', icon: 'Server', color: '#22c55e' },
  { id: 'domain', name: '域名', icon: 'Globe', color: '#f59e0b' },
  { id: 'subscription', name: '订阅服务', icon: 'CreditCard', color: '#ec4899' },
];

// 计算剩余天数
const getDaysRemaining = (expireDate: string): number => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expire = new Date(expireDate);
  const diff = expire.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// 获取剩余时间状态
const getTimeStatus = (days: number): { color: string; label: string; bgColor: string } => {
  if (days < 0) return { color: 'text-gray-500', label: '已过期', bgColor: 'bg-gray-100 dark:bg-gray-700' };
  if (days <= 7) return { color: 'text-red-500', label: '即将到期', bgColor: 'bg-red-50 dark:bg-red-900/20' };
  if (days <= 30) return { color: 'text-yellow-500', label: '注意续费', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20' };
  return { color: 'text-green-500', label: '正常', bgColor: 'bg-green-50 dark:bg-green-900/20' };
};

// 格式化剩余时间
const formatDaysRemaining = (days: number): string => {
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天到期';
  if (days < 30) return `${days} 天`;
  if (days < 365) return `${Math.floor(days / 30)} 个月 ${days % 30} 天`;
  return `${Math.floor(days / 365)} 年 ${Math.floor((days % 365) / 30)} 个月`;
};

// 动态获取图标
const DynamicIcon: React.FC<{ name: string; className?: string; style?: React.CSSProperties }> = ({ name, className, style }) => {
  const IconComponent = (Icons as any)[name];
  if (!IconComponent) return <Icons.HelpCircle className={className} style={style} />;
  return <IconComponent className={className} style={style} />;
};

// 格式化总时间显示
const formatTotalTime = (totalTime: { value: number; unit: 'day' | 'month' | 'year' }): string => {
  const unitMap = { day: '天', month: '个月', year: '年' };
  return `${totalTime.value} ${unitMap[totalTime.unit]}`;
};

// 计算时间占比（基于总时间和剩余时间）
const getTimePercent = (expireDate: string, totalTime?: { value: number; unit: 'day' | 'month' | 'year' }): number | null => {
  if (!totalTime) return null;
  const daysRemaining = getDaysRemaining(expireDate);
  // 将总时间转换为天数
  let totalDays = totalTime.value;
  if (totalTime.unit === 'month') totalDays *= 30;
  if (totalTime.unit === 'year') totalDays *= 365;
  
  if (totalDays <= 0) return null;
  const usedPercent = ((totalDays - Math.max(0, daysRemaining)) / totalDays) * 100;
  return Math.min(100, Math.max(0, usedPercent));
};

// 统一资源卡片组件 - 支持精简/详细视图切换
const ResourceCard: React.FC<{
  item: ResourceItem;
  category: ResourceCategory;
  onEdit: () => void;
  onDelete: () => void;
  onToggleReminder: () => void;
}> = ({ item, category, onEdit, onDelete, onToggleReminder }) => {
  const [isCompact, setIsCompact] = useState(true); // 默认精简视图
  
  const daysRemaining = item.expireDate ? getDaysRemaining(item.expireDate) : null;
  const timeStatus = daysRemaining !== null ? getTimeStatus(daysRemaining) : null;
  const capacityPercent = item.capacity ? (item.capacity.used / item.capacity.total) * 100 : null;
  const quotaPercent = item.quota ? (item.quota.used / item.quota.total) * 100 : null;
  const timePercent = item.expireDate ? getTimePercent(item.expireDate, item.totalTime) : null;

  // 圆环组件
  const Ring: React.FC<{ percent: number; color: string; size?: number; label?: string }> = 
    ({ percent, color, size = 56, label }) => {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;
    
    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg className="transform -rotate-90" style={{ width: size, height: size }}>
            <circle 
              cx={size/2} cy={size/2} r={radius} 
              fill="none" stroke="currentColor" strokeWidth="4" 
              className="text-gray-200 dark:text-gray-700" 
            />
            <circle 
              cx={size/2} cy={size/2} r={radius} 
              fill="none" strokeWidth="4" 
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              style={{ stroke: color }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
              {Math.round(100 - percent)}%
            </span>
          </div>
        </div>
        {label && <span className="text-[10px] text-gray-500 mt-1">{label}</span>}
      </div>
    );
  };

  // 多环组件 - 同心圆环
  const MultiRing: React.FC<{ 
    indicators: Array<{ percent: number; color: string; label: string }>;
    size?: number;
  }> = ({ indicators, size = 100 }) => {
    const count = indicators.length;
    const strokeWidth = count === 2 ? 8 : 6;
    const gap = 2;
    
    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg className="transform -rotate-90" style={{ width: size, height: size }}>
            {indicators.map((indicator, index) => {
              const offset = index * (strokeWidth + gap);
              const radius = (size - strokeWidth) / 2 - offset;
              const circumference = 2 * Math.PI * radius;
              const strokeDasharray = `${(indicator.percent / 100) * circumference} ${circumference}`;
              
              return (
                <g key={index}>
                  <circle 
                    cx={size/2} cy={size/2} r={radius} 
                    fill="none" stroke="currentColor" strokeWidth={strokeWidth}
                    className="text-gray-200 dark:text-gray-700" 
                  />
                  <circle 
                    cx={size/2} cy={size/2} r={radius} 
                    fill="none" strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeLinecap="round"
                    style={{ stroke: indicator.color }}
                  />
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <div className="text-xs text-gray-700 dark:text-gray-200">
              {indicators.map((ind, i) => (
                <div key={i} className="leading-tight">
                  <span className="font-bold" style={{ color: ind.color }}>
                    {Math.round(100 - ind.percent)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* 图例 */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 justify-center text-[10px]">
          {indicators.map((indicator, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: indicator.color }} />
              <span className="text-gray-500">{indicator.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 获取颜色
  const getColor = (percent: number, type: 'capacity' | 'quota' | 'time') => {
    const remaining = 100 - percent;
    if (remaining <= 10) return '#ef4444';
    if (remaining <= 30) return '#f59e0b';
    if (type === 'capacity') return '#3b82f6';
    if (type === 'quota') return '#8b5cf6';
    return '#22c55e';
  };

  const hasCapacity = capacityPercent !== null && capacityPercent > 0;
  const hasQuota = quotaPercent !== null && quotaPercent > 0;
  const hasTime = timePercent !== null && timePercent > 0;
  const hasExpire = daysRemaining !== null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all group relative min-h-[280px] flex flex-col">
      {/* 右上角操作按钮 - 悬停显示 */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {/* 邮件提醒开关 - 仅在有到期日期时显示 */}
        {item.expireDate && (
          <button
            onClick={onToggleReminder}
            className={`p-1 transition-colors ${item.emailReminder ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'}`}
            title={item.emailReminder ? '关闭到期提醒' : '开启到期提醒'}
          >
            {item.emailReminder ? <Bell className="w-3.5 h-3.5 fill-current" /> : <Bell className="w-3.5 h-3.5" />}
          </button>
        )}
        {/* 视图切换按钮 */}
        <button
          onClick={() => setIsCompact(!isCompact)}
          className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
          title={isCompact ? '切换到详细视图' : '切换到精简视图'}
        >
          {isCompact ? <LayoutGrid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
        </button>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-500 transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isCompact ? (
        // ========== 精简视图 ==========
        <div className="flex flex-col flex-1">
          {/* 头部：图标 + 名称 */}
          <div className="flex items-center gap-2 mb-3 pr-6">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${category.color}20` }}
            >
              <DynamicIcon name={item.icon || category.icon} className="w-4 h-4" style={{ color: category.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-sm text-gray-900 dark:text-white truncate">{item.name}</h4>
            </div>
          </div>

          {/* 进度条区域 */}
          <div className="flex-1 min-h-[160px] flex flex-col justify-center space-y-4 px-2">
            {/* 时间进度条 */}
            {hasTime && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: getColor(timePercent, 'time') }} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">剩余时间</span>
                  <span className="ml-auto text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {Math.round(100 - timePercent)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${100 - timePercent}%`,
                      backgroundColor: getColor(timePercent, 'time')
                    }}
                  />
                </div>
              </div>
            )}

            {/* 额度进度条 */}
            {hasQuota && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: getColor(quotaPercent, 'quota') }} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">剩余额度</span>
                  <span className="ml-auto text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {Math.round(100 - quotaPercent)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${100 - quotaPercent}%`,
                      backgroundColor: getColor(quotaPercent, 'quota')
                    }}
                  />
                </div>
              </div>
            )}

            {/* 容量进度条 */}
            {hasCapacity && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 flex-shrink-0" style={{ color: getColor(capacityPercent, 'capacity') }} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">剩余容量</span>
                  <span className="ml-auto text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {Math.round(100 - capacityPercent)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${100 - capacityPercent}%`,
                      backgroundColor: getColor(capacityPercent, 'capacity')
                    }}
                  />
                </div>
              </div>
            )}

            {/* 费用显示 - 在进度条下方 */}
            {(hasTime || hasCapacity || hasQuota) && item.autoRenewal && item.cost && item.cost.amount > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-center gap-1.5 text-sm">
                  <DollarSign className="w-3.5 h-3.5 text-green-500" />
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    ¥{item.cost.amount}/{item.cost.period === 'month' ? '月' : item.cost.period === 'year' ? '年' : '次'}
                  </span>
                </div>
              </div>
            )}

            {/* 无指标时显示默认内容 */}
            {!hasTime && !hasCapacity && !hasQuota && (
              <>
                {hasExpire && timeStatus ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className={`text-3xl font-bold ${timeStatus.color}`}>
                      {daysRemaining < 0 ? Math.abs(daysRemaining) : daysRemaining}
                    </div>
                    <span className="text-xs text-gray-500 mt-1">
                      {daysRemaining < 0 ? '已过期(天)' : '剩余天数'}
                    </span>
                    {/* 费用显示 - 在中间区域 */}
                    {item.autoRenewal && item.cost && item.cost.amount > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-center gap-1.5 text-sm">
                          <DollarSign className="w-3.5 h-3.5 text-green-500" />
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            ¥{item.cost.amount}/{item.cost.period === 'month' ? '月' : item.cost.period === 'year' ? '年' : '次'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    {/* 费用显示 - 在中间区域 */}
                    {item.autoRenewal && item.cost && item.cost.amount > 0 && (
                      <div>
                        <div className="flex items-center justify-center gap-1.5 text-sm">
                          <DollarSign className="w-3.5 h-3.5 text-green-500" />
                          <span className="font-semibold text-green-600 dark:text-green-400">
                            ¥{item.cost.amount}/{item.cost.period === 'month' ? '月' : item.cost.period === 'year' ? '年' : '次'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        // ========== 详细视图 ==========
        <div className="flex flex-col flex-1">
          {/* 头部 */}
          <div className="flex items-start justify-between mb-3 pr-16">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${category.color}20` }}
              >
                <DynamicIcon name={item.icon || category.icon} className="w-5 h-5" style={{ color: category.color }} />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">{item.name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{category.name}</p>
              </div>
            </div>
          </div>

          {/* 数据展示区 */}
          <div className="space-y-2 flex-1 overflow-y-auto">
            {/* 剩余时间 */}
            {daysRemaining !== null && timeStatus && (
              <div className={`rounded-lg p-2 ${timeStatus.bgColor}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${timeStatus.color}`} />
                    <span className="text-xs text-gray-600 dark:text-gray-400">剩余时间</span>
                  </div>
                  <span className={`text-xs font-medium ${timeStatus.color}`}>{timeStatus.label}</span>
                </div>
                <div className={`text-base font-bold ${timeStatus.color}`}>
                  {formatDaysRemaining(daysRemaining)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  到期: {item.expireDate}
                </div>
              </div>
            )}

            {/* 容量 */}
            {item.capacity && item.capacity.total > 0 && (
              <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">容量</span>
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {item.capacity.used}/{item.capacity.total}{item.capacity.unit}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      capacityPercent > 90 ? 'bg-red-500' : capacityPercent > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(capacityPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* 额度 */}
            {item.quota && item.quota.total > 0 && (
              <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">额度</span>
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {item.quota.used}/{item.quota.total}{item.quota.unit}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      quotaPercent > 90 ? 'bg-red-500' : quotaPercent > 70 ? 'bg-yellow-500' : 'bg-purple-500'
                    }`}
                    style={{ width: `${Math.min(quotaPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* 费用 */}
            {item.cost && item.cost.amount > 0 && (
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">费用</span>
                </div>
                <span className="text-xs font-medium text-gray-900 dark:text-white">
                  ¥{item.cost.amount}/{item.cost.period === 'month' ? '月' : item.cost.period === 'year' ? '年' : '次'}
                </span>
              </div>
            )}

            {/* 自动续费 */}
            {item.autoRenewal !== undefined && (
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">自动续费</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  item.autoRenewal ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                }`}>
                  {item.autoRenewal ? '已开启' : '已关闭'}
                </span>
              </div>
            )}

            {/* 账号 */}
            {item.account && (
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">账号</span>
                </div>
                <span className="text-xs font-medium text-gray-900 dark:text-white truncate max-w-[120px]">
                  {item.account}
                </span>
              </div>
            )}

            {/* 备注 */}
            {item.note && (
              <div className="text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700 line-clamp-2">
                {item.note}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// 可选图标列表
const RESOURCE_ICON_OPTIONS = [
  'Cloud', 'Bot', 'Server', 'Globe', 'CreditCard', 'Database', 'HardDrive',
  'Wifi', 'Shield', 'Key', 'Lock', 'Cpu', 'Monitor', 'Smartphone', 'Tablet',
  'Mail', 'MessageSquare', 'Video', 'Music', 'Image', 'File', 'Folder',
  'Code', 'Terminal', 'Package', 'Box', 'Archive', 'Bookmark', 'Star',
  'Heart', 'Zap', 'Flame', 'Sun', 'Moon', 'Compass', 'Map', 'Navigation'
];

// 资源编辑弹窗
const ResourceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<ResourceItem>) => void;
  categories: ResourceCategory[];
  editingItem?: ResourceItem;
}> = ({ isOpen, onClose, onSave, categories, editingItem }) => {
  const [formData, setFormData] = useState<Partial<ResourceItem>>(() => editingItem || {
    categoryId: categories[0]?.id || '',
    name: '',
  });
  const [showIconPicker, setShowIconPicker] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        setFormData(editingItem);
      } else {
        setFormData({
          categoryId: categories[0]?.id || '',
          name: '',
        });
      }
    }
  }, [isOpen, editingItem, categories]);

  if (!isOpen) return null;

  const selectedCategory = categories.find(c => c.id === formData.categoryId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
        {/* 头部 */}
        <div className="relative bg-gradient-to-r from-blue-500 to-indigo-600 p-6">
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-4">
            {/* 图标选择 */}
            <div className="relative">
              <button
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="w-16 h-16 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <DynamicIcon 
                  name={formData.icon || selectedCategory?.icon || 'Package'} 
                  className="w-8 h-8 text-white" 
                />
              </button>
              {showIconPicker && (
                <div className="absolute top-full left-0 mt-2 p-2 bg-white dark:bg-gray-700 rounded-xl shadow-xl z-10 w-64 max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-6 gap-1">
                    {RESOURCE_ICON_OPTIONS.map(icon => (
                      <button
                        key={icon}
                        onClick={() => {
                          setFormData({ ...formData, icon });
                          setShowIconPicker(false);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          formData.icon === icon
                            ? 'bg-blue-500 text-white'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        <DynamicIcon name={icon} className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入资源名称"
                className="w-full bg-transparent text-xl font-semibold text-white placeholder-white/60 border-none outline-none"
              />
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="mt-1 bg-white/20 text-white/90 text-sm rounded-lg px-2 py-1 border-none outline-none cursor-pointer"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id} className="text-gray-900">{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="space-y-5 max-w-3xl mx-auto">
            {/* 到期日期 + 总时长 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Clock className="w-4 h-4 text-green-500" />
                  到期日期
                </label>
                <input
                  type="date"
                  value={formData.expireDate || ''}
                  onChange={(e) => setFormData({ ...formData, expireDate: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Timer className="w-4 h-4 text-indigo-500" />
                  总时长
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={formData.totalTime?.value ?? ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      totalTime: e.target.value ? {
                        value: parseFloat(e.target.value) || 0,
                        unit: formData.totalTime?.unit || 'year'
                      } : undefined
                    })}
                    placeholder="时长"
                    className="flex-1 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <select
                    value={formData.totalTime?.unit || 'year'}
                    onChange={(e) => setFormData({
                      ...formData,
                      totalTime: formData.totalTime?.value ? {
                        value: formData.totalTime.value,
                        unit: e.target.value as 'day' | 'month' | 'year'
                      } : undefined
                    })}
                    className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="day">天</option>
                    <option value="month">月</option>
                    <option value="year">年</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 容量 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <HardDrive className="w-4 h-4 text-blue-500" />
                容量
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-2">
                <div className="grid grid-cols-[1fr,auto,1fr,auto] gap-2 items-center">
                  <div>
                    <input
                      type="number"
                      value={formData.capacity?.used ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        capacity: {
                          used: parseFloat(e.target.value) || 0,
                          total: formData.capacity?.total || 0,
                          unit: formData.capacity?.unit || 'GB'
                        }
                      })}
                      placeholder="已用容量"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <span className="text-gray-400">/</span>
                  <div>
                    <input
                      type="number"
                      value={formData.capacity?.total ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        capacity: {
                          used: formData.capacity?.used || 0,
                          total: parseFloat(e.target.value) || 0,
                          unit: formData.capacity?.unit || 'GB'
                        }
                      })}
                      placeholder="总容量"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={formData.capacity?.unit ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        capacity: {
                          used: formData.capacity?.used || 0,
                          total: formData.capacity?.total || 0,
                          unit: e.target.value
                        }
                      })}
                      placeholder="GB"
                      className="w-16 px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                    />
                  </div>
                </div>
                {formData.capacity?.total ? (
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min((formData.capacity.used / formData.capacity.total) * 100, 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* 额度 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Zap className="w-4 h-4 text-purple-500" />
                使用额度
              </label>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-2">
                <div className="grid grid-cols-[1fr,auto,1fr,auto] gap-2 items-center">
                  <div>
                    <input
                      type="number"
                      value={formData.quota?.used ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        quota: {
                          used: parseFloat(e.target.value) || 0,
                          total: formData.quota?.total || 0,
                          unit: formData.quota?.unit || '次'
                        }
                      })}
                      placeholder="已用额度"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <span className="text-gray-400">/</span>
                  <div>
                    <input
                      type="number"
                      value={formData.quota?.total ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        quota: {
                          used: formData.quota?.used || 0,
                          total: parseFloat(e.target.value) || 0,
                          unit: formData.quota?.unit || '次'
                        }
                      })}
                      placeholder="总额度"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={formData.quota?.unit ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        quota: {
                          used: formData.quota?.used || 0,
                          total: formData.quota?.total || 0,
                          unit: e.target.value
                        }
                      })}
                      placeholder="次"
                      className="w-16 px-2 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                    />
                  </div>
                </div>
                {formData.quota?.total ? (
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${Math.min((formData.quota.used / formData.quota.total) * 100, 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* 费用 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                费用
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                  <input
                    type="number"
                    value={formData.cost?.amount ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({
                        ...formData,
                        cost: value && parseFloat(value) > 0 ? {
                          amount: parseFloat(value),
                          period: formData.cost?.period || 'year'
                        } : undefined
                      });
                    }}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <select
                  value={formData.cost?.period || 'year'}
                  onChange={(e) => setFormData({
                    ...formData,
                    cost: formData.cost ? {
                      amount: formData.cost.amount,
                      period: e.target.value as 'month' | 'year' | 'once'
                    } : undefined
                  })}
                  className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="month">/月</option>
                  <option value="year">/年</option>
                  <option value="once">一次性</option>
                </select>
              </div>
            </div>

            {/* 链接 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <ExternalLink className="w-4 h-4 text-blue-500" />
                链接
              </label>
              <input
                type="url"
                value={formData.url || ''}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* 账号 + 自动续费 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <User className="w-4 h-4 text-blue-500" />
                  账号
                </label>
                <input
                  type="text"
                  value={formData.account || ''}
                  onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                  placeholder="登录账号/用户名"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  自动续费
                </label>
                <select
                  value={formData.autoRenewal === undefined ? '' : formData.autoRenewal ? 'true' : 'false'}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    autoRenewal: e.target.value === '' ? undefined : e.target.value === 'true',
                    renewalDate: e.target.value !== 'true' ? undefined : formData.renewalDate
                  })}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="">未设置</option>
                  <option value="true">已开启</option>
                  <option value="false">已关闭</option>
                </select>
              </div>
            </div>

            {/* 续费日期 - 仅在自动续费开启时显示 */}
            {formData.autoRenewal === true && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 text-purple-500" />
                  续费日期
                </label>
                {formData.cost?.period === 'month' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">每月</span>
                    <select
                      value={formData.renewalDate || '1'}
                      onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                      className="flex-1 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>{day}日</option>
                      ))}
                    </select>
                  </div>
                ) : formData.cost?.period === 'year' ? (
                  <input
                    type="text"
                    value={formData.renewalDate || ''}
                    onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                    placeholder="MM-DD (如: 01-15)"
                    pattern="\d{2}-\d{2}"
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 py-2.5">
                    一次性付费无需设置续费日期
                  </div>
                )}
              </div>
            )}

            {/* 邮件到期提醒 */}
            {formData.expireDate && (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">邮件到期提醒</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.emailReminder || false}
                    onChange={(e) => setFormData({ ...formData, emailReminder: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
                </label>
              </div>
            )}

            {/* 备注 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Edit2 className="w-4 h-4 text-gray-500" />
                备注
              </label>
              <textarea
                value={formData.note || ''}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={3}
                placeholder="添加一些备注信息..."
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              />
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!formData.name?.trim()) {
                alert('请输入资源名称');
                return;
              }
              onSave(formData);
              onClose();
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-blue-500/25"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

// 可选图标列表
const ICON_OPTIONS = [
  'Cloud', 'Bot', 'Server', 'Globe', 'CreditCard', 'Database', 'HardDrive',
  'Wifi', 'Shield', 'Key', 'Lock', 'Cpu', 'Monitor', 'Smartphone', 'Tablet',
  'Mail', 'MessageSquare', 'Video', 'Music', 'Image', 'File', 'Folder',
  'Code', 'Terminal', 'Package', 'Box', 'Archive', 'Bookmark', 'Star',
  'Heart', 'Zap', 'Flame', 'Sun', 'Moon', 'Compass', 'Map', 'Navigation'
];

// 颜色选项
const COLOR_OPTIONS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899',
  '#ef4444', '#14b8a6', '#6366f1', '#84cc16', '#f97316'
];

// 分类管理弹窗
const CategoryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: Partial<ResourceCategory>) => void;
  editingCategory?: ResourceCategory;
}> = ({ isOpen, onClose, onSave, editingCategory }) => {
  const [formData, setFormData] = useState<Partial<ResourceCategory>>(() => editingCategory || {
    name: '',
    icon: 'Folder',
    color: '#3b82f6',
  });

  React.useEffect(() => {
    if (editingCategory) {
      setFormData(editingCategory);
    } else {
      setFormData({
        name: '',
        icon: 'Folder',
        color: '#3b82f6',
      });
    }
  }, [editingCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md m-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editingCategory ? '编辑分类' : '添加分类'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">分类名称</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="如：云盘资源"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* 图标选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">图标</label>
            <div className="grid grid-cols-8 gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              {ICON_OPTIONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setFormData({ ...formData, icon })}
                  className={`p-2 rounded-lg transition-colors ${
                    formData.icon === icon
                      ? 'bg-blue-500 text-white'
                      : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <DynamicIcon name={icon} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">颜色</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(color => (
                <button
                  key={color}
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-8 h-8 rounded-lg transition-all ${
                    formData.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* 预览 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">预览</label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${formData.color}20` }}
              >
                <DynamicIcon name={formData.icon || 'Folder'} className="w-4 h-4" style={{ color: formData.color }} />
              </div>
              <span className="text-gray-900 dark:text-white">{formData.name || '分类名称'}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (!formData.name?.trim()) {
                alert('请输入分类名称');
                return;
              }
              onSave(formData);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

// 分类管理列表弹窗
const CategoryManagerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  categories: ResourceCategory[];
  onAddCategory: () => void;
  onEditCategory: (category: ResourceCategory) => void;
  onDeleteCategory: (id: string) => void;
  stats: { total: number; expiringSoon: number; expired: number; totalCostPerYear: number };
}> = ({ isOpen, onClose, categories, onAddCategory, onEditCategory, onDeleteCategory, stats }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md m-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">管理分类</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 统计信息 */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-around gap-2 text-sm">
            <div className="flex items-center gap-1.5">
              <FolderPlus className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600 dark:text-gray-400">总数</span>
              <span className="font-semibold text-gray-900 dark:text-white">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-yellow-500" />
              <span className="text-gray-600 dark:text-gray-400">将到期</span>
              <span className="font-semibold text-yellow-500">{stats.expiringSoon}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600 dark:text-gray-400">已过期</span>
              <span className="font-semibold text-gray-500">{stats.expired}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-gray-600 dark:text-gray-400">年费</span>
              <span className="font-semibold text-green-500">¥{stats.totalCostPerYear}</span>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${cat.color}20` }}
                  >
                    <DynamicIcon name={cat.icon} className="w-4 h-4" style={{ color: cat.color }} />
                  </div>
                  <span className="text-gray-900 dark:text-white">{cat.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditCategory(cat)}
                    className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteCategory(cat.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onAddCategory}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加新分类
          </button>
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export const ResourceCenter: React.FC<ResourceCenterProps> = ({ data, onUpdateData }) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ResourceItem | undefined>();
  
  // 分类管理状态
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ResourceCategory | undefined>();

  // 确保有默认分类
  const categories = data.categories.length > 0 ? data.categories : DEFAULT_CATEGORIES;

  // 按分类分组资源
  const groupedItems = useMemo(() => {
    const groups: Record<string, ResourceItem[]> = {};
    categories.forEach(cat => {
      groups[cat.id] = data.items.filter(item => item.categoryId === cat.id);
    });
    return groups;
  }, [data.items, categories]);

  // 统计信息
  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let expiringSoon = 0;
    let expired = 0;
    let totalCostPerYear = 0;

    data.items.forEach(item => {
      if (item.expireDate) {
        const days = getDaysRemaining(item.expireDate);
        if (days < 0) expired++;
        else if (days <= 30) expiringSoon++;
      }
      // 只计算开启了自动续费的资源费用
      if (item.autoRenewal && item.cost) {
        if (item.cost.period === 'month') totalCostPerYear += item.cost.amount * 12;
        else if (item.cost.period === 'year') totalCostPerYear += item.cost.amount;
      }
    });

    return { total: data.items.length, expiringSoon, expired, totalCostPerYear };
  }, [data.items]);

  const handleSaveItem = (itemData: Partial<ResourceItem>) => {
    // 清理数据：只保留有效的字段
    const cleanedData = {
      ...itemData,
      totalTime: itemData.totalTime?.value ? itemData.totalTime : undefined,
      capacity: itemData.capacity?.total ? itemData.capacity : undefined,
      quota: itemData.quota?.total ? itemData.quota : undefined,
      cost: (itemData.cost?.amount && itemData.cost.amount > 0) ? itemData.cost : undefined,
    };

    if (editingItem) {
      // 编辑
      const updatedItems = data.items.map(item =>
        item.id === editingItem.id ? { ...item, ...cleanedData } : item
      );
      onUpdateData({ ...data, items: updatedItems });
    } else {
      // 新增
      const newItem: ResourceItem = {
        id: crypto.randomUUID(),
        categoryId: cleanedData.categoryId || categories[0].id,
        name: cleanedData.name || '',
        expireDate: cleanedData.expireDate,
        totalTime: cleanedData.totalTime,
        capacity: cleanedData.capacity,
        quota: cleanedData.quota,
        cost: cleanedData.cost,
        url: cleanedData.url,
        note: cleanedData.note,
        emailReminder: cleanedData.emailReminder,
        createdAt: Date.now(),
      };
      onUpdateData({
        categories: data.categories.length > 0 ? data.categories : DEFAULT_CATEGORIES,
        items: [...data.items, newItem]
      });
    }
    setEditingItem(undefined);
  };

  const handleDeleteItem = (id: string) => {
    if (confirm('确定要删除这个资源吗？')) {
      onUpdateData({ ...data, items: data.items.filter(item => item.id !== id) });
    }
  };

  // 切换邮件提醒
  const handleToggleReminder = (id: string) => {
    const updatedItems = data.items.map(item =>
      item.id === id ? { ...item, emailReminder: !item.emailReminder } : item
    );
    onUpdateData({ ...data, items: updatedItems });
  };

  // 分类管理函数
  const handleSaveCategory = (categoryData: Partial<ResourceCategory>) => {
    if (editingCategory) {
      // 编辑分类
      const updatedCategories = categories.map(cat =>
        cat.id === editingCategory.id ? { ...cat, ...categoryData } : cat
      );
      onUpdateData({ ...data, categories: updatedCategories });
    } else {
      // 新增分类
      const newCategory: ResourceCategory = {
        id: crypto.randomUUID(),
        name: categoryData.name || '',
        icon: categoryData.icon || 'Folder',
        color: categoryData.color || '#3b82f6',
      };
      onUpdateData({
        ...data,
        categories: [...categories, newCategory]
      });
    }
    setEditingCategory(undefined);
  };

  const handleDeleteCategory = (id: string) => {
    const itemsInCategory = data.items.filter(item => item.categoryId === id);
    if (itemsInCategory.length > 0) {
      alert(`该分类下还有 ${itemsInCategory.length} 个资源，请先删除或移动这些资源`);
      return;
    }
    if (confirm('确定要删除这个分类吗？')) {
      onUpdateData({
        ...data,
        categories: categories.filter(cat => cat.id !== id)
      });
    }
  };

  const filteredCategories = selectedCategoryId
    ? categories.filter(cat => cat.id === selectedCategoryId)
    : categories;

  return (
    <div className="h-full flex flex-col">
      {/* 分类筛选 + 添加按钮 */}
      <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedCategoryId === null
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              全部
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                style={selectedCategoryId === cat.id ? { backgroundColor: cat.color } : {}}
              >
                <DynamicIcon name={cat.icon} className="w-4 h-4" />
                {cat.name}
                <span className="ml-1 text-xs opacity-70">({groupedItems[cat.id]?.length || 0})</span>
              </button>
            ))}
            {/* 分类管理按钮 */}
            <button
              onClick={() => setIsCategoryManagerOpen(true)}
              className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
              title="管理分类"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              setEditingItem(undefined);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加资源
          </button>
      </div>

      {/* 资源列表 */}
      <div className="flex-1 overflow-auto">
        {filteredCategories.map(category => {
          const items = groupedItems[category.id] || [];
          if (items.length === 0 && selectedCategoryId) return null;

          return (
            <div key={category.id} className="mb-6">
              {!selectedCategoryId && (
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center"
                    style={{ backgroundColor: `${category.color}20` }}
                  >
                    <DynamicIcon name={category.icon} className="w-4 h-4" style={{ color: category.color }} />
                  </div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{category.name}</h3>
                  <span className="text-sm text-gray-500">({items.length})</span>
                </div>
              )}

              {items.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {items.map(item => (
                    <ResourceCard
                      key={item.id}
                      item={item}
                      category={category}
                      onEdit={() => {
                        setEditingItem(item);
                        setIsModalOpen(true);
                      }}
                      onDelete={() => handleDeleteItem(item.id)}
                      onToggleReminder={() => handleToggleReminder(item.id)}
                    />
                  ))}
                </div>
              ) : (
                !selectedCategoryId && (
                  <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    暂无资源
                  </div>
                )
              )}
            </div>
          );
        })}

        {data.items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FolderPlus className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg mb-2">还没有添加任何资源</p>
            <p className="text-sm">点击上方"添加资源"按钮开始管理你的资源</p>
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      <ResourceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(undefined);
        }}
        onSave={handleSaveItem}
        categories={categories}
        editingItem={editingItem}
      />

      {/* 分类管理弹窗 */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        categories={categories}
        onAddCategory={() => {
          setEditingCategory(undefined);
          setIsCategoryModalOpen(true);
        }}
        onEditCategory={(cat) => {
          setEditingCategory(cat);
          setIsCategoryModalOpen(true);
        }}
        onDeleteCategory={handleDeleteCategory}
        stats={stats}
      />

      {/* 分类编辑弹窗 */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => {
          setIsCategoryModalOpen(false);
          setEditingCategory(undefined);
        }}
        onSave={handleSaveCategory}
        editingCategory={editingCategory}
      />
    </div>
  );
};

export default ResourceCenter;
