import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Clock,
  Coins,
  ExternalLink,
  Layers3,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { CodexAdditionalLimit, CodexUsage, CodexUsageCredits, CodexUsageWindow } from '../../types';

const CODEX_URL = 'https://chatgpt.com/codex';
const ACCOUNTS_STORAGE_KEY = 'codex_usage_accounts_v2';

const PLAN_LABELS: Record<string, string> = {
  guest: 'Guest',
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro Lite',
  business: 'Business',
  team: 'Team',
  enterprise: 'Enterprise',
  education: 'Education',
  free_workspace: 'Free Workspace',
  self_serve_business_usage_based: 'Business Usage-Based',
  enterprise_cbp_usage_based: 'Enterprise Usage-Based',
};

type CodexAccountSlot = {
  id: string;
  label: string;
};

type CodexAccountState = {
  usage: CodexUsage | null;
  isLoading: boolean;
  error: string | null;
};

const DEFAULT_ACCOUNT_SLOTS: CodexAccountSlot[] = [
  { id: 'account-1', label: '账号 1' },
  { id: 'account-2', label: '账号 2' },
];

const createEmptyAccountState = (): CodexAccountState => ({
  usage: null,
  isLoading: false,
  error: null,
});

function loadAccountSlots(): CodexAccountSlot[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCOUNT_SLOTS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ACCOUNT_SLOTS;

    const normalized = parsed
      .map((item: any, index: number) => {
        const id = String(item?.id || '').trim();
        const label = String(item?.label || '').trim();
        if (!id) return null;
        return {
          id,
          label: label || `账号 ${index + 1}`,
        };
      })
      .filter(Boolean) as CodexAccountSlot[];

    return normalized.length > 0 ? normalized : DEFAULT_ACCOUNT_SLOTS;
  } catch {
    return DEFAULT_ACCOUNT_SLOTS;
  }
}

function saveAccountSlots(slots: CodexAccountSlot[]) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(slots));
}

const timeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const formatPlanType = (planType?: string | null) => {
  if (!planType) return '未知';
  return PLAN_LABELS[planType] || planType.replace(/_/g, ' ');
};

