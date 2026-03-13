import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Clock, X, ChevronDown, ChevronUp,
  Plus, Trash2, Edit2, DollarSign, Activity, HelpCircle,
  Key, Copy, Check, Eye, EyeOff,
} from 'lucide-react';

/* ─── 类型 ─── */

interface ApiKey {
  id: string;
  label: string;
  value: string;
}

interface GCPProjectConfig {
  id: string;
  name: string;
  serviceAccountJson: string;
  projectId: string;
  billingAccountId: string;
  apiKeys: ApiKey[];
}

interface ApiUsageStat {
  service: string;
  requestCount: number;
}

interface BudgetStat {
  displayName: string;
  currentSpend: number;
  budgetAmount: number | null;
  currency: string;
}

interface ProjectState {
  data: any | null;
  error: string | null;
  isLoading: boolean;
}

/* ─── 存储（兼容旧版单项目格式） ─── */

const STORAGE_KEY = 'gcp_billing_projects_v2';
const OLD_KEY = 'gcp_billing_panel_config';

function loadProjects(): GCPProjectConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GCPProjectConfig[];
      // 兼容旧数据，补充 apiKeys 字段
      return parsed.map(p => ({ apiKeys: [], ...p }));
    }

    // 从旧单项目格式迁移
    const oldRaw = localStorage.getItem(OLD_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      if (old.serviceAccountJson || old.projectId) {
        return [{
          id: 'migrated',
          name: old.projectId || '已迁移项目',
          serviceAccountJson: old.serviceAccountJson || '',
          projectId: old.projectId || '',
          billingAccountId: old.billingAccountId || '',
          apiKeys: [],
        }];
      }
    }
  } catch {}
  return [];
}

