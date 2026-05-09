import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings,
  Wallet,
  X,
} from 'lucide-react';

interface ZenmuxQuota {
  usage_percentage?: number;
  resets_at?: string | null;
  max_flows?: number;
  used_flows?: number;
  remaining_flows?: number;
  used_value_usd?: number;
  max_value_usd?: number;
}

interface ZenmuxManagementData {
  subscription?: {
    plan?: {
      tier?: string;
      amount_usd?: number;
      interval?: string;
      expires_at?: string;
    };
    currency?: string;
    base_usd_per_flow?: number;
    effective_usd_per_flow?: number;
    account_status?: string;
    quota_5_hour?: ZenmuxQuota;
    quota_7_day?: ZenmuxQuota;
    quota_monthly?: Pick<ZenmuxQuota, 'max_flows' | 'max_value_usd'>;
  };
  balance?: {
    currency?: string;
    total_credits?: number;
    top_up_credits?: number;
    bonus_credits?: number;
  } | null;
  partialErrors?: Record<string, string | null>;
}

interface ZenmuxDashboardResult {
  data?: ZenmuxManagementData;
  error?: string | null;
  missingApiKey?: boolean;
  lastUpdated?: number;
  source?: string;
}

const MANAGEMENT_KEY_STORAGE = 'zenmux_management_api_key';

function loadApiKey(): string {
  try {
    return localStorage.getItem(MANAGEMENT_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function saveApiKey(apiKey: string) {
  if (apiKey.trim()) {
    localStorage.setItem(MANAGEMENT_KEY_STORAGE, apiKey.trim());
  } else {
    localStorage.removeItem(MANAGEMENT_KEY_STORAGE);
  }
}

const timeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' 小时前';
  return Math.floor(diff / 86400_000) + ' 天前';
};

function formatMoney(value: number | undefined | null, digits = 4): string {
  return `$${Number(value || 0).toFixed(digits)}`;
}

function formatPercent(value: number | undefined): string {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

const ZenmuxLogo = () => (
  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
    <span className="text-white font-bold text-sm">ZM</span>
  </div>
);

const QuotaBlock: React.FC<{ title: string; quota?: ZenmuxQuota | null }> = ({ title, quota }) => {
  const pct = Math.min(100, Math.max(0, Number(quota?.usage_percentage || 0) * 100));
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
        <span className="text-xs font-semibold text-gray-900 dark:text-white">{formatPercent(quota?.usage_percentage)}</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] text-gray-400 dark:text-gray-500">
        <div>
          <p>已用</p>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{Number(quota?.used_flows || 0).toFixed(2)}</p>
        </div>
        <div>
          <p>剩余</p>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{Number(quota?.remaining_flows || 0).toFixed(2)}</p>
        </div>
        <div>
          <p>上限</p>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{Number(quota?.max_flows || 0).toFixed(2)}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500">
        <div className="flex justify-between">
          <span>已用价值</span>
          <span>{formatMoney(quota?.used_value_usd, 2)} / {formatMoney(quota?.max_value_usd, 2)}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span>重置时间</span>
          <span>{formatDateTime(quota?.resets_at)}</span>
        </div>
      </div>
    </div>
  );
};

const MetricTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: 'indigo' | 'emerald' | 'amber' | 'gray';
}> = ({ label, value, hint, tone = 'gray' }) => {
  const valueColor = tone === 'indigo'
    ? 'text-indigo-600 dark:text-indigo-300'
    : tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-600 dark:text-amber-300'
        : 'text-gray-900 dark:text-white';

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
};

