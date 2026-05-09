import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings,
  X,
  Zap,
} from 'lucide-react';

type ApiKeyProvider = 'kimi' | 'deepseek' | 'google';
type SecretProvider = Exclude<ApiKeyProvider, 'google'>;

interface ProviderConfig {
  id: ApiKeyProvider;
  name: string;
  description: string;
  accent: 'blue' | 'emerald' | 'teal';
  keyPlaceholder?: string;
  keyUrl?: string;
  accountUrl: string;
}

interface KimiBalanceData {
  available_balance?: number | string;
  voucher_balance?: number | string;
  cash_balance?: number | string;
}

interface DeepSeekBalanceInfo {
  currency: 'CNY' | 'USD' | string;
  total_balance?: string;
  granted_balance?: string;
  topped_up_balance?: string;
}

interface DeepSeekBalanceData {
  is_available?: boolean;
  balance_infos?: DeepSeekBalanceInfo[];
}

interface GoogleMetricBreakdown {
  model: string;
  method?: string;
  limitName?: string;
  value: number;
}

interface GoogleMetricSummary {
  type: string;
  name: string;
  displayName: string;
  category: 'requests' | 'tokens' | 'other';
  kind: 'usage' | 'limit';
  total: number;
  seriesCount: number;
  byModel: GoogleMetricBreakdown[];
  error?: string;
}

interface GoogleMetricsData {
  projectId: string;
  serviceAccountEmail: string;
  windowDays: number;
  descriptorCount: number;
  totals: {
    requests: number;
    tokens: number;
    other: number;
  };
  usage: GoogleMetricSummary[];
  limits: GoogleMetricSummary[];
}

interface GoogleConfig {
  projectId: string;
  serviceAccountJson: string;
}

type ProviderData = KimiBalanceData | DeepSeekBalanceData | GoogleMetricsData;

interface ProviderState {
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  data: ProviderData | null;
}

const LEGACY_KIMI_KEY = 'kimi_panel_api_key';
const STORAGE_PREFIX = 'api_key_panel_key_';
const GOOGLE_CONFIG_KEY = 'api_key_panel_google_config';
const LEGACY_AISTUDIO_SETTINGS_KEY = 'aistudio_panel_settings';

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'kimi',
    name: 'Kimi',
    description: 'Moonshot 开放平台余额',
    accent: 'blue',
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    accountUrl: 'https://platform.moonshot.cn/console/account',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek Open Platform 余额',
    accent: 'emerald',
    keyPlaceholder: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    accountUrl: 'https://platform.deepseek.com/usage',
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini API Cloud Monitoring 用量',
    accent: 'teal',
    accountUrl: 'https://console.cloud.google.com/monitoring/metrics-explorer',
  },
];

const emptyState: ProviderState = {
  loading: false,
  error: null,
  lastUpdated: null,
  data: null,
};

function storageKey(provider: SecretProvider): string {
  return `${STORAGE_PREFIX}${provider}`;
}

function loadKeys(): Record<SecretProvider, string> {
  return {
    kimi: localStorage.getItem(storageKey('kimi')) || localStorage.getItem(LEGACY_KIMI_KEY) || '',
    deepseek: localStorage.getItem(storageKey('deepseek')) || '',
  };
}

function saveKeys(keys: Record<SecretProvider, string>) {
  localStorage.setItem(storageKey('kimi'), keys.kimi);
  localStorage.setItem(LEGACY_KIMI_KEY, keys.kimi);
  localStorage.setItem(storageKey('deepseek'), keys.deepseek);
}

