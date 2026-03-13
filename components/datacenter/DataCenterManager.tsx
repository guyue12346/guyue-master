import React, { useState, useEffect } from 'react';
import { BarChart3, Flame, Package, Settings, X, ToggleLeft, ToggleRight, Shield, Activity, Terminal, Webhook, HelpCircle, GripVertical } from 'lucide-react';
import { OJHeatmapContainer } from './OJHeatmapContainer';
import { ResourceCenter } from './ResourceCenter';
import { PasswordManager } from './PasswordManager';
import { ZenmuxUsagePanel } from './ZenmuxUsagePanel';
import { GCPBillingPanel } from './GCPBillingPanel';
import { SSHManager } from './SSHManager';
import { APIManager } from './APIManager';
import { HelpModal } from '../HelpModal';
import type { OJHeatmapData, ResourceCenterData, DataCenterConfig, SSHRecord, Category, APIRecord } from '../../types';

// localStorage 存储键
const STORAGE_KEY_DATACENTER_CONFIG = 'linkmaster_datacenter_config';

// 模块默认顺序
const DEFAULT_MODULE_ORDER = ['ssh', 'apiManager', 'ojHeatmap', 'resourceCenter', 'passwordManager', 'zenmuxUsage', 'gcpBilling'];

// 默认配置
const DEFAULT_DATACENTER_CONFIG: DataCenterConfig = {
  modules: {
    ssh: true,
    apiManager: true,
    ojHeatmap: true,
    resourceCenter: true,
    passwordManager: true,
    zenmuxUsage: true,
    gcpBilling: true,
  },
  moduleOrder: DEFAULT_MODULE_ORDER,
};

const normalizeDataCenterConfig = (rawConfig: Partial<DataCenterConfig> | null | undefined): DataCenterConfig => ({
  modules: {
    ...DEFAULT_DATACENTER_CONFIG.modules,
    ...(rawConfig?.modules ?? {}),
  },
  moduleOrder: rawConfig?.moduleOrder ?? DEFAULT_MODULE_ORDER,
});

// 模块元数据（用于设置界面动态渲染）
const MODULE_DEFS: { key: keyof DataCenterConfig['modules']; label: string; color: string; IconComp: React.ComponentType<{ className?: string }> }[] = [
  { key: 'ssh',             label: 'SSH管理',  color: 'text-cyan-500',    IconComp: Terminal },
  { key: 'apiManager',     label: 'API管理',  color: 'text-purple-500',  IconComp: Webhook  },
  { key: 'ojHeatmap',      label: 'OJ热力图', color: 'text-orange-500',  IconComp: Flame    },
  { key: 'resourceCenter', label: '资源中心', color: 'text-blue-500',    IconComp: Package  },
  { key: 'passwordManager',label: '网站管理', color: 'text-emerald-500', IconComp: Shield   },
  { key: 'zenmuxUsage',    label: 'Zenmux',   color: 'text-violet-500',  IconComp: Activity },
  { key: 'gcpBilling',     label: 'GCP Cloud', color: 'text-blue-500',    IconComp: BarChart3 },
];

