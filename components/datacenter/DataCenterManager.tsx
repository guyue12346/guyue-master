import React, { useState, useEffect } from 'react';
import { BarChart3, Flame, Heart, Package, Cpu, Settings, X, ToggleLeft, ToggleRight, Mail, Server, Key, Send, Loader2, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { OJHeatmapContainer } from './OJHeatmapContainer';
import { CoupleHeatmapContainer } from './CoupleHeatmapContainer';
import { ResourceCenter } from './ResourceCenter';
import { ResourceRealtimeData } from './ResourceRealtimeData';
import { PasswordManager } from './PasswordManager';
import type { OJHeatmapData, HeatmapData, ResourceCenterData, DataCenterConfig, EmailConfig } from '../../types';

// localStorage 存储键
const STORAGE_KEY_DATACENTER_CONFIG = 'linkmaster_datacenter_config';
const STORAGE_KEY_EMAIL_CONFIG = 'linkmaster_email_config';

// 默认配置
const DEFAULT_DATACENTER_CONFIG: DataCenterConfig = {
  modules: {
    ojHeatmap: true,
    coupleHeatmap: true,
    resourceCenter: true,
    resourceRealtime: true,
    passwordManager: true,
  },
};

const normalizeDataCenterConfig = (rawConfig: Partial<DataCenterConfig> | null | undefined): DataCenterConfig => ({
  modules: {
    ...DEFAULT_DATACENTER_CONFIG.modules,
    ...(rawConfig?.modules ?? {}),
  },
});

const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  enabled: false,
  smtp: {
    host: '',
    port: 465,
    secure: true,
    user: '',
    pass: '',
  },
  recipient: '',
};