function loadGoogleConfig(): GoogleConfig {
  const fallback: GoogleConfig = { projectId: '', serviceAccountJson: '' };
  try {
    const raw = localStorage.getItem(GOOGLE_CONFIG_KEY) || localStorage.getItem(LEGACY_AISTUDIO_SETTINGS_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function saveGoogleConfig(config: GoogleConfig) {
  localStorage.setItem(GOOGLE_CONFIG_KEY, JSON.stringify(config));
}

function initialProviderState(): Record<ApiKeyProvider, ProviderState> {
  return {
    kimi: { ...emptyState },
    deepseek: { ...emptyState },
    google: { ...emptyState },
  };
}

function asNumber(value: number | string | undefined): number {
  const n = typeof value === 'number' ? value : Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number | string | undefined, currency = 'CNY'): string {
  const n = asNumber(value);
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol} ${n.toFixed(4)}`;
}

function formatNumber(value?: number): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return String(Math.round(n));
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return `${Math.floor(diff / 3_600_000)} 小时前`;
}

function tryParseServiceAccountProjectId(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.project_id === 'string' ? parsed.project_id : '';
  } catch {
    return '';
  }
}

async function fetchApiKeyBalance(provider: SecretProvider, apiKey: string): Promise<any> {
  if (window.electronAPI?.fetchApiKeyBalance) {
    const result = await window.electronAPI.fetchApiKeyBalance({ provider, apiKey });
    if (result?.error) throw new Error(result.error);
    return result?.data ?? result;
  }

  if (provider === 'kimi') {
    const response = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status === false) throw new Error(payload?.message || `HTTP ${response.status}`);
    return payload?.data ?? payload;
  }

  const response = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
  return payload?.data ?? payload;
}

async function fetchGoogleMetrics(config: GoogleConfig): Promise<GoogleMetricsData> {
  if (!window.electronAPI?.fetchGoogleApiMetrics) {
    throw new Error('仅在桌面端可用');
  }
  const result = await window.electronAPI.fetchGoogleApiMetrics(config);
  if (result?.error) throw new Error(result.error);
  return result?.data ?? result;
}

const ProviderBadge: React.FC<{ provider: ProviderConfig }> = ({ provider }) => {
  const className = provider.accent === 'emerald'
    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
    : provider.accent === 'teal'
      ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300'
      : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300';

  return (
    <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${className}`}>
      {provider.id === 'google' ? <Cloud className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
    </div>
  );
};

const BalanceCard: React.FC<{ label: string; value: string; hint?: string; tone?: 'blue' | 'emerald' | 'red' | 'gray' }> = ({ label, value, hint, tone = 'gray' }) => {
  const color = tone === 'blue'
    ? 'text-blue-600 dark:text-blue-400'
    : tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'red'
        ? 'text-red-500'
        : 'text-gray-900 dark:text-gray-100';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400 truncate">{hint}</p>}
    </div>
  );
};

const MetricLine: React.FC<{ metric: GoogleMetricSummary }> = ({ metric }) => (
  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/70 px-3 py-2">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{metric.displayName}</p>
        <p className="truncate text-[10px] text-gray-400">{metric.name}</p>
      </div>
      <span className="shrink-0 font-mono text-xs font-semibold text-gray-900 dark:text-white">{formatNumber(metric.total)}</span>
    </div>
    {metric.byModel?.length > 0 && (
      <div className="mt-1 flex flex-wrap gap-1">
        {metric.byModel.slice(0, 3).map(item => (
          <span key={`${item.model}-${item.method}-${item.limitName}`} className="rounded bg-white dark:bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
            {item.model}: {formatNumber(item.value)}
          </span>
        ))}
      </div>
    )}
  </div>
);

