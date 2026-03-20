import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, LogIn, ExternalLink, AlertCircle, Clock, Settings, X, CheckCircle2, DollarSign, Zap } from 'lucide-react';

/* ─── 设置 ─── */

interface AIStudioSettings {
  projectId: string;
}

const DEFAULT_SETTINGS: AIStudioSettings = {
  projectId: '',
};

const SETTINGS_KEY = 'aistudio_panel_settings';

function loadSettings(): AIStudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: AIStudioSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* ─── 工具函数 ─── */

const timeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' 小时前';
  return Math.floor(diff / 86400_000) + ' 天前';
};

/* ─── 子组件 ─── */

const AIStudioLogo = () => (
  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
    <span className="text-white font-bold text-sm">AI</span>
  </div>
);

/** 设置面板 */
const SettingsPanel: React.FC<{
  settings: AIStudioSettings;
  onClose: () => void;
  onChange: (s: AIStudioSettings) => void;
}> = ({ settings, onClose, onChange }) => {
  const [localProjectId, setLocalProjectId] = useState(settings.projectId);

  const handleSaveProjectId = () => {
    const next = { ...settings, projectId: localProjectId.trim() };
    onChange(next);
    saveSettings(next);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">面板设置</span>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 block mb-1">Google Cloud Project ID</label>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">可选，留空则显示所有项目的 API Keys</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={localProjectId}
            onChange={e => setLocalProjectId(e.target.value)}
            placeholder="例如: gen-lang-client-0920415801"
            className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
          />
          <button
            onClick={handleSaveProjectId}
            className="px-3 py-1.5 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

/** 将金额字符串转换为人民币 */
function toCNY(amountStr: string, rates: Record<string, number>): string {
  if (!amountStr || !rates || Object.keys(rates).length === 0) return '';
  const match = amountStr.match(/^([A-Z]{2,3}|[\$¥€£RM]+)\s*([\d,.]+)/);
  if (!match) return '';
  let code = match[1].toUpperCase();
  const value = parseFloat(match[2].replace(/,/g, ''));
  if (isNaN(value) || value === 0) return '';
  // 映射别名
  if (code === '$') code = 'USD';
  else if (code === '€') code = 'EUR';
  else if (code === '£') code = 'GBP';
  else if (code === 'RM') code = 'MYR';
  if (code === 'CNY') return '';
  const rate = rates[code];
  if (!rate) return '';
  return `≈ ¥${(value * rate).toFixed(2)}`;
}

/** 层级徽章颜色 */
const tierColor = (tier: string) => {
  if (tier.includes('免费')) return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
  if (tier.includes('1')) return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400';
  if (tier.includes('2')) return 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400';
  return 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400';
};

/* ─── 主组件 ─── */

interface APIKeyInfo {
  keyHash: string;
  keyName: string;
  keyId: string;
  projectId: string;
  createdDate: string;
  quotaTier: string;
  needsBilling: boolean;
}

export const AIStudioPanel: React.FC = () => {
  const [dashData, setDashData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AIStudioSettings>(loadSettings);
  const hasAutoOpenedLogin = useRef(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (window.electronAPI?.fetchAIStudioData) {
        const params = settings.projectId ? { projectId: settings.projectId } : undefined;
        const result = await window.electronAPI.fetchAIStudioData(params);
        setDashData(result);
        if (result?.loginRequired) {
          setError('login-required');
          if (!hasAutoOpenedLogin.current) {
            hasAutoOpenedLogin.current = true;
            window.electronAPI?.openAIStudioLogin?.();
          }
        } else if (result?.error) {
          setError(result.error);
        } else {
          hasAutoOpenedLogin.current = false;
        }
      } else {
        setError('仅在桌面端可用');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [settings.projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogin = () => window.electronAPI?.openAIStudioLogin();
  const handleOpenExternal = () => {
    const url = settings.projectId
      ? `https://aistudio.google.com/api-keys?project=${encodeURIComponent(settings.projectId)}`
      : 'https://aistudio.google.com/apikey';
    window.electronAPI?.openPath?.(url);
  };

  const loginRequired = error === 'login-required' || dashData?.loginRequired;
  const hasData = !!(dashData?.data);
  const rates: Record<string, number> = dashData?.data?.exchangeRates ?? {};

  // 有结算信息的项目（即可能产生花销的项目）
  const paidSpend: any[] = (dashData?.data?.spend?.projects ?? []).filter(
    (p: any) => !p.noBilling
  );
  const allUsage: any[] = dashData?.data?.usage?.projects ?? [];

  // 合并 spend + usage，以 name 对齐
  const paidProjectNames = [...new Set(paidSpend.map((p: any) => p.name))];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <AIStudioLogo />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">AI Studio</h2>
            {dashData?.data?.userEmail && (
              <p className="text-[10px] text-gray-400 mt-0.5">{dashData.data.userEmail}</p>
            )}
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
            onClick={() => setShowSettings(v => !v)}
            className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
            title="面板设置"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            title="在浏览器中打开"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onClose={() => setShowSettings(false)}
          onChange={setSettings}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {isLoading && !hasData && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">正在获取数据...</p>
              <p className="text-xs text-gray-400 mt-1">首次加载可能需要 5-10 秒</p>
            </div>
          </div>
        )}

        {loginRequired && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <AIStudioLogo />
            <div className="text-center max-w-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">登录 Google AI Studio</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                请在独立窗口中使用 Google 账号登录，登录后会话将持久保存。
              </p>
            </div>
            <div className="flex flex-col gap-3 w-64">
              <button
                onClick={handleLogin}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
              >
                <LogIn className="w-4 h-4" />
                打开登录窗口
              </button>
              <button
                onClick={fetchData}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 transition-all active:scale-[0.98]"
              >
                <CheckCircle2 className="w-4 h-4" />
                已登录，刷新数据
              </button>
            </div>
          </div>
        )}

        {error && error !== 'login-required' && !isLoading && !loginRequired && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">获取数据失败</p>
              <p className="text-xs text-gray-400 mt-1">{error}</p>
            </div>
            <button onClick={fetchData} className="px-4 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              重试
            </button>
          </div>
        )}

        {!isLoading && !loginRequired && !error && !hasData && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <AlertCircle className="w-10 h-10 text-amber-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">未获取到数据</p>
              <p className="text-xs text-gray-400 mt-1">请确认已登录 Google 账号后重试</p>
            </div>
            <button onClick={fetchData} className="px-4 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              重试
            </button>
          </div>
        )}

        {hasData && !loginRequired && (
          <div className="space-y-4 max-w-2xl mx-auto">
            {/* 概览卡片 */}
            <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/20">
              <div className="mb-2 opacity-90 text-sm font-medium">Google AI Studio</div>
              {dashData.data.userEmail && (
                <p className="text-xs opacity-70 mb-3">{dashData.data.userEmail}</p>
              )}
              <div className="flex gap-6 pt-3 border-t border-white/20">
                <div>
                  <p className="text-[10px] opacity-60 mb-0.5">付费项目</p>
                  <p className="text-xl font-bold">{paidProjectNames.length}</p>
                </div>
                <div>
                  <p className="text-[10px] opacity-60 mb-0.5">本月总费用</p>
                  <p className="text-xl font-bold">
                    {paidSpend.reduce((sum: number, p: any) => {
                      const tc = p.totalCost || p.amounts?.[0] || '';
                      const m = tc.match(/(?:[A-Z]{2,3}|[$¥€£RM]+)\s*([\d,.]+)/);
                      const val = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
                      const code = tc.match(/^([A-Z]{2,3}|[$¥€£RM]+)/)?.[1]?.toUpperCase().replace('RM', 'MYR').replace('$', 'USD') || '';
                      const r = rates[code];
                      return sum + (r ? val * r : 0);
                    }, 0).toFixed(2) !== '0.00'
                      ? `¥${paidSpend.reduce((sum: number, p: any) => {
                          const tc = p.totalCost || p.amounts?.[0] || '';
                          const m = tc.match(/(?:[A-Z]{2,3}|[$¥€£RM]+)\s*([\d,.]+)/);
                          const val = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
                          const code = tc.match(/^([A-Z]{2,3}|[$¥€£RM]+)/)?.[1]?.toUpperCase().replace('RM', 'MYR').replace('$', 'USD') || '';
                          const r = rates[code];
                          return sum + (r ? val * r : 0);
                        }, 0).toFixed(2)}`
                      : '¥0.00'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* 付费项目卡片列表 */}
            {paidProjectNames.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-400">没有付费层级的项目</div>
            ) : (
              paidProjectNames.map((name: string) => {
                const spend = paidSpend.find((p: any) => p.name === name);
                const usage = allUsage.find((p: any) => p.name === name);

                // 费用展示
                const rawAmount = spend?.totalCost || spend?.amounts?.[0] || '';
                const cnyCost = toCNY(rawAmount, rates);

                // 从 usage 提取 API 请求总数
                const overviewSec = usage?.sections?.find((s: any) => s.id === 'overview');
                const reqChart = overviewSec?.charts?.find((c: any) => c.title?.includes('请求总数') || c.title?.includes('API'));
                const totalRequests = reqChart?.dataRange?.max || '';

                // 从 usage 提取 token 数（输入 token）
                const genSec = usage?.sections?.find((s: any) => s.id === 'generate-content');
                const tokenChart = genSec?.charts?.find((c: any) => c.title?.includes('token') || c.title?.includes('Token'));
                const totalTokens = tokenChart?.dataRange?.max || '';

                return (
                  <div key={name} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {/* 项目头 */}
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{name}</span>
                        {spend?.dateRange && (
                          <span className="ml-2 text-[10px] text-gray-400">{spend.dateRange}</span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md ${tierColor(spend?.tier || usage?.tier || '')}` }>
                        {spend?.tier || usage?.tier || ''}
                      </span>
                    </div>

                    <div className="px-4 py-4 grid grid-cols-3 gap-4">
                      {/* 花费 */}
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <DollarSign className="w-3 h-3 text-amber-500" />
                          <span className="text-[10px] text-gray-400 uppercase">花费</span>
                        </div>
                        {!spend || spend.noBilling ? (
                          <p className="text-xs text-amber-500">未设置结算</p>
                        ) : rawAmount ? (
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white font-mono">{rawAmount}</p>
                            {cnyCost && <p className="text-xs text-gray-400 font-mono">{cnyCost}</p>}
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-gray-900 dark:text-white">¥0.00</p>
                        )}
                      </div>

                      {/* API 请求数 */}
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <Zap className="w-3 h-3 text-indigo-500" />
                          <span className="text-[10px] text-gray-400 uppercase">API 请求</span>
                        </div>
                        {totalRequests ? (
                          <p className="text-sm font-bold text-gray-900 dark:text-white font-mono">{totalRequests}</p>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                        {usage?.timeRange && (
                          <p className="text-[10px] text-gray-400">{usage.timeRange}</p>
                        )}
                      </div>

                      {/* Token 数 */}
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[10px] font-bold text-purple-500">T</span>
                          <span className="text-[10px] text-gray-400 uppercase">输入 Token</span>
                        </div>
                        {totalTokens ? (
                          <p className="text-sm font-bold text-gray-900 dark:text-white font-mono">{totalTokens}</p>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIStudioPanel;