// 设置弹窗组件
const DataCenterSettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  config: DataCenterConfig;
  onUpdateConfig: (config: DataCenterConfig) => void;
  emailConfig: EmailConfig;
  onUpdateEmailConfig: (config: EmailConfig) => void;
}> = ({ isOpen, onClose, config, onUpdateConfig, emailConfig, onUpdateEmailConfig }) => {
  const [localEmailConfig, setLocalEmailConfig] = useState<EmailConfig>(emailConfig);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setLocalEmailConfig(emailConfig);
      setTestStatus('idle');
      setTestError('');
    }
  }, [isOpen, emailConfig]);

  if (!isOpen) return null;

  const handleModuleToggle = (moduleKey: keyof DataCenterConfig['modules']) => {
    const newConfig = {
      ...config,
      modules: {
        ...config.modules,
        [moduleKey]: !config.modules[moduleKey],
      },
    };
    onUpdateConfig(newConfig);
  };

  const handleTestEmail = async () => {
    if (!localEmailConfig.smtp.host || !localEmailConfig.smtp.user || !localEmailConfig.smtp.pass || !localEmailConfig.recipient) {
      setTestStatus('error');
      setTestError('请填写完整的邮件配置');
      return;
    }

    setTestStatus('loading');
    setTestError('');

    try {
      if (window.electronAPI?.testEmailConfig) {
        const result = await window.electronAPI.testEmailConfig(localEmailConfig);
        if (result.success) {
          setTestStatus('success');
        } else {
          setTestStatus('error');
          setTestError(result.error || '发送失败');
        }
      } else {
        setTestStatus('error');
        setTestError('邮件功能仅在桌面端可用');
      }
    } catch (error) {
      setTestStatus('error');
      setTestError((error as Error).message);
    }
  };

  const handleSaveEmailConfig = () => {
    onUpdateEmailConfig(localEmailConfig);
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
          {/* 模块管理 */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">模块管理</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="text-sm text-gray-900 dark:text-white">OJ热力图</span>
                </div>
                <button
                  onClick={() => handleModuleToggle('ojHeatmap')}
                  className={`transition-colors ${config.modules.ojHeatmap ? 'text-blue-500' : 'text-gray-400'}`}
                >
                  {config.modules.ojHeatmap ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4 text-pink-500" />
                  <span className="text-sm text-gray-900 dark:text-white">小红与小田</span>
                </div>
                <button
                  onClick={() => handleModuleToggle('coupleHeatmap')}
                  className={`transition-colors ${config.modules.coupleHeatmap ? 'text-blue-500' : 'text-gray-400'}`}
                >
                  {config.modules.coupleHeatmap ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-gray-900 dark:text-white">资源中心</span>
                </div>
                <button
                  onClick={() => handleModuleToggle('resourceCenter')}
                  className={`transition-colors ${config.modules.resourceCenter ? 'text-blue-500' : 'text-gray-400'}`}
                >
                  {config.modules.resourceCenter ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Cpu className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm text-gray-900 dark:text-white">资源实时数据</span>
                </div>
                <button
                  onClick={() => handleModuleToggle('resourceRealtime')}
                  className={`transition-colors ${config.modules.resourceRealtime ? 'text-blue-500' : 'text-gray-400'}`}
                >
                  {config.modules.resourceRealtime ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-gray-900 dark:text-white">网站管理</span>
                </div>
                <button
                  onClick={() => handleModuleToggle('passwordManager')}
                  className={`transition-colors ${config.modules.passwordManager ? 'text-blue-500' : 'text-gray-400'}`}
                >
                  {config.modules.passwordManager ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                </button>
              </div>


            </div>
          </div>

          {/* 邮件提醒配置 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">邮件到期提醒</h4>
              <button
                onClick={() => setLocalEmailConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`transition-colors ${localEmailConfig.enabled ? 'text-blue-500' : 'text-gray-400'}`}
              >
                {localEmailConfig.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
              </button>
            </div>

            {localEmailConfig.enabled && (
              <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <Server className="w-3 h-3" />
                    SMTP 服务器
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={localEmailConfig.smtp.host}
                      onChange={(e) => setLocalEmailConfig(prev => ({
                        ...prev,
                        smtp: { ...prev.smtp, host: e.target.value }
                      }))}
                      placeholder="smtp.163.com"
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="number"
                      value={localEmailConfig.smtp.port}
                      onChange={(e) => setLocalEmailConfig(prev => ({
                        ...prev,
                        smtp: { ...prev.smtp, port: parseInt(e.target.value) || 465 }
                      }))}
                      placeholder="465"
                      className="w-20 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      id="smtp-secure"
                      checked={localEmailConfig.smtp.secure}
                      onChange={(e) => setLocalEmailConfig(prev => ({
                        ...prev,
                        smtp: { ...prev.smtp, secure: e.target.checked }
                      }))}
                      className="rounded"
                    />
                    <label htmlFor="smtp-secure" className="text-xs text-gray-500 dark:text-gray-400">
                      使用 SSL/TLS (端口 465 建议开启)
                    </label>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <Mail className="w-3 h-3" />
                    发件邮箱
                  </label>
                  <input
                    type="email"
                    value={localEmailConfig.smtp.user}
                    onChange={(e) => setLocalEmailConfig(prev => ({
                      ...prev,
                      smtp: { ...prev.smtp, user: e.target.value }
                    }))}
                    placeholder="your-email@163.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <Key className="w-3 h-3" />
                    授权码 (非邮箱密码)
                  </label>
                  <input
                    type="password"
                    value={localEmailConfig.smtp.pass}
                    onChange={(e) => setLocalEmailConfig(prev => ({
                      ...prev,
                      smtp: { ...prev.smtp, pass: e.target.value }
                    }))}
                    placeholder="SMTP授权码"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    163/QQ邮箱需要在设置中开启SMTP并获取授权码
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <Mail className="w-3 h-3" />
                    收件邮箱
                  </label>
                  <input
                    type="email"
                    value={localEmailConfig.recipient}
                    onChange={(e) => setLocalEmailConfig(prev => ({
                      ...prev,
                      recipient: e.target.value
                    }))}
                    placeholder="receive@example.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* 测试和保存按钮 */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleTestEmail}
                    disabled={testStatus === 'loading'}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {testStatus === 'loading' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    发送测试邮件
                  </button>
                  <button
                    onClick={handleSaveEmailConfig}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                  >
                    保存配置
                  </button>
                </div>

                {/* 测试结果 */}
                {testStatus === 'success' && (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    测试邮件发送成功！
                  </div>
                )}
                {testStatus === 'error' && (
                  <div className="flex items-center gap-2 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {testError}
                  </div>
                )}
              </div>
            )}
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
  heatmapData: HeatmapData;
  onUpdateHeatmap: (person: 'guyue' | 'xiaohong', date: string, value: number) => void;
  resourceData: ResourceCenterData;
  onUpdateResourceData: (data: ResourceCenterData) => void;
}

type SubPage = 'oj-heatmap' | 'couple-heatmap' | 'resource-center' | 'resource-realtime' | 'password-manager';

interface NavItem {
  id: SubPage;
  name: string;
  icon: React.ReactNode;
  configKey: keyof DataCenterConfig['modules'];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'oj-heatmap',
    name: 'OJ热力图',
    icon: <Flame className="w-4 h-4" />,
    configKey: 'ojHeatmap',
  },
  {
    id: 'couple-heatmap',
    name: '小红与小田',
    icon: <Heart className="w-4 h-4" />,
    configKey: 'coupleHeatmap',
  },
  {
    id: 'resource-center',
    name: '资源中心',
    icon: <Package className="w-4 h-4" />,
    configKey: 'resourceCenter',
  },
  {
    id: 'resource-realtime',
    name: '资源实时数据',
    icon: <Cpu className="w-4 h-4" />,
    configKey: 'resourceRealtime',
  },
  {
    id: 'password-manager',
    name: '网站管理',
    icon: <Shield className="w-4 h-4" />,
    configKey: 'passwordManager',
  },
];

export const DataCenterManager: React.FC<DataCenterManagerProps> = ({
  ojHeatmapData,
  onUpdateOJHeatmapData,
  heatmapData,
  onUpdateHeatmap,
  resourceData,
  onUpdateResourceData,
}) => {
  const [activePage, setActivePage] = useState<SubPage>('oj-heatmap');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 数据中心配置
  const [config, setConfig] = useState<DataCenterConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DATACENTER_CONFIG);
      return normalizeDataCenterConfig(saved ? JSON.parse(saved) : DEFAULT_DATACENTER_CONFIG);
    } catch {
      return DEFAULT_DATACENTER_CONFIG;
    }
  });

  // 邮件配置
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EMAIL_CONFIG);
      return saved ? JSON.parse(saved) : DEFAULT_EMAIL_CONFIG;
    } catch {
      return DEFAULT_EMAIL_CONFIG;
    }
  });

  // 保存配置到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DATACENTER_CONFIG, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EMAIL_CONFIG, JSON.stringify(emailConfig));
  }, [emailConfig]);

  // 过滤可见的导航项
  const visibleNavItems = NAV_ITEMS.filter(item => config.modules[item.configKey]);

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
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
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
        emailConfig={emailConfig}
        onUpdateEmailConfig={setEmailConfig}
      />

      {/* 右侧内容区域 */}
      <div className="flex-1 p-4 overflow-auto">
        {activePage === 'oj-heatmap' && (
          <OJHeatmapContainer
            data={ojHeatmapData}
            onUpdateData={onUpdateOJHeatmapData}
          />
        )}
        {activePage === 'couple-heatmap' && (
          <CoupleHeatmapContainer
            heatmapData={heatmapData}
            onUpdateHeatmap={onUpdateHeatmap}
          />
        )}
        {activePage === 'resource-center' && (
          <ResourceCenter
            data={resourceData}
            onUpdateData={onUpdateResourceData}
          />
        )}
        {activePage === 'resource-realtime' && (
          <ResourceRealtimeData />
        )}
        {activePage === 'password-manager' && (
          <PasswordManager />
        )}
      </div>
    </div>
  );
};

export default DataCenterManager;