export const KimiPanel: React.FC = () => {
  const [keys, setKeys] = useState<Record<SecretProvider, string>>(loadKeys);
  const [draftKeys, setDraftKeys] = useState<Record<SecretProvider, string>>(loadKeys);
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>(loadGoogleConfig);
  const [draftGoogleConfig, setDraftGoogleConfig] = useState<GoogleConfig>(loadGoogleConfig);
  const [states, setStates] = useState<Record<ApiKeyProvider, ProviderState>>(initialProviderState);
  const [showSettings, setShowSettings] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<SecretProvider, boolean>>({ kimi: false, deepseek: false });
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);

  const hasConfig = useCallback((providerId: ApiKeyProvider, nextKeys = keys, nextGoogleConfig = googleConfig) => {
    if (providerId === 'google') {
      return Boolean(nextGoogleConfig.projectId.trim() && nextGoogleConfig.serviceAccountJson.trim());
    }
    return Boolean(nextKeys[providerId].trim());
  }, [googleConfig, keys]);

  const configuredProviders = useMemo(
    () => PROVIDERS.filter(provider => hasConfig(provider.id)),
    [hasConfig],
  );
  const anyLoading = Object.values(states).some(state => state.loading);

  const refreshProvider = useCallback(async (
    providerId: ApiKeyProvider,
    nextKeys = keys,
    nextGoogleConfig = googleConfig,
  ) => {
    if (!hasConfig(providerId, nextKeys, nextGoogleConfig)) {
      setStates(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], error: providerId === 'google' ? '请先配置 Project ID 和 Service Account JSON' : '请先配置 API Key', loading: false },
      }));
      return;
    }

    setStates(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], loading: true, error: null },
    }));

    try {
      const data = providerId === 'google'
        ? await fetchGoogleMetrics(nextGoogleConfig)
        : await fetchApiKeyBalance(providerId, nextKeys[providerId]);
      setStates(prev => ({
        ...prev,
        [providerId]: { loading: false, error: null, lastUpdated: Date.now(), data },
      }));
    } catch (error) {
      setStates(prev => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }, [googleConfig, hasConfig, keys]);

  const refreshAll = useCallback(() => {
    configuredProviders.forEach(provider => {
      void refreshProvider(provider.id);
    });
  }, [configuredProviders, refreshProvider]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleOpenSettings = () => {
    setDraftKeys(keys);
    setDraftGoogleConfig(googleConfig);
    setShowSettings(true);
  };

  const copyText = useCallback(async (target: string, value: string) => {
    const text = value.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedTarget(target);
    window.setTimeout(() => setCopiedTarget(current => current === target ? null : current), 1400);
  }, []);

  const handleGoogleJsonChange = (value: string) => {
    const inferredProjectId = tryParseServiceAccountProjectId(value);
    setDraftGoogleConfig(prev => ({
      serviceAccountJson: value,
      projectId: prev.projectId || inferredProjectId,
    }));
  };

  const handleSaveSettings = () => {
    const nextKeys: Record<SecretProvider, string> = {
      kimi: draftKeys.kimi.trim(),
      deepseek: draftKeys.deepseek.trim(),
    };
    const inferredProjectId = tryParseServiceAccountProjectId(draftGoogleConfig.serviceAccountJson);
    const nextGoogleConfig: GoogleConfig = {
      projectId: (draftGoogleConfig.projectId || inferredProjectId).trim(),
      serviceAccountJson: draftGoogleConfig.serviceAccountJson.trim(),
    };

    saveKeys(nextKeys);
    saveGoogleConfig(nextGoogleConfig);
    setKeys(nextKeys);
    setGoogleConfig(nextGoogleConfig);
    setShowSettings(false);
    PROVIDERS.forEach(provider => {
      if (hasConfig(provider.id, nextKeys, nextGoogleConfig)) {
        void refreshProvider(provider.id, nextKeys, nextGoogleConfig);
      }
    });
  };

  const renderKimiBalance = (data: KimiBalanceData) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <BalanceCard label="可用余额" value={formatMoney(data.available_balance)} hint="含现金与代金券" tone="blue" />
      <BalanceCard label="代金券余额" value={formatMoney(data.voucher_balance)} hint="平台赠送额度" tone="emerald" />
      <BalanceCard
        label="现金余额"
        value={formatMoney(data.cash_balance)}
        hint={asNumber(data.cash_balance) < 0 ? '账户欠费' : '充值余额'}
        tone={asNumber(data.cash_balance) < 0 ? 'red' : 'gray'}
      />
    </div>
  );

  const renderDeepSeekBalance = (data: DeepSeekBalanceData) => {
    const infos = Array.isArray(data.balance_infos) ? data.balance_infos : [];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {data.is_available
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : <AlertCircle className="w-4 h-4 text-amber-500" />}
          <span className="text-gray-700 dark:text-gray-200">
            {data.is_available ? '当前余额可用于 API 调用' : '当前余额不可用于 API 调用'}
          </span>
        </div>
        {infos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {infos.map(info => (
              <React.Fragment key={info.currency}>
                <BalanceCard label={`${info.currency} 总余额`} value={formatMoney(info.total_balance, info.currency)} hint="含赠金与充值余额" tone="emerald" />
                <BalanceCard label={`${info.currency} 赠金余额`} value={formatMoney(info.granted_balance, info.currency)} hint="未过期赠金" tone="blue" />
                <BalanceCard label={`${info.currency} 充值余额`} value={formatMoney(info.topped_up_balance, info.currency)} hint="充值余额" />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderGoogleMetrics = (data: GoogleMetricsData) => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BalanceCard label={`近 ${data.windowDays} 天请求`} value={formatNumber(data.totals.requests)} hint={data.projectId} tone="blue" />
        <BalanceCard label={`近 ${data.windowDays} 天 Token`} value={formatNumber(data.totals.tokens)} hint="Cloud Monitoring quota usage" />
        <BalanceCard label="可用指标" value={String(data.descriptorCount)} hint={data.serviceAccountEmail} tone="emerald" />
      </div>
      {data.usage.length === 0 ? (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/70 p-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">暂时没有 Gemini API 用量数据</p>
          <p className="mt-1 text-xs text-gray-400">确认这个 Project 的 API Key 已实际调用过 Gemini API，并等待 Cloud Monitoring 同步。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.usage.slice(0, 5).map(metric => <MetricLine key={metric.type} metric={metric} />)}
        </div>
      )}
    </div>
  );

  const renderProvider = (provider: ProviderConfig) => {
    const state = states[provider.id];
    const configured = hasConfig(provider.id);

    return (
      <section key={provider.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <ProviderBadge provider={provider} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{provider.name}</h4>
                {state.lastUpdated && <span className="text-[11px] text-gray-400">{timeAgo(state.lastUpdated)}</span>}
              </div>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{provider.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {configured && provider.id !== 'google' && (
              <button
                type="button"
                onClick={() => void copyText(`${provider.id}-key`, keys[provider.id as SecretProvider])}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                title="复制 API Key"
              >
                {copiedTarget === `${provider.id}-key` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
            {configured && provider.id === 'google' && (
              <button
                type="button"
                onClick={() => void copyText('google-project', googleConfig.projectId)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                title="复制 Project ID"
              >
                {copiedTarget === 'google-project' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refreshProvider(provider.id)}
              disabled={!configured || state.loading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40 transition-colors"
              title="刷新"
            >
              {state.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <a
              href={provider.id === 'google' && googleConfig.projectId ? `${provider.accountUrl}?project=${encodeURIComponent(googleConfig.projectId)}` : provider.accountUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              title="打开控制台"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {!configured && (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {provider.id === 'google' ? '未配置 Project ID 和 Service Account JSON' : '未配置 API Key'}
            </p>
            <button
              type="button"
              onClick={handleOpenSettings}
              className="mt-3 px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600"
            >
              配置
            </button>
          </div>
        )}

        {state.error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
          </div>
        )}

        {configured && state.data && provider.id === 'kimi' && renderKimiBalance(state.data as KimiBalanceData)}
        {configured && state.data && provider.id === 'deepseek' && renderDeepSeekBalance(state.data as DeepSeekBalanceData)}
        {configured && state.data && provider.id === 'google' && renderGoogleMetrics(state.data as GoogleMetricsData)}

        {configured && !state.data && !state.loading && !state.error && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/70 p-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">点击刷新查询数据</p>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound className="w-5 h-5 text-teal-600 dark:text-teal-300" />
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">API Key</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">管理 Kimi、DeepSeek 和 Google API 数据</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refreshAll}
            disabled={configuredProviders.length === 0 || anyLoading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40 transition-colors"
            title="刷新全部"
          >
            {anyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleOpenSettings}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {PROVIDERS.map(renderProvider)}
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto m-4 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h4 className="font-semibold text-gray-900 dark:text-white">API Key 设置</h4>
              <button type="button" onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-5">
              {PROVIDERS.filter(provider => provider.id !== 'google').map(provider => (
                <div key={provider.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{provider.name} API Key</label>
                    {provider.keyUrl && (
                      <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
                        创建 Key
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showKeys[provider.id as SecretProvider] ? 'text' : 'password'}
                      value={draftKeys[provider.id as SecretProvider]}
                      onChange={event => setDraftKeys(prev => ({ ...prev, [provider.id]: event.target.value }))}
                      placeholder={provider.keyPlaceholder}
                      className="w-full px-3 py-2 pr-16 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeys(prev => ({ ...prev, [provider.id as SecretProvider]: !prev[provider.id as SecretProvider] }))}
                      className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showKeys[provider.id as SecretProvider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(`${provider.id}-draft`, draftKeys[provider.id as SecretProvider])}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      title="复制"
                    >
                      {copiedTarget === `${provider.id}-draft` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}

              <div className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-teal-500" />
                  <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Google Gemini API</h5>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block mb-1">Google Cloud Project ID</label>
                  <input
                    type="text"
                    value={draftGoogleConfig.projectId}
                    onChange={event => setDraftGoogleConfig(prev => ({ ...prev, projectId: event.target.value }))}
                    placeholder="例如: gen-lang-client-0920415801"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block mb-1">Service Account JSON</label>
                  <textarea
                    value={draftGoogleConfig.serviceAccountJson}
                    onChange={event => handleGoogleJsonChange(event.target.value)}
                    placeholder="粘贴 gemini-usage-monitor.json 的完整内容"
                    rows={7}
                    spellCheck={false}
                    className="w-full px-3 py-2 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">Google 不能用普通 API Key 查余额；这里通过 Service Account 读取 Cloud Monitoring 用量。</p>
                    <button
                      type="button"
                      onClick={() => void copyText('google-json-draft', draftGoogleConfig.serviceAccountJson)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-600 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      {copiedTarget === 'google-json-draft' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      复制 JSON
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                Kimi 和 DeepSeek 展示余额；Google 展示 Cloud Monitoring 能直接读取的 Gemini API 请求、Token 和 quota 指标。
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KimiPanel;
