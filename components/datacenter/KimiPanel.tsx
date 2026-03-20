import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Loader2, Settings, X, Eye, EyeOff, ExternalLink, AlertCircle } from 'lucide-react';

const STORAGE_KEY = 'kimi_panel_api_key';

function loadApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

function saveApiKey(key: string) {
  localStorage.setItem(STORAGE_KEY, key);
}

interface BalanceData {
  available_balance: number;
  voucher_balance: number;
  cash_balance: number;
}

const KimiLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="8" fill="#1A1A2E" />
    <text x="16" y="22" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#7B68EE">K</text>
  </svg>
);

const fmt = (n: number) => n.toFixed(4);

export const KimiPanel: React.FC = () => {
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [showKey, setShowKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchBalance = useCallback(async (key?: string) => {
    const k = key ?? apiKey;
    if (!k) {
      setError('请先配置 Kimi API Key');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('https://api.moonshot.cn/v1/users/me/balance', {
        headers: { Authorization: `Bearer ${k}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const json = await res.json();
      if (!json.status) throw new Error(json.message || '查询失败');
      setBalance(json.data);
      setLastUpdated(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleSaveKey = () => {
    const trimmed = inputKey.trim();
    saveApiKey(trimmed);
    setApiKey(trimmed);
    setShowSettings(false);
    setInputKey('');
    if (trimmed) fetchBalance(trimmed);
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    return `${Math.floor(diff / 3_600_000)} 小时前`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KimiLogo />
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Kimi API</h3>
          {lastUpdated && (
            <span className="text-xs text-gray-400">{timeAgo(lastUpdated)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchBalance()}
            disabled={loading || !apiKey}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40 transition-colors"
            title="刷新"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button
            onClick={() => { setShowSettings(true); setInputKey(apiKey); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            title="设置 API Key"
          >
            <Settings className="w-4 h-4" />
          </button>
          <a
            href="https://platform.moonshot.cn/console/account"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            title="前往 Kimi 控制台"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm m-4 shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-900 dark:text-white">Kimi API Key</h4>
              <button type="button" onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                在 <a href="https://platform.moonshot.cn/console/api-keys" target="_blank" rel="noreferrer" className="text-blue-500 underline">Kimi 开放平台</a> 创建 API Key 后填入。
              </p>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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
                  onClick={handleSaveKey}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No API key prompt */}
      {!apiKey && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
          <Settings className="w-8 h-8" />
          <p className="text-sm">请点击右上角设置按钮配置 API Key</p>
          <button
            onClick={() => { setShowSettings(true); setInputKey(''); }}
            className="px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            配置 API Key
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Balance cards */}
      {balance && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">可用余额</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">¥ {fmt(balance.available_balance)}</p>
              <p className="text-xs text-gray-400 mt-1">含现金与代金券</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">代金券余额</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">¥ {fmt(balance.voucher_balance)}</p>
              <p className="text-xs text-gray-400 mt-1">不计入欠费</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">现金余额</p>
              <p className={`text-lg font-bold ${balance.cash_balance < 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>
                ¥ {fmt(balance.cash_balance)}
              </p>
              {balance.cash_balance < 0 && (
                <p className="text-xs text-red-400 mt-1">账户欠费</p>
              )}
            </div>
          </div>

          {balance.available_balance <= 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">余额不足，请及时充值以继续使用 API。</p>
              <a
                href="https://platform.moonshot.cn/console/account"
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs text-blue-500 hover:underline whitespace-nowrap"
              >
                去充值
              </a>
            </div>
          )}
        </>
      )}

      {/* First load prompt */}
      {apiKey && !balance && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-gray-400">
          <p className="text-sm">点击刷新按钮查询余额</p>
          <button
            onClick={() => fetchBalance()}
            className="px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            查询余额
          </button>
        </div>
      )}
    </div>
  );
};

export default KimiPanel;
