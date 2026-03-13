import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, LogIn, ExternalLink, CheckCircle2, AlertCircle, Clock, Settings, X, ToggleLeft, ToggleRight } from 'lucide-react';

/* ─── 设置 ─── */

interface ZenmuxPanelSettings {
  showRequestCounts: boolean;
  showModelBreakdown: boolean;
  showMonthlyHistory: boolean;
}

const DEFAULT_SETTINGS: ZenmuxPanelSettings = {
  showRequestCounts: false,
  showModelBreakdown: false,
  showMonthlyHistory: false,
};

const SETTINGS_KEY = 'zenmux_panel_settings';

function loadSettings(): ZenmuxPanelSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: ZenmuxPanelSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* ─── 工具函数 ─── */

/** "20260308" → "03/08" */
const fmtDate = (s: string) => s.length === 8 ? s.slice(4, 6) + '/' + s.slice(6, 8) : s;

/** "202603" → "2026年03月" */
const fmtMonth = (s: string) => s.length === 6 ? `${s.slice(0, 4)}年${s.slice(4, 6)}月` : s;

/** "20260308" → "03月08日 周x" */
const fmtDateFull = (s: string) => {
  if (s.length !== 8) return s;
  const y = +s.slice(0, 4), m = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m, d).getDay()];
  return `${s.slice(4, 6)}月${s.slice(6, 8)}日 周${weekday}`;
};

const timeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' 小时前';
  return Math.floor(diff / 86400_000) + ' 天前';
};

/* ─── 数据处理 ─── */

interface DaySummary {
  date: string;
  totalTokens: number;
  totalRequests: number;
  totalCost: number;
  topModel: string;
  topModelTokens: number;
}

interface ModelStat {
  model: string;
  tokens: number;
  requests: number;
  cost: number;
}

function aggregateDailyUsage(usageData: any): Map<string, { totalTokens: number; totalRequests: number; topModel: string; topModelTokens: number }> {
  const map = new Map<string, { totalTokens: number; totalRequests: number; models: Map<string, number> }>();
  const rows: any[] = usageData?.data?.tokensByModel ?? [];
  for (const row of rows) {
    const date = String(row.bizTime ?? '');
    const model = String(row.modelSlug ?? '');
    const tokens = Number(row.tokens ?? 0);
    const requests = Number(row.requestCounts ?? 0);
    if (!date) continue;
    let entry = map.get(date);
    if (!entry) { entry = { totalTokens: 0, totalRequests: 0, models: new Map() }; map.set(date, entry); }
    entry.totalTokens += tokens;
    entry.totalRequests += requests;
    entry.models.set(model, (entry.models.get(model) || 0) + tokens);
  }
  const result = new Map<string, { totalTokens: number; totalRequests: number; topModel: string; topModelTokens: number }>();
  for (const [date, { totalTokens, totalRequests, models }] of map) {
    let topModel = '-', topModelTokens = 0;
    for (const [m, t] of models) {
      if (t > topModelTokens) { topModel = m; topModelTokens = t; }
    }
    result.set(date, { totalTokens, totalRequests, topModel, topModelTokens });
  }
  return result;
}

function aggregateDailyCost(costData: any): Map<string, number> {
  const map = new Map<string, number>();
  const rows: any[] = costData?.data?.costByModel ?? [];
  for (const row of rows) {
    const date = String(row.bizTime ?? '');
    const cost = Number(row.billAmount ?? 0);
    if (!date) continue;
    map.set(date, (map.get(date) || 0) + cost);
  }
  return map;
}

/** 聚合所有模型维度统计 */
function aggregateModelStats(usageData: any, costData: any): ModelStat[] {
  const map = new Map<string, ModelStat>();
  const usageRows: any[] = usageData?.data?.tokensByModel ?? [];
  for (const row of usageRows) {
    const model = String(row.modelSlug ?? '');
    if (!model) continue;
    const tokens = Number(row.tokens ?? 0);
    const requests = Number(row.requestCounts ?? 0);
    let s = map.get(model);
    if (!s) { s = { model, tokens: 0, requests: 0, cost: 0 }; map.set(model, s); }
    s.tokens += tokens;
    s.requests += requests;
  }
  const costRows: any[] = costData?.data?.costByModel ?? [];
  for (const row of costRows) {
    const model = String(row.modelSlug ?? '');
    if (!model) continue;
    const cost = Number(row.billAmount ?? 0);
    let s = map.get(model);
    if (!s) { s = { model, tokens: 0, requests: 0, cost: 0 }; map.set(model, s); }
    s.cost += cost;
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens);
}

