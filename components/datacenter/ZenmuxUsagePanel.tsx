import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, LogIn, ExternalLink, CheckCircle2, AlertCircle, Wallet, Clock } from 'lucide-react';

/* ─── 工具函数 ─── */

/** "20260308" → "03/08" */
const fmtDate = (s: string) => s.length === 8 ? s.slice(4, 6) + '/' + s.slice(6, 8) : s;

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
  totalCost: number;
  topModel: string;
  topModelTokens: number;
}

/**
 * 从 usage.data.tokensByModel[] 聚合每天汇总
 * 每条: { bizTime: "20260302", modelSlug: "anthropic/...", tokens: "23861494", requestCounts: "142" }
 * 注意 tokens 和 requestCounts 是字符串
 */
function aggregateDailyUsage(usageData: any): Map<string, { totalTokens: number; topModel: string; topModelTokens: number }> {
  const map = new Map<string, { totalTokens: number; models: Map<string, number> }>();
  const rows: any[] = usageData?.data?.tokensByModel ?? [];
  for (const row of rows) {
    const date = String(row.bizTime ?? '');
    const model = String(row.modelSlug ?? '');
    const tokens = Number(row.tokens ?? 0);
    if (!date) continue;
    let entry = map.get(date);
    if (!entry) { entry = { totalTokens: 0, models: new Map() }; map.set(date, entry); }
    entry.totalTokens += tokens;
    entry.models.set(model, (entry.models.get(model) || 0) + tokens);
  }
  const result = new Map<string, { totalTokens: number; topModel: string; topModelTokens: number }>();
  for (const [date, { totalTokens, models }] of map) {
    let topModel = '-', topModelTokens = 0;
    for (const [m, t] of models) {
      if (t > topModelTokens) { topModel = m; topModelTokens = t; }
    }
    result.set(date, { totalTokens, topModel, topModelTokens });
  }
  return result;
}

/**
 * 从 costDetail.data.costByModel[] 聚合每天花费
 * 每条: { bizTime: "20260302", modelSlug: "...", billAmount: "0.01234", requestCounts: "5" }
 * 注意 billAmount 是字符串
 */
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

/**
 * 从 credits.data 提取余额
 * { balance: 6.50, balancesMap: { charge: 6.50, discount: 0.06 }, actualFee: 6.56 }
 */
function extractBalance(creditsData: any): { total: number; topUp: number; bonus: number } | null {
  const d = creditsData?.data;
  if (!d || typeof d !== 'object') return null;
  const total = Number(d.balance ?? 0);
  const topUp = Number(d.balancesMap?.charge ?? 0);
  const bonus = Number(d.balancesMap?.discount ?? 0);
  if (total === 0 && topUp === 0 && bonus === 0) return null;
  return { total, topUp, bonus };
}

/** 获取近七天的日期列表 (YYYYMMDD) */
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

/** "anthropic/claude-sonnet-4.5" → "claude-sonnet-4.5" */
function shortModelName(slug: string): string {
  const parts = slug.split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : slug;
}

/* ─── 组件 ─── */

const ZenmuxLogo = () => (
  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
    <span className="text-white font-bold text-sm">ZM</span>
  </div>
);

export const ZenmuxUsagePanel: React.FC = () => {
  const [dashData, setDashData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (window.electronAPI?.fetchZenmuxDashboardData) {
        const result = await window.electronAPI.fetchZenmuxDashboardData();
        setDashData(result);
        if (result?.loginRequired) setError('login-required');
        else if (result?.error) setError(result.error);
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

  // 解析数据 — 直接使用真实 API 结构
  const balance = hasData ? extractBalance(dashData.data.credits) : null;
  const usageMap = hasData ? aggregateDailyUsage(dashData.data.usage) : new Map();
  const costMap = hasData ? aggregateDailyCost(dashData.data.costDetail) : new Map();

  const last7 = getLast7Days();
  const daySummaries: DaySummary[] = last7.map(date => {
    const usage = usageMap.get(date);
    const cost = costMap.get(date) ?? 0;
    return {
      date,
      totalTokens: usage?.totalTokens ?? 0,
      totalCost: cost,
      topModel: usage?.topModel ?? '-',
      topModelTokens: usage?.topModelTokens ?? 0,
    };
  });

  const weekTotalTokens = daySummaries.reduce((s, d) => s + d.totalTokens, 0);
  const weekTotalCost = daySummaries.reduce((s, d) => s + d.totalCost, 0);
  const maxTokens = Math.max(...daySummaries.map(d => d.totalTokens), 1);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <ZenmuxLogo />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Zenmux Dashboard</h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">用量与消费统计</p>
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {/* 加载中 */}
        {isLoading && !hasData && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">正在获取数据...</p>
              <p className="text-xs text-gray-400 mt-1">首次加载可能需要 5-10 秒</p>
            </div>
          </div>
        )}

        {/* 需要登录 */}
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

        {/* 错误 */}
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

        {/* 无数据兜底 */}
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

        {/* 数据面板 */}
        {hasData && !loginRequired && (
          <div className="space-y-5 max-w-2xl mx-auto">
            {/* 余额卡片 */}
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-indigo-500/20">
              <div className="flex items-center gap-2 mb-3 opacity-90">
                <Wallet className="w-4 h-4" />
                <span className="text-sm font-medium">账户余额</span>
              </div>
              {balance ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight">${balance.total.toFixed(4)}</span>
                </div>
              ) : (
                <span className="text-xl font-semibold opacity-70">获取中...</span>
              )}
              {balance && (balance.topUp > 0 || balance.bonus > 0) && (
                <div className="flex gap-4 mt-3 text-xs opacity-75">
                  {balance.topUp > 0 && <span>充值: ${balance.topUp.toFixed(4)}</span>}
                  {balance.bonus > 0 && <span>赠送: ${balance.bonus.toFixed(4)}</span>}
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
                    <div key={day.date} className={`px-4 py-3 flex items-center gap-4 ${isToday ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'} transition-colors`}>
                      {/* 日期 */}
                      <div className="w-[100px] shrink-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {isToday ? '今天' : fmtDate(day.date)}
                        </div>
                        <div className="text-[10px] text-gray-400">{fmtDateFull(day.date)}</div>
                      </div>

                      {/* Token 柱形 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-[56px] text-right shrink-0">
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

                      {/* 花费 */}
                      <div className="w-[72px] text-right shrink-0">
                        <span className={`text-sm font-semibold ${day.totalCost > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-300 dark:text-gray-600'}`}>
                          {day.totalCost > 0 ? '$' + day.totalCost.toFixed(4) : '-'}
                        </span>
                      </div>

                      {/* Top Model */}
                      <div className="w-[150px] shrink-0 text-right">
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
          </div>
        )}
      </div>
    </div>
  );
};

export default ZenmuxUsagePanel;
