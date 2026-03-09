import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Cpu,
  LogIn,
  RefreshCw,
  Settings,
  ToggleLeft,
  ToggleRight,
  X
} from 'lucide-react';
import type { ZenmuxUsage } from '../../types';

const STORAGE_KEY_RESOURCE_REALTIME = 'linkmaster_resource_realtime_v2';
const APP_DATA_KEY_RESOURCE_REALTIME = 'resource-realtime';

const REFRESH_INTERVAL_OPTIONS = [
  { label: '1 分钟', value: 60 },
  { label: '5 分钟', value: 300 },
  { label: '15 分钟', value: 900 },
  { label: '30 分钟', value: 1800 },
];

interface ResourceRealtimeState {
  autoRefreshEnabled: boolean;
  refreshIntervalSec: number;
  hasLoggedIn: boolean;
  lastSyncedAt?: number;
  zenmuxUsage?: ZenmuxUsage;
}

interface RealtimeSettingsValue {
  autoRefreshEnabled: boolean;
  refreshIntervalSec: number;
}

const DEFAULT_STATE: ResourceRealtimeState = {
  autoRefreshEnabled: true,
  refreshIntervalSec: 300,
  hasLoggedIn: false,
  lastSyncedAt: undefined,
  zenmuxUsage: undefined,
};

const normalizeState = (raw: Partial<ResourceRealtimeState> | null | undefined): ResourceRealtimeState => {
  const interval = raw?.refreshIntervalSec ?? DEFAULT_STATE.refreshIntervalSec;
  const hasInterval = REFRESH_INTERVAL_OPTIONS.some(option => option.value === interval);

  return {
    ...DEFAULT_STATE,
    ...(raw ?? {}),
    refreshIntervalSec: hasInterval ? interval : DEFAULT_STATE.refreshIntervalSec,
  };
};