/** 计算某月总花费 */
function sumMonthlyCost(costData: any): number {
  const rows: any[] = costData?.data?.costByModel ?? [];
  return rows.reduce((s, r) => s + Number(r.billAmount ?? 0), 0);
}

function extractBalance(creditsData: any): { total: number; topUp: number; bonus: number; totalCharged: number; totalSpent: number } | null {
  const d = creditsData?.data;
  if (!d || typeof d !== 'object') return null;
  const total = Number(d.balance ?? 0);
  const topUp = Number(d.balancesMap?.charge ?? 0);
  const bonus = Number(d.balancesMap?.discount ?? 0);
  // actualFee = 历史总充值+赠送金额，spent = 已消耗
  const totalCharged = Number(d.actualFee ?? (topUp + bonus));
  const totalSpent = Math.max(0, totalCharged - total);
  if (total === 0 && topUp === 0 && bonus === 0) return null;
  return { total, topUp, bonus, totalCharged, totalSpent };
}

function getLast7Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(
      String(d.getFullYear()) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0')
    );
  }
  return days;
}

function shortModelName(slug: string): string {
  const parts = slug.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : slug;
}

/* ─── 子组件 ─── */

const ZenmuxLogo = () => (
  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
    <span className="text-white font-bold text-sm">ZM</span>
  </div>
);