const formatWindowLabel = (windowMinutes?: number | null, fallback = 'Limit') => {
  if (!windowMinutes || windowMinutes <= 0) return fallback;
  if (windowMinutes === 60 * 24 * 7) return 'Weekly';
  if (windowMinutes % (60 * 24) === 0) return `${windowMinutes / (60 * 24)}d`;
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`;
  return `${windowMinutes}m`;
};

const formatResetAt = (resetAt?: number | null) => {
  if (!resetAt) return '未提供';
  const date = new Date(resetAt * 1000);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const formatCredits = (credits?: CodexUsageCredits | null) => {
  if (!credits?.hasCredits) return '未开放';
  if (credits.unlimited) return 'Unlimited';
  const raw = String(credits.balance ?? '').trim();
  if (!raw) return '0 credits';

  const num = Number(raw);
  if (Number.isFinite(num)) {
    return `${Math.round(num)} credits`;
  }
  return raw;
};

const hasUsagePayload = (usage?: CodexUsage | null) =>
  !!(usage?.primary || usage?.secondary || usage?.credits || usage?.additionalLimits?.length);

const CodexLogo = () => (
  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#10a37f] to-emerald-600 shadow-lg shadow-emerald-500/20">
    <span className="text-sm font-bold text-white">C</span>
  </div>
);

const MetaChip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600">
    <span className="text-gray-400">{label}</span>
    <span className="font-medium text-gray-700">{value}</span>
  </span>
);

const LimitCard: React.FC<{
  label: string;
  windowData: CodexUsageWindow;
}> = ({ label, windowData }) => {
  const used = clampPercent(windowData.usedPercent);
  const left = clampPercent(100 - used);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className={`mt-1 text-2xl font-semibold ${used >= 85 ? 'text-rose-600' : 'text-gray-900'}`}>
            {left.toFixed(0)}%
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">
          {formatWindowLabel(windowData.windowMinutes)}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${used >= 85 ? 'bg-rose-500' : 'bg-emerald-500'}`}
          style={{ width: `${used}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
        <span>已用 {used.toFixed(1)}%</span>
        <span>{formatResetAt(windowData.resetsAt)}</span>
      </div>
    </div>
  );
};

const AdditionalLimitCard: React.FC<{ limit: CodexAdditionalLimit }> = ({ limit }) => (
  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{limit.limitName || limit.limitId}</p>
        <p className="truncate text-[11px] text-gray-400">{limit.limitId}</p>
      </div>
      <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700">
        Additional
      </span>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      {limit.primary && <LimitCard label="Primary" windowData={limit.primary} />}
      {limit.secondary && <LimitCard label="Secondary" windowData={limit.secondary} />}
    </div>
  </div>
);

const AccountCard: React.FC<{
  slot: CodexAccountSlot;
  index: number;
  state: CodexAccountState;
  canRemove: boolean;
  onRename: (id: string, label: string) => void;
  onLogin: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}> = ({ slot, index, state, canRemove, onRename, onLogin, onRefresh, onRemove }) => {
  const usage = state.usage;
  const loginRequired = state.error === 'login-required' || usage?.loginRequired;
  const hasData = hasUsagePayload(usage);
  const additionalLimits = usage?.additionalLimits?.filter(limit => limit.primary || limit.secondary) ?? [];
  const accountIdentity = usage?.accountEmail || usage?.accountName || usage?.accountId || null;
  const accountDetail = usage?.accountEmail && usage?.accountName && usage.accountEmail !== usage.accountName
    ? usage.accountName
    : usage?.accountId && usage.accountId !== accountIdentity
      ? usage.accountId
      : null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-xs font-semibold text-white">
            {index + 1}
          </span>
          <div className="min-w-0">
            <input
              value={slot.label}
              onChange={e => onRename(slot.id, e.target.value)}
              onBlur={() => onRename(slot.id, slot.label.trim() || `账号 ${index + 1}`)}
              className="min-w-[120px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-gray-900 outline-none transition focus:border-gray-200 focus:bg-gray-50"
            />
            <div className="px-2">
              <p className="truncate text-[11px] text-gray-500">
                {accountIdentity || '未识别到已登录账号'}
              </p>
              {accountDetail ? (
                <p className="truncate text-[10px] text-gray-400">{accountDetail}</p>
              ) : null}
            </div>
          </div>
          {usage?.lastUpdated ? (
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock className="h-3 w-3" />
              {timeAgo(usage.lastUpdated)}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onLogin}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <LogIn className="h-3.5 w-3.5" />
            登录
          </button>
          <button
            onClick={onRefresh}
            disabled={state.isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${state.isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          {canRemove ? (
            <button
              onClick={onRemove}
              className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-rose-600"
              title="删除账号槽位"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        {state.isLoading && !hasData && (
          <div className="flex min-h-[120px] items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            正在获取数据
          </div>
        )}

        {loginRequired && !state.isLoading && !hasData && (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-xl bg-gray-50 px-4 text-center">
            <LogIn className="h-5 w-5 text-gray-400" />
            <p className="text-sm text-gray-600">未登录</p>
            <button
              onClick={onLogin}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
            >
              <LogIn className="h-3.5 w-3.5" />
              打开登录窗口
            </button>
          </div>
        )}

        {state.error && state.error !== 'login-required' && !state.isLoading && !hasData && (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-xl bg-rose-50 px-4 text-center">
            <AlertCircle className="h-5 w-5 text-rose-400" />
            <p className="max-w-lg text-sm text-rose-700">{state.error}</p>
          </div>
        )}

        {!state.isLoading && !loginRequired && !state.error && !hasData && (
          <div className="flex min-h-[120px] items-center justify-center rounded-xl bg-gray-50 px-4 text-sm text-gray-500">
            暂无数据
          </div>
        )}

        {hasData && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <MetaChip label="Plan" value={formatPlanType(usage?.planType)} />
              <MetaChip label="Credits" value={formatCredits(usage?.credits)} />
              <MetaChip label="Source" value={usage?.endpoint || usage?.source || 'browser'} />
            </div>

            {(usage?.primary || usage?.secondary) ? (
              <div className="grid gap-3 md:grid-cols-2">
                {usage?.primary && <LimitCard label="Primary" windowData={usage.primary} />}
                {usage?.secondary && <LimitCard label="Secondary" windowData={usage.secondary} />}
              </div>
            ) : null}

            {additionalLimits.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                  <Layers3 className="h-4 w-4" />
                  Additional Limits
                </div>
                <div className="space-y-3">
                  {additionalLimits.map((limit, limitIndex) => (
                    <AdditionalLimitCard
                      key={`${slot.id}-${limit.limitId}-${limitIndex}`}
                      limit={limit}
                    />
                  ))}
                </div>
              </div>
            )}

            {state.error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {state.error}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export const CodexUsagePanel: React.FC = () => {
  const [accountSlots, setAccountSlots] = useState<CodexAccountSlot[]>(loadAccountSlots);
  const [accountStates, setAccountStates] = useState<Record<string, CodexAccountState>>({});
  const [showHelp, setShowHelp] = useState(false);

  const updateAccountState = useCallback(
    (profileId: string, updater: (prev: CodexAccountState) => CodexAccountState) => {
      setAccountStates(prev => ({
        ...prev,
        [profileId]: updater(prev[profileId] ?? createEmptyAccountState()),
      }));
    },
    []
  );

  const fetchAccountData = useCallback(
    async (profileId: string) => {
      updateAccountState(profileId, prev => ({ ...prev, isLoading: true, error: null }));

      try {
        if (!window.electronAPI?.fetchCodexUsageFromBrowser) {
          updateAccountState(profileId, prev => ({
            ...prev,
            isLoading: false,
            error: '仅在桌面端可用',
          }));
          return;
        }

        const result = await window.electronAPI.fetchCodexUsageFromBrowser({ profileId });
        const error = result?.loginRequired
          ? 'login-required'
          : result?.error && !hasUsagePayload(result)
            ? result.error
            : result?.error ?? null;

        updateAccountState(profileId, prev => ({
          ...prev,
          usage: result,
          isLoading: false,
          error,
        }));
      } catch (err) {
        updateAccountState(profileId, prev => ({
          ...prev,
          isLoading: false,
          error: (err as Error).message,
        }));
      }
    },
    [updateAccountState]
  );

  const fetchAllData = useCallback(async () => {
    await Promise.all(accountSlots.map(slot => fetchAccountData(slot.id)));
  }, [accountSlots, fetchAccountData]);

  useEffect(() => {
    setAccountStates(prev => {
      const next: Record<string, CodexAccountState> = {};
      for (const slot of accountSlots) {
        next[slot.id] = prev[slot.id] ?? createEmptyAccountState();
      }
      return next;
    });
    saveAccountSlots(accountSlots);
  }, [accountSlots]);

  useEffect(() => {
    void fetchAllData();
    // 仅首屏自动拉取，避免编辑账号名时重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (profileId: string) =>
    void window.electronAPI?.openCodexUsageLogin?.({ profileId });

  const handleOpenExternal = () => void window.electronAPI?.openPath?.(CODEX_URL);

  const handleAddAccount = () => {
    const nextIndex = accountSlots.length + 1;
    setAccountSlots(prev => [
      ...prev,
      {
        id: `account-${Date.now()}`,
        label: `账号 ${nextIndex}`,
      },
    ]);
  };

  const handleRemoveAccount = (profileId: string) => {
    setAccountSlots(prev => prev.filter(slot => slot.id !== profileId));
    setAccountStates(prev => {
      const next = { ...prev };
      delete next[profileId];
      return next;
    });
  };

  const handleRenameAccount = (profileId: string, label: string) => {
    setAccountSlots(prev =>
      prev.map(slot =>
        slot.id === profileId
          ? { ...slot, label }
          : slot
      )
    );
  };

  const latestUpdated = accountSlots.reduce(
    (maxValue, slot) => Math.max(maxValue, accountStates[slot.id]?.usage?.lastUpdated ?? 0),
    0
  );
  const anyLoading = accountSlots.some(slot => accountStates[slot.id]?.isLoading);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white/80 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <CodexLogo />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Codex Usage</h2>
            <p className="text-xs text-gray-400">{accountSlots.length} 个账号槽位</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {latestUpdated > 0 ? (
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <Clock className="h-3 w-3" />
              {timeAgo(latestUpdated)}
            </span>
          ) : null}
          <button
            onClick={handleAddAccount}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            新增账号
          </button>
          <button
            onClick={() => void fetchAllData()}
            disabled={anyLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${anyLoading ? 'animate-spin' : ''}`} />
            全部刷新
          </button>
          <button
            onClick={() => setShowHelp(prev => !prev)}
            className={`rounded-lg border px-2.5 py-2 transition-colors ${showHelp ? 'border-gray-300 bg-gray-100 text-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
            title="说明"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleOpenExternal}
            className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            title="在浏览器中打开 Codex"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-5xl space-y-4">
          {showHelp && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <ShieldCheck className="h-4 w-4 text-gray-500" />
                使用说明
              </div>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                <p>每个账号槽位对应一个独立会话，可以同时登录不同的 Codex Plus 账号。</p>
                <p>点“新增账号”可以继续往下加，不限制两个。</p>
                <p>账号名称可直接修改；删除槽位只会移除面板入口，不会主动清除本地会话数据。</p>
              </div>
            </div>
          )}

          {accountSlots.map((slot, index) => (
            <AccountCard
              key={slot.id}
              slot={slot}
              index={index}
              state={accountStates[slot.id] ?? createEmptyAccountState()}
              canRemove={accountSlots.length > 1}
              onRename={handleRenameAccount}
              onLogin={() => handleLogin(slot.id)}
              onRefresh={() => void fetchAccountData(slot.id)}
              onRemove={() => handleRemoveAccount(slot.id)}
            />
          ))}

          {accountSlots.length === 0 && (
            <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white">
              <CheckCircle2 className="h-5 w-5 text-gray-400" />
              <button
                onClick={handleAddAccount}
                className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
              >
                <Plus className="h-3.5 w-3.5" />
                新增账号
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodexUsagePanel;