export const ZenmuxUsagePanel: React.FC = () => {
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [draftApiKey, setDraftApiKey] = useState(loadApiKey);
  const [dashData, setDashData] = useState<ZenmuxDashboardResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const fetchData = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) return;

    setIsLoading(true);
    setError(null);
    try {
      if (!window.electronAPI?.fetchZenmuxManagementData) {
        setError('仅在桌面端可用');
        return;
      }
      const result = await window.electronAPI.fetchZenmuxManagementData({ apiKey: key });
      setDashData(result);
      if (result?.error) setError(result.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    if (apiKey.trim()) fetchData();
  }, [apiKey, fetchData]);

  const handleSaveKey = () => {
    const key = draftApiKey.trim();
    saveApiKey(key);
    setApiKey(key);
    setDashData(null);
    setError(null);
    setShowSettings(false);
  };

  const handleClearKey = () => {
    saveApiKey('');
    setApiKey('');
    setDraftApiKey('');
    setDashData(null);
    setError(null);
    setShowSettings(false);
  };

  const handleOpenExternal = () => window.electronAPI?.openPath?.('https://zenmux.ai/platform');

  const data = dashData?.data;
  const hasKey = !!apiKey.trim();
  const hasData = !!data;
  const subscription = data?.subscription;
  const balance = data?.balance;
  const balanceError = data?.partialErrors?.balance;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <ZenmuxLogo />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">ZenMux Management</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dashData?.lastUpdated && (
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(dashData.lastUpdated)}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={isLoading || !hasKey}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={() => {
              setDraftApiKey(apiKey);
              setShowSettings(true);
            }}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            title="设置"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            title="打开 ZenMux 控制台"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-xl m-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-900 dark:text-white">ZenMux 设置</h4>
              <button type="button" onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block mb-1">Management API Key</label>
                <input
                  type="password"
                  value={draftApiKey}
                  onChange={(e) => setDraftApiKey(e.target.value)}
                  placeholder="ZENMUX_MANAGEMENT_API_KEY"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
              <div className="flex justify-between gap-2">
                <button
                  type="button"
                  onClick={handleClearKey}
                  className="px-3 py-1.5 text-sm rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  清除
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveKey}
                    className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-5">
        {!hasKey && (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-indigo-500" />
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">填写 Management API Key</h3>
            </div>
            <div className="w-full max-w-md flex gap-2">
              <input
                type="password"
                value={draftApiKey}
                onChange={(e) => setDraftApiKey(e.target.value)}
                placeholder="ZENMUX_MANAGEMENT_API_KEY"
                className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                onClick={handleSaveKey}
                className="px-4 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                保存
              </button>
            </div>
          </div>
        )}

        {hasKey && isLoading && !hasData && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">正在读取当前账号数据...</p>
            </div>
          </div>
        )}

        {hasKey && error && !isLoading && !hasData && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <div className="text-center max-w-md">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">获取数据失败</p>
              <p className="text-xs text-gray-400 mt-1 break-words">{error}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchData} className="px-4 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
                重试
              </button>
              <button onClick={handleClearKey} className="px-4 py-2 text-xs font-medium text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                清除 Key
              </button>
            </div>
          </div>
        )}

        {hasData && (
          <div className="space-y-5 max-w-5xl mx-auto">
            <section className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 overflow-hidden">
              <div className="px-5 py-4 border-b border-emerald-100 dark:border-emerald-900/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">PAYG</h3>
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 border border-emerald-100 dark:border-emerald-900/50">
                  <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                  {balance?.currency || 'USD'}
                </span>
              </div>

              <div className="p-5">
                {balance ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <MetricTile label="PAYG 总余额" value={formatMoney(balance.total_credits)} hint="top-up + bonus" tone="emerald" />
                    <MetricTile label="充值余额" value={formatMoney(balance.top_up_credits)} hint="top_up_credits" />
                    <MetricTile label="赠送余额" value={formatMoney(balance.bonus_credits)} hint="bonus_credits" tone="indigo" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-100 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                    PAYG 余额暂无可展示数据{balanceError ? `：${balanceError}` : ''}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                    <Crown className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Plan</h3>
                  </div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-100 dark:border-gray-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                  {subscription?.account_status || '-'}
                </span>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <MetricTile label="订阅套餐" value={subscription?.plan?.tier || '-'} hint={subscription?.plan?.interval || undefined} tone="indigo" />
                  <MetricTile label="套餐金额" value={formatMoney(subscription?.plan?.amount_usd, 2)} hint={subscription?.currency || 'USD'} />
                  <MetricTile label="有效 Flow 单价" value={formatMoney(subscription?.effective_usd_per_flow, 5)} hint="effective_usd_per_flow" tone="emerald" />
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mb-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>订阅到期</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatDateTime(subscription?.plan?.expires_at)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <QuotaBlock title="5 小时额度" quota={subscription?.quota_5_hour} />
                  <QuotaBlock title="7 天额度" quota={subscription?.quota_7_day} />
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">月度上限</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{Number(subscription?.quota_monthly?.max_flows || 0).toLocaleString()} Flow</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatMoney(subscription?.quota_monthly?.max_value_usd, 2)} quota value</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZenmuxUsagePanel;
