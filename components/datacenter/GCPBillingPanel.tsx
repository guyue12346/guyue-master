import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Clock, X, ChevronDown, ChevronUp,
  Plus, Trash2, Edit2, DollarSign, Activity, HelpCircle,
} from 'lucide-react';

/* ─── 类型 ─── */

interface GCPProjectConfig {
  id: string;
  name: string;
  serviceAccountJson: string;
  projectId: string;
  billingAccountId: string;
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
    if (raw) return JSON.parse(raw) as GCPProjectConfig[];

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

function parseBudgets(budgetsData: any): BudgetStat[] {
  const list: any[] = budgetsData?.budgets ?? [];
  return list.map(b => {
    const budgetAmount =
      b?.amount?.specifiedAmount?.units != null
        ? Number(b.amount.specifiedAmount.units) + Number(b.amount.specifiedAmount.nanos ?? 0) / 1e9
        : null;
    const currentSpend =
      b?.currentSpend?.units != null
        ? Number(b.currentSpend.units) + Number(b.currentSpend.nanos ?? 0) / 1e9
        : 0;
    return {
      displayName: b?.displayName ?? '未命名预算',
      currentSpend,
      budgetAmount,
      currency: b?.amount?.specifiedAmount?.currencyCode ?? 'USD',
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
  onSave: (cfg: Omit<GCPProjectConfig, 'id'>) => void;
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

const ProjectDetail: React.FC<{ state: ProjectState }> = ({ state }) => {
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
  const budgets = parseBudgets(state.data.budgets);
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
            const pct = budget.budgetAmount ? Math.min(budget.currentSpend / budget.budgetAmount * 100, 100) : null;
            const overBudget = pct !== null && pct >= 100;
            return (
              <div key={i} className="px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{budget.displayName}</p>
                  {pct !== null && (
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
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-bold ${overBudget ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    ${budget.currentSpend.toFixed(2)}
                  </p>
                  {budget.budgetAmount != null && (
                    <p className="text-[10px] text-gray-400">/ ${budget.budgetAmount.toFixed(2)}</p>
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
              {budgetsError.code === 403 ? '无账单预算查看权限' : `预算数据不可用（${budgetsError.code}）`}
            </p>
            <p className="text-[10px] text-gray-400 mt-1.5">
              {budgetsError.code === 403
                ? '请确认已在账单账号 IAM 中授予服务账号「Billing Account Viewer」角色'
                : budgetsError.message}
            </p>
          </div>
        </div>
      ) : hasBillingAccount && budgets.length === 0 ? (
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl">
          <DollarSign className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">尚未配置预算</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
              需在 GCP Console 创建预算后，才能在此显示实际花费。<br />
              预算金额可设为较大值（如 $100），系统会自动记录当月实际消费。
            </p>
          </div>
        </div>
      ) : null}

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

  const handleAdd = (form: Omit<GCPProjectConfig, 'id'>) => {
    const newProject: GCPProjectConfig = { ...form, id: generateId() };
    const updated = [...projects, newProject];
    setProjects(updated);
    saveProjects(updated);
    setShowAddForm(false);
    setExpandedId(newProject.id);
    fetchProject(newProject);
  };

  const handleEdit = (id: string, form: Omit<GCPProjectConfig, 'id'>) => {
    const updated = projects.map(p => p.id === id ? { ...form, id } : p);
    setProjects(updated);
    saveProjects(updated);
    setEditingId(null);
    fetchProject({ ...form, id });
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
              {/* 结构说明 */}
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">资源层级结构</p>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 font-mono text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  <p>结算账号（一个支付方式）</p>
                  <p className="ml-3">├── Project A</p>
                  <p className="ml-3">│{'   '}├── API: generativelanguage...</p>
                  <p className="ml-3">│{'   '}└── API: monitoring...</p>
                  <p className="ml-3">├── Project B</p>
                  <p className="ml-3">└── Project C</p>
                </div>
              </div>

              {/* 步骤 */}
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 mb-3">为每个项目配置监控，需完成以下步骤：</p>
                <div className="space-y-3">
                  {[
                    {
                      step: '①',
                      title: '创建服务账号并授权',
                      where: '每个 Project → IAM',
                      desc: '在项目 IAM 中创建服务账号，授予 Viewer 或 Monitoring Viewer 角色',
                    },
                    {
                      step: '②',
                      title: '启用 Cloud Monitoring API',
                      where: '每个 Project → API 和服务',
                      desc: '搜索 Cloud Monitoring API 并点击「启用」，否则无法读取调用数据',
                    },
                    {
                      step: '③',
                      title: '授予账单查看权限',
                      where: '结算账号 → IAM',
                      desc: '在账单账号的 IAM 中添加服务账号，角色选「Billing Account Viewer」',
                    },
                    {
                      step: '④',
                      title: '创建预算',
                      where: '结算账号 → 预算和提醒',
                      desc: '必须创建至少一个预算（金额随意如 $100），系统才会记录实际花费数据',
                    },
                    {
                      step: '⑤',
                      title: '在此面板填写配置',
                      where: '本应用 → 添加项目',
                      desc: '粘贴服务账号 JSON 文件内容，填写项目 ID 和账单账号 ID',
                    },
                  ].map(({ step, title, where, desc }) => (
                    <div key={step} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">{step}</span>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-100">{title}</p>
                        <p className="text-[10px] text-blue-500 dark:text-blue-400 mb-0.5">{where}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 注意 */}
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">注意</p>
                <ul className="space-y-1 text-[11px] text-amber-600 dark:text-amber-400 list-disc list-inside">
                  <li>服务账号 JSON 文件包含私钥，请妥善保管，不要分享</li>
                  <li>账单 ID 格式为 <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">XXXXXX-XXXXXX-XXXXXX</code></li>
                  <li>监控数据约有 3 分钟延迟</li>
                  <li>步骤 ③④ 只需在结算账号层面操作一次</li>
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
                      <ProjectDetail state={state} />
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