// 设置弹窗组件
const DataCenterSettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  config: DataCenterConfig;
  onUpdateConfig: (config: DataCenterConfig) => void;
}> = ({ isOpen, onClose, config, onUpdateConfig }) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  const moduleOrder = config.moduleOrder ?? DEFAULT_MODULE_ORDER;
  // 保证所有模块都在列表里（向前兼容）
  const orderedKeys = [
    ...moduleOrder,
    ...DEFAULT_MODULE_ORDER.filter(k => !moduleOrder.includes(k)),
  ] as (keyof DataCenterConfig['modules'])[];

  const handleToggle = (key: keyof DataCenterConfig['modules']) => {
    onUpdateConfig({ ...config, modules: { ...config.modules, [key]: !config.modules[key] } });
  };

  const handleDrop = (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) return;
    const newOrder = [...orderedKeys];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    onUpdateConfig({ ...config, moduleOrder: newOrder });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg m-4 max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">数据中心设置</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)] space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">模块管理</h4>
              <span className="text-xs text-gray-400">拖拽排序 · 点击切换显示</span>
            </div>
            <div className="space-y-1">
              {orderedKeys.map((key, index) => {
                const def = MODULE_DEFS.find(d => d.key === key);
                if (!def) return null;
                const enabled = config.modules[key];
                const isDragging = dragIndex === index;
                const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;
                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => { e.preventDefault(); setDropIndex(index); }}
                    onDrop={() => { handleDrop(index); setDragIndex(null); setDropIndex(null); }}
                    onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                    className={`flex items-center justify-between p-3 rounded-lg transition-all select-none
                      ${isDragging ? 'opacity-40' : 'opacity-100'}
                      ${isDropTarget ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-gray-300 cursor-grab active:cursor-grabbing shrink-0" />
                      <def.IconComp className={`w-4 h-4 ${def.color}`} />
                      <span className={`text-sm ${enabled ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
                        {def.label}
                      </span>
                    </div>
                    <button
                      onClick={() => handleToggle(key)}
                      className={`transition-colors shrink-0 ${enabled ? 'text-blue-500' : 'text-gray-400'}`}
                    >
                      {enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
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

interface DataCenterManagerProps {
  ojHeatmapData: OJHeatmapData;
  onUpdateOJHeatmapData: (data: OJHeatmapData) => void;
  resourceData: ResourceCenterData;
  onUpdateResourceData: (data: ResourceCenterData) => void;
  sshRecords: SSHRecord[];
  sshCategories: Category[];
  onSaveSSH: (record: Partial<SSHRecord>) => void;
  onDeleteSSH: (id: string) => void;
  onOpenSSHInTerminal: (command: string, title: string) => void;
  apiRecords: APIRecord[];
  apiCategories: Category[];
  onSaveAPI: (record: Partial<APIRecord>) => void;
  onDeleteAPI: (id: string) => void;
}

type SubPage = 'ssh' | 'api-manager' | 'oj-heatmap' | 'resource-center' | 'password-manager' | 'zenmux-usage' | 'gcp-billing';

interface NavItem {
  id: SubPage;
  name: string;
  icon: React.ReactNode;
  configKey: keyof DataCenterConfig['modules'];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'ssh',
    name: 'SSH管理',
    icon: <Terminal className="w-4 h-4" />,
    configKey: 'ssh',
  },
  {
    id: 'api-manager',
    name: 'API管理',
    icon: <Webhook className="w-4 h-4" />,
    configKey: 'apiManager',
  },
  {
    id: 'oj-heatmap',
    name: 'OJ热力图',
    icon: <Flame className="w-4 h-4" />,
    configKey: 'ojHeatmap',
  },
  {
    id: 'resource-center',
    name: '资源中心',
    icon: <Package className="w-4 h-4" />,
    configKey: 'resourceCenter',
  },
  {
    id: 'password-manager',
    name: '网站管理',
    icon: <Shield className="w-4 h-4" />,
    configKey: 'passwordManager',
  },
  {
    id: 'zenmux-usage',
    name: 'Zenmux',
    icon: <Activity className="w-4 h-4" />,
    configKey: 'zenmuxUsage',
  },
  {
    id: 'gcp-billing',
    name: 'GCP Cloud',
    icon: <BarChart3 className="w-4 h-4" />,
    configKey: 'gcpBilling',
  },
];

export const DataCenterManager: React.FC<DataCenterManagerProps> = ({
  ojHeatmapData,
  onUpdateOJHeatmapData,
  resourceData,
  onUpdateResourceData,
  sshRecords,
  sshCategories,
  onSaveSSH,
  onDeleteSSH,
  onOpenSSHInTerminal,
  apiRecords,
  apiCategories,
  onSaveAPI,
  onDeleteAPI,
}) => {
  const [activePage, setActivePage] = useState<SubPage>('ssh');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // 数据中心配置
  const [config, setConfig] = useState<DataCenterConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DATACENTER_CONFIG);
      return normalizeDataCenterConfig(saved ? JSON.parse(saved) : DEFAULT_DATACENTER_CONFIG);
    } catch {
      return DEFAULT_DATACENTER_CONFIG;
    }
  });

  // 保存配置到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DATACENTER_CONFIG, JSON.stringify(config));
  }, [config]);

  // 按配置顺序过滤可见导航项
  const moduleOrder = config.moduleOrder ?? DEFAULT_MODULE_ORDER;
  const orderedKeys = [...moduleOrder, ...DEFAULT_MODULE_ORDER.filter(k => !moduleOrder.includes(k))];
  const visibleNavItems = orderedKeys
    .map(key => NAV_ITEMS.find(item => item.configKey === key))
    .filter((item): item is NavItem => item !== undefined && config.modules[item.configKey]);

  // 确保当前页面是可见的
  useEffect(() => {
    if (!visibleNavItems.find(item => item.id === activePage) && visibleNavItems.length > 0) {
      setActivePage(visibleNavItems[0].id);
    }
  }, [visibleNavItems, activePage]);

  return (
    <div className="h-full flex">
      {/* 左侧导航 */}
      <div className="w-48 shrink-0 bg-white/30 dark:bg-gray-800/30 border-r border-gray-200/50 dark:border-gray-700/50 p-3 flex flex-col">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              数据中心
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsHelpOpen(true)}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
              title="使用帮助"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
              title="设置"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          {visibleNavItems.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">
              所有模块已隐藏<br />
              点击设置按钮开启
            </div>
          ) : (
            visibleNavItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                  ${activePage === item.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                  }`}
              >
                {item.icon}
                {item.name}
              </button>
            ))
          )}
        </nav>
      </div>

      {/* 设置弹窗 */}
      <DataCenterSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onUpdateConfig={setConfig}
      />

      {/* 右侧内容区域 */}
      <div className="flex-1 p-4 overflow-auto">
        {activePage === 'ssh' && (
          <SSHManager
            records={sshRecords}
            categories={sshCategories}
            onSave={onSaveSSH}
            onDelete={onDeleteSSH}
            onOpenInTerminal={onOpenSSHInTerminal}
          />
        )}
        {activePage === 'api-manager' && (
          <APIManager
            records={apiRecords}
            categories={apiCategories}
            onSave={onSaveAPI}
            onDelete={onDeleteAPI}
          />
        )}
        {activePage === 'oj-heatmap' && (
          <OJHeatmapContainer
            data={ojHeatmapData}
            onUpdateData={onUpdateOJHeatmapData}
          />
        )}
        {activePage === 'resource-center' && (
          <ResourceCenter
            data={resourceData}
            onUpdateData={onUpdateResourceData}
          />
        )}
        {activePage === 'password-manager' && (
          <PasswordManager />
        )}
        {activePage === 'zenmux-usage' && (
          <ZenmuxUsagePanel />
        )}
        {activePage === 'gcp-billing' && (
          <GCPBillingPanel />
        )}
      </div>

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        appMode="datacenter"
      />
    </div>
  );
};

export default DataCenterManager;