/** 设置面板 */
const SettingsPanel: React.FC<{
  settings: ZenmuxPanelSettings;
  onClose: () => void;
  onChange: (s: ZenmuxPanelSettings) => void;
}> = ({ settings, onClose, onChange }) => {
  const toggle = (key: keyof ZenmuxPanelSettings) => {
    const next = { ...settings, [key]: !settings[key] };
    onChange(next);
    saveSettings(next);
  };

  const items: { key: keyof ZenmuxPanelSettings; label: string; desc: string }[] = [
    { key: 'showRequestCounts', label: '每日请求次数', desc: '在7日明细中显示每日请求次数列' },
    { key: 'showModelBreakdown', label: '模型使用明细', desc: '展示本月各模型 Token / 请求次数 / 花费排名' },
    { key: 'showMonthlyHistory', label: '历史月账单', desc: '展示前两个月的花费对比' },
  ];

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">展示选项（默认关闭）</span>
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2">
        {items.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between py-1.5 gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{desc}</p>
            </div>
            <button onClick={() => toggle(key)} className="shrink-0">
              {settings[key]
                ? <ToggleRight className="w-6 h-6 text-indigo-500" />
                : <ToggleLeft className="w-6 h-6 text-gray-300 dark:text-gray-600" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── 主组件 ─── */

export const ZenmuxUsagePanel: React.FC = () => {
  const [dashData, setDashData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ZenmuxPanelSettings>(loadSettings);
  const hasAutoOpenedLogin = useRef(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (window.electronAPI?.fetchZenmuxDashboardData) {
        const result = await window.electronAPI.fetchZenmuxDashboardData();
        setDashData(result);
        if (result?.loginRequired) {
          setError('login-required');
          if (!hasAutoOpenedLogin.current) {
            hasAutoOpenedLogin.current = true;
            window.electronAPI?.openZenmuxLogin?.();
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
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogin = () => window.electronAPI?.openZenmuxLogin();
  const handleOpenExternal = () => window.electronAPI?.openPath?.('https://zenmux.ai/platform/pay-as-you-go');

  const loginRequired = error === 'login-required' || dashData?.loginRequired;
  const hasData = !!(dashData?.data?.usage || dashData?.data?.credits || dashData?.data?.costDetail);

  const balance = hasData ? extractBalance(dashData.data.credits) : null;
  const usageMap = hasData ? aggregateDailyUsage(dashData.data.usage) : new Map();
  const costMap = hasData ? aggregateDailyCost(dashData.data.costDetail) : new Map();
  const modelStats = hasData ? aggregateModelStats(dashData.data.usage, dashData.data.costDetail) : [];

  const last7 = getLast7Days();
  const daySummaries: DaySummary[] = last7.map(date => {
    const usage = usageMap.get(date);
    const cost = costMap.get(date) ?? 0;
    return {
      date,
      totalTokens: usage?.totalTokens ?? 0,
      totalRequests: usage?.totalRequests ?? 0,
      totalCost: cost,
      topModel: usage?.topModel ?? '-',
      topModelTokens: usage?.topModelTokens ?? 0,
    };
  });

  const weekTotalTokens = daySummaries.reduce((s, d) => s + d.totalTokens, 0);
  const weekTotalCost = daySummaries.reduce((s, d) => s + d.totalCost, 0);
  const weekTotalRequests = daySummaries.reduce((s, d) => s + d.totalRequests, 0);
  const maxTokens = Math.max(...daySummaries.map(d => d.totalTokens), 1);

  // 历史月数据
  const historyMonths: { month: string; cost: number }[] = [];
  if (hasData && dashData.data.historyMonths) {
    for (const h of dashData.data.historyMonths) {
      historyMonths.push({ month: h.month, cost: sumMonthlyCost(h.cost) });
    }
  }
  if (hasData && dashData.data.prevMonthCost) {
    const prev = dashData.data.prevMonthCost;
    if (!historyMonths.find(h => h.month === prev.month)) {
      historyMonths.push({ month: prev.month, cost: sumMonthlyCost(prev.cost) });
    }
  }

  // 当月花费（从所有 cost 数据中求和）
  const currentMonthCost = hasData ? costMap : new Map<string, number>();
  const currentMonthTotal = [...currentMonthCost.values()].reduce((a, b) => a + b, 0);

  // 交易记录
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <ZenmuxLogo />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Zenmux Dashboard</h2>
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
            className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
            title="展示设置"
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
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">正在获取数据...</p>
              <p className="text-xs text-gray-400 mt-1">首次加载可能需要 5-10 秒</p>
            </div>
          </div>
        )}

        {loginRequired && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <ZenmuxLogo />
            <div className="text-center max-w-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">登录 Zenmux</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                请在独立窗口中完成登录，登录后会话将持久保存。
              </p>
            </div>
            <div className="flex flex-col gap-3 w-64">
              <button
                onClick={handleLogin}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98]"
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
              <p className="text-xs text-gray-400 mt-1">API 返回了空数据，请重试</p>
            </div>
            <button onClick={fetchData} className="px-4 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors">
              重试
            </button>
          </div>
        )}

        {hasData && !loginRequired && (
          <div className="space-y-5 max-w-2xl mx-auto">
            {/* 余额卡片 */}
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-500/20">
              <div className="mb-3 opacity-90">
                <span className="text-sm font-medium">账户余额</span>
              </div>
              {balance ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight">${balance.total.toFixed(4)}</span>
                </div>
              ) : (
                <span className="text-xl font-semibold opacity-70">获取中...</span>
              )}
              {balance && (
                <div className="flex gap-6 mt-4 pt-3 border-t border-white/20">
                  <div>
                    <p className="text-[10px] opacity-60 mb-0.5">总充值</p>
                    <p className="text-sm font-semibold">${balance.totalCharged.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] opacity-60 mb-0.5">总花费</p>
                    <p className="text-sm font-semibold">${balance.totalSpent.toFixed(4)}</p>
                  </div>
                  {balance.bonus > 0 && (
                    <div>
                      <p className="text-[10px] opacity-60 mb-0.5">赠送余额</p>
                      <p className="text-sm font-semibold">${balance.bonus.toFixed(4)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 七日汇总 */}
            <div className="flex gap-3">
              <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">7日总花费</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">${weekTotalCost.toFixed(4)}</p>
              </div>
              <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">7日总 Tokens</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{(weekTotalTokens / 1_000_000).toFixed(2)}M</p>
              </div>
              {settings.showRequestCounts && (
                <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">7日请求次数</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{weekTotalRequests.toLocaleString()}</p>
                </div>
              )}
            </div>

            {/* 每日明细 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">近 7 日明细</h3>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {daySummaries.map((day, i) => {
                  const tokenM = day.totalTokens / 1_000_000;
                  const barPct = day.totalTokens / maxTokens * 100;
                  const isToday = i === 0;
                  return (
                    <div key={day.date} className={`px-4 py-3 flex items-center gap-3 ${isToday ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'} transition-colors`}>
                      {/* 日期 */}
                      <div className="w-[92px] shrink-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {isToday ? '今天' : fmtDate(day.date)}
                        </div>
                        <div className="text-[10px] text-gray-400">{fmtDateFull(day.date)}</div>
                      </div>

                      {/* Token 柱形 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-[52px] text-right shrink-0">
                            {tokenM >= 0.01 ? tokenM.toFixed(2) + 'M' : day.totalTokens > 0 ? (day.totalTokens / 1000).toFixed(1) + 'K' : '-'}
                          </span>
                          <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full transition-all duration-500"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* 请求次数（可选） */}
                      {settings.showRequestCounts && (
                        <div className="w-[64px] text-right shrink-0">
                          <span className={`text-xs font-medium ${day.totalRequests > 0 ? 'text-sky-600 dark:text-sky-400' : 'text-gray-300 dark:text-gray-600'}`}>
                            {day.totalRequests > 0 ? day.totalRequests.toLocaleString() + ' req' : '-'}
                          </span>
                        </div>
                      )}

                      {/* 花费 */}
                      <div className="w-[68px] text-right shrink-0">
                        <span className={`text-sm font-semibold ${day.totalCost > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-gray-600'}`}>
                          {day.totalCost > 0 ? '$' + day.totalCost.toFixed(4) : '-'}
                        </span>
                      </div>

                      {/* Top Model */}
                      <div className="w-[140px] shrink-0 text-right">
                        {day.topModel !== '-' ? (
                          <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-md truncate max-w-full" title={day.topModel}>
                            {shortModelName(day.topModel)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">-</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 模型使用明细（可选） */}
            {settings.showModelBreakdown && modelStats.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">本月模型明细</h3>
                  <span className="text-[10px] text-gray-400">共 {modelStats.length} 个模型</span>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {modelStats.slice(0, 15).map((stat, i) => (
                    <div key={stat.model} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                      <span className="w-5 text-[10px] text-gray-400 text-right shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate block" title={stat.model}>
                          {shortModelName(stat.model)}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-[60px] text-right shrink-0">
                        {stat.tokens >= 1_000_000 ? (stat.tokens / 1_000_000).toFixed(2) + 'M' : (stat.tokens / 1000).toFixed(1) + 'K'}
                      </span>
                      {stat.requests > 0 && (
                        <span className="text-[10px] text-sky-500 w-[54px] text-right shrink-0">{stat.requests.toLocaleString()} req</span>
                      )}
                      <span className={`text-xs font-semibold w-[64px] text-right shrink-0 ${stat.cost > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-gray-600'}`}>
                        {stat.cost > 0 ? '$' + stat.cost.toFixed(4) : '-'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-gray-400">本月合计</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">${currentMonthTotal.toFixed(4)}</span>
                </div>
              </div>
            )}

            {/* 历史月账单（可选） */}
            {settings.showMonthlyHistory && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">历史月账单</h3>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {/* 当月 */}
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/20">
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">本月（至今）</span>
                      <span className="ml-2 text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">当前</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">${currentMonthTotal.toFixed(4)}</span>
                  </div>
                  {historyMonths.length === 0 && (
                    <div className="px-4 py-4 text-center text-xs text-gray-400">暂无历史数据</div>
                  )}
                  {historyMonths.map(h => (
                    <div key={h.month} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/20">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{fmtMonth(h.month)}</span>
                      <span className={`text-sm font-semibold ${h.cost > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                        {h.cost > 0 ? '$' + h.cost.toFixed(4) : '无数据'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

export default ZenmuxUsagePanel;