function saveProjects(projects: GCPProjectConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ─── 数据解析 ─── */

function parseApiUsage(monitoring: any): ApiUsageStat[] {
  const timeSeries: any[] = monitoring?.timeSeries ?? [];
  const stats: ApiUsageStat[] = [];
  for (const ts of timeSeries) {
    const service =
      ts?.resource?.labels?.service ??
      ts?.metric?.labels?.service ??
      'unknown';
    let count = 0;
    for (const point of ts?.points ?? []) {
      count += Number(point?.value?.int64Value ?? point?.value?.doubleValue ?? 0);
    }
    const existing = stats.find(s => s.service === service);
    if (existing) { existing.requestCount += count; }
    else { stats.push({ service, requestCount: count }); }
  }
  return stats.sort((a, b) => b.requestCount - a.requestCount);
}

function parseMoney(m: any): number {
  if (!m) return 0;
  return Number(m.units ?? 0) + Number(m.nanos ?? 0) / 1e9;
}

function parseBudgets(budgetsData: any, projectNumber?: string): BudgetStat[] {
  const list: any[] = budgetsData?.budgets ?? [];
  const filtered = projectNumber
    ? list.filter(b => {
        const projects: string[] = b?.budgetFilter?.projects ?? [];
        // 仅展示明确绑定到此项目的预算；无项目过滤条件的账号级预算不展示在单个项目下
        return projects.length > 0 && projects.includes(`projects/${projectNumber}`);
      })
    : list;
  return filtered.map(b => {
    const specifiedAmount = b?.amount?.specifiedAmount;
    const budgetAmount = specifiedAmount ? parseMoney(specifiedAmount) : null;
    const currentSpend = parseMoney(b?.currentSpend);
    const currency =
      b?.currentSpend?.currencyCode ||
      specifiedAmount?.currencyCode ||
      'USD';
    return {
      displayName: b?.displayName ?? '未命名预算',
      currentSpend,
      budgetAmount,
      currency,
    };
  });
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

const timeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  return Math.floor(diff / 3_600_000) + ' 小时前';
};

/* ─── API Key 管理区域 ─── */

const ApiKeySection: React.FC<{
  keys: ApiKey[];
  onChange: (keys: ApiKey[]) => void;
}> = ({ keys, onChange }) => {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleId, setVisibleId] = useState<string | null>(null);

  const handleCopy = (key: ApiKey) => {
    navigator.clipboard.writeText(key.value).then(() => {
      setCopiedId(key.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleAdd = () => {
    if (!newValue.trim()) return;
    const entry: ApiKey = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      label: newLabel.trim() || 'API Key',
      value: newValue.trim(),
    };
    onChange([...keys, entry]);
    setNewLabel('');
    setNewValue('');
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    onChange(keys.filter(k => k.id !== id));
  };

  const maskKey = (v: string) => {
    if (v.length <= 8) return '•'.repeat(v.length);
    return v.slice(0, 4) + '•'.repeat(Math.min(v.length - 8, 20)) + v.slice(-4);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">API Keys</span>
          {keys.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full font-medium">{keys.length}</span>
          )}
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加
        </button>
      </div>

      {/* 添加表单 */}
      {adding && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 dark:border-gray-700/50 pt-2">
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="名称（可选，如：生产环境）"
            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <input
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="粘贴 API Key"
            className="w-full px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newValue.trim()}
              className="flex-1 py-1.5 text-xs font-medium bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              保存
            </button>
            <button
              onClick={() => { setAdding(false); setNewLabel(''); setNewValue(''); }}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Key 列表 */}
      {keys.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {keys.map(key => {
            const isVisible = visibleId === key.id;
            const isCopied = copiedId === key.id;
            return (
              <div key={key.id} className="px-3 py-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">{key.label}</p>
                  <p className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                    {isVisible ? key.value : maskKey(key.value)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setVisibleId(isVisible ? null : key.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title={isVisible ? '隐藏' : '显示'}
                  >
                    {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleCopy(key)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isCopied
                        ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                    }`}
                    title="复制"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(key.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {keys.length === 0 && !adding && (
        <div className="px-3 pb-3 text-center">
          <p className="text-[10px] text-gray-400">暂无 API Key，点击「添加」保存常用密钥</p>
        </div>
      )}
    </div>
  );
};

/* ─── GCP Logo ─── */

const GCPLogo = ({ size = 'md' }: { size?: 'sm' | 'md' }) => (
  <div className={`${size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'} rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow shadow-blue-500/20 shrink-0`}>
    <svg viewBox="0 0 24 24" fill="none" className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'}>
      <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" fill="white" fillOpacity="0.9" />
    </svg>
  </div>
);

/* ─── 项目表单 ─── */

const ProjectForm: React.FC<{
  initial?: Partial<GCPProjectConfig>;
  onSave: (cfg: Omit<GCPProjectConfig, 'id' | 'apiKeys'>) => void;
  onCancel: () => void;
}> = ({ initial = {}, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    serviceAccountJson: initial.serviceAccountJson ?? '',
    projectId: initial.projectId ?? '',
    billingAccountId: initial.billingAccountId ?? '',
  });

  const tryAutoFill = () => {
    try {
      const sa = JSON.parse(form.serviceAccountJson);
      setForm(f => ({
        ...f,
        projectId: f.projectId || sa.project_id || '',
        name: f.name || sa.project_id || '',
      }));
    } catch {}
  };

  const isValid = form.serviceAccountJson.trim() && form.projectId.trim();

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {initial.serviceAccountJson ? '编辑项目' : '添加 GCP 项目'}
        </span>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">显示名称</label>
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="如：Gemini API - 主项目"
          className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Service Account JSON <span className="text-red-400">*</span>
        </label>
        <textarea
          value={form.serviceAccountJson}
          onChange={e => setForm(f => ({ ...f, serviceAccountJson: e.target.value }))}
          onBlur={tryAutoFill}
          rows={4}
          placeholder="粘贴从 GCP IAM → 服务账号 → 密钥 下载的 JSON 内容"
          className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 resize-y focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <p className="text-[10px] text-gray-400 mt-1">需要角色：Monitoring Viewer（用于 API 调用统计）</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Project ID <span className="text-red-400">*</span>
          </label>
          <input
            value={form.projectId}
            onChange={e => setForm(f => ({ ...f, projectId: e.target.value.trim() }))}
            placeholder="gen-lang-client-xxxxxx"
            className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Billing Account ID <span className="text-gray-400 font-normal">（可选）</span>
          </label>
          <input
            value={form.billingAccountId}
            onChange={e => setForm(f => ({ ...f, billingAccountId: e.target.value.trim() }))}
            placeholder="XXXXXX-XXXXXX-XXXXXX"
            className="w-full px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!isValid}
          className="flex-1 py-2 text-xs font-medium bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          保存并刷新
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
};

/* ─── 项目详情（展开区域） ─── */

const ProjectDetail: React.FC<{
  state: ProjectState;
  apiKeys: ApiKey[];
  onKeysChange: (keys: ApiKey[]) => void;
}> = ({ state, apiKeys, onKeysChange }) => {
  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center py-6 gap-3">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <span className="text-sm text-gray-500 dark:text-gray-400">正在获取数据...</span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/10 rounded-xl mt-3">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-red-600 dark:text-red-400">获取失败</p>
          <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5 break-all">{state.error}</p>
          <p className="text-[10px] text-gray-400 mt-1.5">
            请检查：该项目的服务账号是否有 <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">roles/monitoring.viewer</code> 权限
          </p>
        </div>
      </div>
    );
  }

  if (!state.data) return null;

  // 监控 API 权限错误（区别于"有权限但无数据"）
  const monitoringErr = state.data.monitoringError;

  const apiStats = parseApiUsage(state.data.monitoring);
  const budgets = parseBudgets(state.data.budgets, state.data.projectNumber);
  const budgetsError = state.data.budgetsError as { code: number; message: string; status: string } | undefined;
  const hasBillingAccount = !!(state.data.billingInfo?.billingAccountName || state.data.billingAccount);
  const totalRequests = apiStats.reduce((s, a) => s + a.requestCount, 0);
  const maxReq = Math.max(...apiStats.map(s => s.requestCount), 1);

  return (
    <div className="space-y-3 mt-3">
      {/* 监控错误 */}
      {monitoringErr && (() => {
        const isApiDisabled = monitoringErr.message?.includes('has not been used') || monitoringErr.message?.includes('disabled');
        return (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {isApiDisabled ? 'Cloud Monitoring API 未启用' : `API 调用统计不可用（${monitoringErr.code}）`}
              </p>
              {isApiDisabled ? (
                <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                  解决方法：GCP Console → 搜索 <strong>Cloud Monitoring API</strong> → 点击"启用"<br />
                  或直接访问：<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded break-all">console.cloud.google.com/apis/api/monitoring.googleapis.com/overview</code>
                </p>
              ) : (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  解决方法：GCP Console → IAM → 找到此服务账号 → 授予
                  <code className="bg-gray-100 dark:bg-gray-700 px-1 mx-1 rounded">Monitoring Viewer</code>角色
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* API 调用 */}
      {!monitoringErr && apiStats.length > 0 ? (
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
          <div className="px-3 py-2 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">本月 API 调用</span>
          </div>
          {apiStats.map((stat, i) => (
            <div key={stat.service} className="px-3 py-2.5 flex items-center gap-3">
              <span className="w-4 text-[10px] text-gray-400 text-right shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{stat.service}</p>
                <div className="mt-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full transition-all duration-500"
                    style={{ width: `${stat.requestCount / maxReq * 100}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-16 text-right shrink-0">
                {fmtNum(stat.requestCount)}
              </span>
            </div>
          ))}
          <div className="px-3 py-2 flex justify-between">
            <span className="text-xs text-gray-400">本月合计</span>
            <span className="text-xs font-bold text-gray-800 dark:text-gray-100">{fmtNum(totalRequests)}</span>
          </div>
        </div>
      ) : !monitoringErr ? (
        <div className="text-center py-5 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
          <Activity className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-1.5" />
          <p className="text-xs text-gray-400">本月暂无 API 调用记录</p>
          <p className="text-[10px] text-gray-400 mt-0.5">监控数据约有 3 分钟延迟</p>
        </div>
      ) : null}

      {/* 预算 */}
      {budgets.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-700/30 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
          <div className="px-3 py-2 flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">预算 & 花费</span>
          </div>
          {budgets.map((budget, i) => {
            const hasSpend = budget.currentSpend > 0;
            const pct = (budget.budgetAmount && hasSpend) ? Math.min(budget.currentSpend / budget.budgetAmount * 100, 100) : null;
            const overBudget = pct !== null && pct >= 100;
            return (
              <div key={i} className="px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{budget.displayName}</p>
                  {pct !== null ? (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${overBudget ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-medium shrink-0 ${overBudget ? 'text-red-500' : 'text-gray-400'}`}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  ) : !hasSpend ? (
                    <p className="text-[10px] text-gray-400 mt-0.5">花费数据约 12-24 小时后更新</p>
                  ) : null}
                </div>
                <div className="text-right shrink-0">
                  {hasSpend ? (
                    <p className={`text-xs font-bold ${overBudget ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {budget.currency} {budget.currentSpend.toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-gray-400">等待数据</p>
                  )}
                  {budget.budgetAmount != null && (
                    <p className="text-[10px] text-gray-400">/ {budget.currency} {budget.budgetAmount.toFixed(2)}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 预算错误或无预算提示 */}
      {budgetsError ? (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {budgetsError.code === 403 ? '预算数据无法获取（403）' : `预算数据不可用（${budgetsError.code}）`}
            </p>
            {budgetsError.code === 403 ? (
              <div className="text-[10px] text-gray-400 mt-1.5 space-y-1 leading-relaxed">
                <p>请检查以下两项（任一未完成都会导致此错误）：</p>
                <p>① 在各项目中启用 <strong>Cloud Billing Budget API</strong>：</p>
                <p className="pl-2 text-gray-400 break-all">console.cloud.google.com/apis/api/billingbudgets.googleapis.com</p>
                <p>② 在账单账号 IAM 中授予服务账号 <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Billing Account Viewer</code> 角色</p>
              </div>
            ) : (
              <p className="text-[10px] text-gray-400 mt-1.5">{budgetsError.message}</p>
            )}
          </div>
        </div>
      ) : hasBillingAccount && budgets.length === 0 ? (
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl">
          <DollarSign className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">未找到此项目的专属预算</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
              需在 GCP Console → 结算 → 预算和提醒 中，为此项目创建预算。<br />
              创建时「项目」必须选择当前项目（而非全部项目），花费数据才会在此显示。
            </p>
          </div>
        </div>
      ) : null}

      {/* API Keys */}
      <ApiKeySection keys={apiKeys} onChange={onKeysChange} />

      {state.data.lastUpdated && (
        <p className="text-[10px] text-gray-400 text-right flex items-center justify-end gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(state.data.lastUpdated)}
        </p>
      )}
    </div>
  );
};

/* ─── 主组件 ─── */

export const GCPBillingPanel: React.FC = () => {
  const [projects, setProjects] = useState<GCPProjectConfig[]>(loadProjects);
  const [states, setStates] = useState<Record<string, ProjectState>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const setProjectState = (id: string, patch: Partial<ProjectState>) =>
    setStates(prev => ({
      ...prev,
      [id]: { data: null, error: null, isLoading: false, ...prev[id], ...patch },
    }));

  const fetchProject = useCallback(async (cfg: GCPProjectConfig) => {
    if (!window.electronAPI?.fetchGCPBillingData) return;
    setProjectState(cfg.id, { isLoading: true, error: null });
    try {
      const result = await window.electronAPI.fetchGCPBillingData({
        serviceAccountJson: cfg.serviceAccountJson,
        projectId: cfg.projectId,
        billingAccountId: cfg.billingAccountId || undefined,
      });
      if (result?.error) {
        setProjectState(cfg.id, { isLoading: false, error: result.error });
      } else {
        setProjectState(cfg.id, { isLoading: false, data: result });
      }
    } catch (e) {
      setProjectState(cfg.id, { isLoading: false, error: (e as Error).message });
    }
  }, []);

  const fetchAll = useCallback((list: GCPProjectConfig[]) => {
    list.forEach(p => fetchProject(p));
  }, [fetchProject]);

  useEffect(() => {
    const loaded = loadProjects();
    if (loaded.length > 0) fetchAll(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAnyLoading = Object.values(states).some(s => s.isLoading);

  const handleAdd = (form: Omit<GCPProjectConfig, 'id' | 'apiKeys'>) => {
    const newProject: GCPProjectConfig = { apiKeys: [], ...form, id: generateId() };
    const updated = [...projects, newProject];
    setProjects(updated);
    saveProjects(updated);
    setShowAddForm(false);
    setExpandedId(newProject.id);
    fetchProject(newProject);
  };

  const handleEdit = (id: string, form: Omit<GCPProjectConfig, 'id' | 'apiKeys'>) => {
    // 保留已有的 apiKeys，不被表单覆盖
    const existing = projects.find(p => p.id === id);
    const updated = projects.map(p => p.id === id ? { ...form, id, apiKeys: existing?.apiKeys ?? [] } : p);
    setProjects(updated);
    saveProjects(updated);
    setEditingId(null);
    fetchProject({ ...form, id, apiKeys: existing?.apiKeys ?? [] });
  };

  const handleKeysChange = (id: string, keys: ApiKey[]) => {
    const updated = projects.map(p => p.id === id ? { ...p, apiKeys: keys } : p);
    setProjects(updated);
    saveProjects(updated);
  };

  const handleDelete = (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    saveProjects(updated);
    setStates(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <GCPLogo />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Google Cloud Platform</h2>
            <p className="text-[10px] text-gray-400">{projects.length} 个项目已配置</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAddForm(v => !v); setEditingId(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${showAddForm ? 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'}`}
          >
            <Plus className="w-3.5 h-3.5" />
            添加项目
          </button>
          <button
            onClick={() => fetchAll(projects)}
            disabled={projects.length === 0 || isAnyLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnyLoading ? 'animate-spin' : ''}`} />
            刷新全部
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="使用说明"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── 帮助弹窗 ─── */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-500" />
                GCP 监控配置说明
              </h3>
              <button onClick={() => setShowHelp(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5 text-xs text-gray-600 dark:text-gray-300">
              {/* 概念说明 */}
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">基本概念</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mb-2">
                  Google Cloud 一个<strong className="text-gray-700 dark:text-gray-200">结算账号</strong>（Billing Account）可关联多个<strong className="text-gray-700 dark:text-gray-200">项目</strong>（Project），每个项目下可启用多个 API。
                </p>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 font-mono text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  <p>结算账号 <span className="text-gray-400 dark:text-gray-500">ID: XXXXXX-XXXXXX-XXXXXX</span></p>
                  <p className="ml-3">├── 项目 A <span className="text-gray-400 dark:text-gray-500">ID: gen-lang-client-xxxx</span></p>
                  <p className="ml-3">│{'   '}├── Generative Language API</p>
                  <p className="ml-3">│{'   '}└── Cloud Monitoring API</p>
                  <p className="ml-3">├── 项目 B</p>
                  <p className="ml-3">└── 项目 C</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">结算账号 ID 格式为 <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">XXXXXX-XXXXXX-XXXXXX</code>，项目 ID 通常为 <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">xxx-xxx-xxxxxxxxxx</code></p>
              </div>

              <div className="h-px bg-gray-100 dark:bg-gray-700" />

              {/* 功能说明 */}
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">本面板支持</p>
                <ul className="space-y-1 text-[11px] text-gray-500 dark:text-gray-400 list-disc list-inside">
                  <li>监控每个项目下各 API 的本月调用次数</li>
                  <li>查看每个项目绑定预算的当月实际花费</li>
                </ul>
              </div>

              <div className="h-px bg-gray-100 dark:bg-gray-700" />

              {/* 配置步骤 */}
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 mb-3">配置步骤（每个项目都需操作）</p>
                <div className="space-y-4">

                  {/* 步骤 1 */}
                  <div className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">①</span>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-100">创建服务账号 & 下载密钥</p>
                      <p className="text-[10px] text-blue-500 dark:text-blue-400 mb-0.5">GCP Console → IAM 与管理 → 服务账号</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        在项目中创建一个服务账号，然后在该服务账号的「密钥」标签页点击「添加密钥 → 创建新密钥 → JSON」，下载得到的 JSON 文件即为本面板所需的凭证。
                      </p>
                    </div>
                  </div>

                  {/* 步骤 2：监控 API 调用 */}
                  <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">📊 若要监控 API 调用次数</p>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">②</span>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">授予监控权限</p>
                          <p className="text-[10px] text-blue-500 dark:text-blue-400 mb-0.5">GCP Console → IAM → 授予访问权限</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            为服务账号授予 <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">Monitoring Viewer</code> 角色（角色 ID: <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">roles/monitoring.viewer</code>）。
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">③</span>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">启用 Cloud Monitoring API</p>
                          <p className="text-[10px] text-blue-500 dark:text-blue-400 mb-0.5">GCP Console → API 和服务 → 启用 API</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            搜索「Cloud Monitoring API」并点击启用。未启用时面板会显示相应错误提示。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 步骤 3：监控费用 */}
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">💰 若要监控费用支出</p>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">④</span>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">创建项目级预算</p>
                          <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mb-0.5">GCP Console → 结算 → 预算和提醒</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            创建预算时，<strong className="text-gray-700 dark:text-gray-200">「项目」必须选择具体项目</strong>（而非「所有项目」），这样花费数据才会与项目对应。预算金额可设较大值如 $100。
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">⑤</span>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">授予结算查看权限</p>
                          <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mb-0.5">GCP Console → 结算 → 账号管理 → 右侧信息面板 → 添加主账号</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            在<strong className="text-gray-700 dark:text-gray-200">结算账号的 IAM</strong>（非项目 IAM）中，为服务账号授予 <code className="bg-emerald-100 dark:bg-emerald-900/30 px-1 rounded">Billing Account Viewer</code> 角色。此操作在结算账号层面只需做一次，所有关联项目共享。
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold">⑥</span>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-100">启用 Cloud Billing Budget API</p>
                          <p className="text-[10px] text-emerald-500 dark:text-emerald-400 mb-0.5">GCP Console → API 和服务 → 启用 API</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            搜索「Cloud Billing Budget API」并启用（<code className="bg-emerald-100 dark:bg-emerald-900/30 px-1 rounded">billingbudgets.googleapis.com</code>）。每个项目都需要启用。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 步骤 4：填写配置 */}
                  <div className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">⑦</span>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-100">在本面板添加项目</p>
                      <p className="text-[10px] text-blue-500 dark:text-blue-400 mb-0.5">点击上方「添加项目」</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        粘贴服务账号 JSON 文件的完整内容，填写项目 ID 和结算账号 ID 即可。
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 注意事项 */}
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">注意</p>
                <ul className="space-y-1 text-[11px] text-amber-600 dark:text-amber-400 list-disc list-inside">
                  <li>服务账号 JSON 文件含私钥，请妥善保管</li>
                  <li>API 调用数据约有 3 分钟延迟</li>
                  <li>预算花费数据在预算创建后约 12-24 小时才开始显示</li>
                  <li>步骤 ⑤ 在结算账号层面操作一次即可，无需每个项目重复</li>
                  <li>若面板提示权限/API 错误，请按错误信息中的提示操作</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 添加表单 ─── */}
      {showAddForm && (
        <ProjectForm onSave={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {/* ─── 内容区 ─── */}
      <div className="flex-1 overflow-auto p-5">
        {projects.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <GCPLogo size="md" />
            <div className="text-center max-w-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">添加 GCP 项目</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                每个 GCP 项目需单独配置一个 Service Account 密钥，可以同时监控多个项目的 API 调用量。
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              添加第一个项目
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {/* ─── 总计卡片 ─── */}
            {projects.length > 1 && (() => {
              const allStats = projects.map(p => {
                const s = states[p.id];
                const api = s?.data ? parseApiUsage(s.data.monitoring) : [];
                const reqs = api.reduce((acc, a) => acc + a.requestCount, 0);
                const buds = s?.data ? parseBudgets(s.data.budgets, s.data.projectNumber) : [];
                const spend = buds.reduce((acc, b) => acc + b.currentSpend, 0);
                const currency = buds[0]?.currency ?? '';
                return { reqs, spend, currency, name: p.name || p.projectId, hasData: !!s?.data };
              });
              const totalReqs = allStats.reduce((a, s) => a + s.reqs, 0);
              const totalSpend = allStats.reduce((a, s) => a + s.spend, 0);
              const currency = allStats.find(s => s.currency)?.currency ?? '';
              const activeCount = projects.filter(p => states[p.id]?.data).length;
              return (
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 text-white mb-1">
                  <p className="text-xs font-medium text-blue-100 mb-3">全部项目汇总 · {activeCount}/{projects.length} 个已加载</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-bold leading-tight">{fmtNum(totalReqs)}</p>
                      <p className="text-xs text-blue-200 mt-0.5">本月 API 总调用</p>
                      <div className="mt-2 space-y-1">
                        {allStats.filter(s => s.hasData).map(s => (
                          <div key={s.name} className="flex justify-between text-[10px] text-blue-100">
                            <span className="truncate max-w-[80px]">{s.name}</span>
                            <span className="font-medium">{fmtNum(s.reqs)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      {totalSpend > 0 ? (
                        <p className="text-2xl font-bold leading-tight">{currency} {totalSpend.toFixed(2)}</p>
                      ) : (
                        <p className="text-lg font-bold leading-tight text-blue-200">等待数据</p>
                      )}
                      <p className="text-xs text-blue-200 mt-0.5">本月总花费</p>
                      <div className="mt-2 space-y-1">
                        {allStats.filter(s => s.hasData && s.currency).map(s => (
                          <div key={s.name} className="flex justify-between text-[10px] text-blue-100">
                            <span className="truncate max-w-[80px]">{s.name}</span>
                            <span className="font-medium">{s.spend > 0 ? `${s.currency} ${s.spend.toFixed(2)}` : '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            {projects.map(project => {
              const state = states[project.id] ?? { data: null, error: null, isLoading: false };
              const isExpanded = expandedId === project.id;
              const isEditing = editingId === project.id;
              const apiStats = state.data ? parseApiUsage(state.data.monitoring) : [];
              const totalRequests = apiStats.reduce((s, a) => s + a.requestCount, 0);
              const billingEnabled = state.data?.billingInfo?.billingEnabled;

              return (
                <div
                  key={project.id}
                  className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden"
                >
                  {isEditing && (
                    <ProjectForm
                      initial={project}
                      onSave={form => handleEdit(project.id, form)}
                      onCancel={() => setEditingId(null)}
                    />
                  )}

                  {!isEditing && (
                    <div
                      className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors select-none"
                      onClick={() => setExpandedId(isExpanded ? null : project.id)}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        state.isLoading ? 'bg-blue-400 animate-pulse' :
                        state.error ? 'bg-red-400' :
                        state.data ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-gray-600'
                      }`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {project.name || project.projectId}
                          </p>
                          {billingEnabled === true && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full shrink-0 font-medium">
                              计费中
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">{project.projectId}</p>
                      </div>

                      <div className="text-right shrink-0 min-w-[60px]">
                        {state.isLoading ? (
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin ml-auto" />
                        ) : state.error ? (
                          <span className="text-[11px] text-red-400">获取失败</span>
                        ) : state.data ? (
                          <>
                            <p className="text-base font-bold text-gray-900 dark:text-white leading-tight">{fmtNum(totalRequests)}</p>
                            <p className="text-[10px] text-gray-400">本月请求</p>
                          </>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); setEditingId(project.id); setShowAddForm(false); }}
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); fetchProject(project); }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                          title="刷新"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${state.isLoading ? 'animate-spin text-blue-400' : ''}`} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(project.id); }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4 text-gray-400 ml-1" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
                        }
                      </div>
                    </div>
                  )}

                  {isExpanded && !isEditing && (
                    <div className="px-4 pb-4 border-t border-gray-50 dark:border-gray-700/50">
                      <ProjectDetail
                        state={state}
                        apiKeys={project.apiKeys ?? []}
                        onKeysChange={keys => handleKeysChange(project.id, keys)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