const formatTime = (timestamp?: number): string => {
  if (!timestamp) return '未同步';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatResetTime = (value?: string | null): string => {
  if (!value) return '未返回';
  const raw = value.trim();
  if (!raw) return '未返回';

  const dayClock = raw.match(/^(\d+)\s*d\s*(\d{1,2}):(\d{2})(?::\d{2})?$/i);
  if (dayClock) {
    return `${dayClock[1]}天 ${String(Number(dayClock[2])).padStart(2, '0')}:${dayClock[3]}`;
  }

  const zhDuration = raw.match(/^\s*(?:(\d+)\s*天)?\s*(?:(\d+)\s*小时)?\s*(?:(\d+)\s*分(?:钟)?)?\s*$/);
  if (zhDuration) {
    const hasAny = zhDuration[1] || zhDuration[2] || zhDuration[3];
    if (hasAny) {
      const days = Number(zhDuration[1] ?? '0');
      const hours = Number(zhDuration[2] ?? '0');
      const minutes = Number(zhDuration[3] ?? '0');
      if (days > 0) {
        return `${days}天 ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }
  }

  const hhmmss = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmmss) {
    return `${Number(hhmmss[1])}:${hhmmss[2]}`;
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return raw
    .replace(/(\d{1,2}:\d{2})(:\d{2})/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseRemainingDurationMs = (value?: string | null): number | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const dayClockMatch = raw.match(/^(\d+)\s*d\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/i);
  if (dayClockMatch) {
    const days = Number(dayClockMatch[1] ?? '0');
    const h = Number(dayClockMatch[2] ?? '0');
    const m = Number(dayClockMatch[3] ?? '0');
    const s = Number(dayClockMatch[4] ?? '0');
    return Math.max(0, (((days * 24 + h) * 60 + m) * 60 + s) * 1000);
  }

  const zhDuration = raw.match(/^\s*(?:(\d+)\s*天)?\s*(?:(\d+)\s*小时)?\s*(?:(\d+)\s*分(?:钟)?)?\s*$/);
  if (zhDuration) {
    const hasAny = zhDuration[1] || zhDuration[2] || zhDuration[3];
    if (hasAny) {
      const days = Number(zhDuration[1] ?? '0');
      const h = Number(zhDuration[2] ?? '0');
      const m = Number(zhDuration[3] ?? '0');
      return Math.max(0, (((days * 24 + h) * 60 + m) * 60) * 1000);
    }
  }

  const hhmmss = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const h = Number(hhmmss[1] ?? '0');
    const m = Number(hhmmss[2] ?? '0');
    const s = Number(hhmmss[3] ?? '0');
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      return Math.max(0, ((h * 60 + m) * 60 + s) * 1000);
    }
  }

  return null;
};

const parseResetTargetTime = (value?: string | null): number | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.getTime();
  }

  const cnDateMatch = raw.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (cnDateMatch) {
    const target = new Date(
      Number(cnDateMatch[1]),
      Number(cnDateMatch[2]) - 1,
      Number(cnDateMatch[3]),
      Number(cnDateMatch[4]),
      Number(cnDateMatch[5]),
      Number(cnDateMatch[6] ?? '0')
    );
    if (!Number.isNaN(target.getTime())) return target.getTime();
  }

  const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const h = Number(timeMatch[1] ?? '0');
    const m = Number(timeMatch[2] ?? '0');
    const s = Number(timeMatch[3] ?? '0');
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      const now = new Date();
      const target = new Date(now);
      target.setHours(h, m, s, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target.getTime();
    }
  }

  return null;
};

const computeResetProgress = (resetAt: string | null | undefined, windowMs: number): number => {
  const durationRemaining = parseRemainingDurationMs(resetAt);
  const target = parseResetTargetTime(resetAt);
  const absoluteRemaining = target ? target - Date.now() : null;

  let remaining: number | null = null;

  // 对 "4:07" 这种值优先按倒计时处理，避免被当作当天时刻导致进度异常
  if (durationRemaining !== null && durationRemaining <= windowMs) {
    remaining = durationRemaining;
  } else if (absoluteRemaining !== null) {
    remaining = absoluteRemaining;
  } else if (durationRemaining !== null) {
    remaining = durationRemaining;
  }

  if (remaining === null) return 0;
  if (remaining <= 0) return 100;
  if (remaining >= windowMs) return 0;

  const elapsed = windowMs - remaining;
  return Math.min(100, Math.max(0, (elapsed / windowMs) * 100));
};

const ResourceRealtimeSettingsModal: React.FC<{
  isOpen: boolean;
  value: RealtimeSettingsValue;
  onClose: () => void;
  onSave: (value: RealtimeSettingsValue) => void;
}> = ({ isOpen, value, onClose, onSave }) => {
  const [localValue, setLocalValue] = useState<RealtimeSettingsValue>(value);

  useEffect(() => {
    if (isOpen) setLocalValue(value);
  }, [isOpen, value]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">资源实时数据设置</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl bg-gray-50 dark:bg-gray-700/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
            <p>请先点击右下角设置菜单中的"登录 Zenmux"按钮。</p>
            <p>登录成功后，再点击"同步数据"获取使用统计。</p>
          </div>

          <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-200">自动刷新</span>
              <button
                onClick={() => setLocalValue(prev => ({ ...prev, autoRefreshEnabled: !prev.autoRefreshEnabled }))}
                className={`transition-colors ${localValue.autoRefreshEnabled ? 'text-blue-500' : 'text-gray-400'}`}
              >
                {localValue.autoRefreshEnabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
              </button>
            </div>

            <div className="mt-3">
              <select
                value={localValue.refreshIntervalSec}
                disabled={!localValue.autoRefreshEnabled}
                onChange={(e) => setLocalValue(prev => ({ ...prev, refreshIntervalSec: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200 disabled:opacity-50"
              >
                {REFRESH_INTERVAL_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onSave(localValue)}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export const ResourceRealtimeData: React.FC = () => {
  const [state, setState] = useState<ResourceRealtimeState>(DEFAULT_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const saveState = useCallback((nextState: ResourceRealtimeState) => {
    localStorage.setItem(STORAGE_KEY_RESOURCE_REALTIME, JSON.stringify(nextState));
    if (window.electronAPI?.saveAppData) {
      void window.electronAPI.saveAppData(APP_DATA_KEY_RESOURCE_REALTIME, nextState);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadState = async () => {
      let loaded: Partial<ResourceRealtimeState> | null = null;

      if (window.electronAPI?.loadAppData) {
        loaded = await window.electronAPI.loadAppData(APP_DATA_KEY_RESOURCE_REALTIME);
      }

      if (!loaded) {
        const local = localStorage.getItem(STORAGE_KEY_RESOURCE_REALTIME);
        if (local) {
          try {
            loaded = JSON.parse(local) as Partial<ResourceRealtimeState>;
          } catch {
            loaded = null;
          }
        }
      }

      if (!isCancelled) {
        setState(normalizeState(loaded));
        setIsLoaded(true);
      }
    };

    void loadState();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveState(state);
  }, [isLoaded, saveState, state]);

  const openLoginWindow = useCallback(async () => {
    if (!window.electronAPI?.openZenmuxLogin) {
      setError('当前环境不支持登录窗口，请在桌面端运行');
      return;
    }

    setError(null);
    try {
      await window.electronAPI.openZenmuxLogin();
    } catch (e) {
      setError((e as Error).message || '打开登录窗口失败');
    }
  }, []);

  const syncZenmuxUsage = useCallback(async (showLoading = true) => {
    if (!window.electronAPI?.fetchZenmuxUsageFromBrowser) {
      setError('当前环境不支持此请求，请在桌面端运行');
      return;
    }

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const usage = await window.electronAPI.fetchZenmuxUsageFromBrowser();
      setState(prev => ({
        ...prev,
        hasLoggedIn: true,
        lastSyncedAt: Date.now(),
        zenmuxUsage: usage,
      }));
    } catch (e) {
      setError((e as Error).message || '同步失败，请确认已登录');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !state.autoRefreshEnabled || !state.hasLoggedIn || !state.zenmuxUsage) return;

    const timer = window.setInterval(() => {
      void syncZenmuxUsage(false);
    }, state.refreshIntervalSec * 1000);

    return () => window.clearInterval(timer);
  }, [isLoaded, state.autoRefreshEnabled, state.zenmuxUsage, state.hasLoggedIn, state.refreshIntervalSec, syncZenmuxUsage]);

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

  const usage = state.zenmuxUsage;

  const settingsValue = useMemo<RealtimeSettingsValue>(() => ({
    autoRefreshEnabled: state.autoRefreshEnabled,
    refreshIntervalSec: state.refreshIntervalSec,
  }), [state.autoRefreshEnabled, state.refreshIntervalSec]);

  return (
    <div className="h-full flex flex-col overflow-auto relative">
      <div className="p-4 flex-1">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-6 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Zenmux 使用统计</h3>
              </div>
              <button
                onClick={() => void syncZenmuxUsage(true)}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 text-blue-500 ${isLoading ? 'animate-spin' : ''}`} />
                同步数据
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!usage ? (
              <div className="h-56 flex flex-col items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                <p>暂无使用数据</p>
                <p className="mt-1">请先在右下角设置中配置 Zenmux API Key</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700/40 p-6">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">账户余额</div>
                  <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                    ${usage.balance.toFixed(2)}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    数据来源: {usage.source}
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700/40 p-6">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">总花费</div>
                  <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                    ${usage.totalCost.toFixed(4)}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    总请求数: {usage.totalRequests.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700/40 p-6">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">本月请求数</div>
                  <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                    {usage.monthlyRequests.toLocaleString()}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    当前计费周期
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 dark:bg-gray-700/40 p-6">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">本月花费</div>
                  <div className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                    ${usage.monthlyCost.toFixed(4)}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    平均每次: ${usage.monthlyRequests > 0 ? (usage.monthlyCost / usage.monthlyRequests).toFixed(6) : '0.000000'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={settingsRef} className="fixed bottom-6 right-6 z-40">
        {isSettingsOpen && (
          <div className="absolute bottom-12 right-0 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[200px]">
            <button
              onClick={() => {
                void openLoginWindow();
                setIsSettingsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <LogIn className="w-4 h-4 text-indigo-500" />
              登录 Zenmux
            </button>

            <button
              onClick={() => {
                setIsConfigModalOpen(true);
                setIsSettingsOpen(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Settings className="w-4 h-4 text-gray-500" />
              刷新设置
            </button>
          </div>
        )}

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

      <ResourceRealtimeSettingsModal
        isOpen={isConfigModalOpen}
        value={settingsValue}
        onClose={() => setIsConfigModalOpen(false)}
        onSave={(value) => {
          setState(prev => ({
            ...prev,
            autoRefreshEnabled: value.autoRefreshEnabled,
            refreshIntervalSec: value.refreshIntervalSec,
          }));
          setIsConfigModalOpen(false);
        }}
      />
    </div>
  );
};

export default ResourceRealtimeData;
