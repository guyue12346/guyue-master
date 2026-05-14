import React from 'react';
import { Eye, Lock, Pencil, Plus, ShieldCheck, Trash2, Unlock, X } from 'lucide-react';
import {
  AGENT_CRUD_ACTIONS,
  AGENT_PERMISSION_MODULES,
  DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS,
  type AgentCrudAction,
  type AgentFullAccessPermissions,
  type AgentToolPermissions,
} from '../services/agent/agentPermissions';
import type { ToolPermissionCapabilities } from '../services/agent/toolRegistry';

interface AgentPermissionCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  capabilities: ToolPermissionCapabilities;
  toolPermissions: AgentToolPermissions;
  fullAccessPermissions: AgentFullAccessPermissions;
  allToolPermissionsEnabled: boolean;
  enabledToolPermissionCount: number;
  fullAccessPermissionCount: number;
  onSetAllToolPermissions: (enabled: boolean) => void;
  onToggleToolPermission: (moduleKey: string, actionKey: AgentCrudAction) => void;
  onToggleFullAccessPermission: (moduleKey: string, actionKey: AgentCrudAction) => void;
}

const isSupported = (
  capabilities: ToolPermissionCapabilities,
  moduleId: string,
  action: AgentCrudAction,
) => Boolean(capabilities[moduleId]?.[action]);

const ACTION_ICON_MAP = {
  read: Eye,
  create: Plus,
  update: Pencil,
  delete: Trash2,
} satisfies Record<AgentCrudAction, React.ComponentType<{ className?: string }>>;

const ACTION_TONE_MAP = {
  read: 'bg-blue-600 text-white',
  create: 'bg-emerald-600 text-white',
  update: 'bg-amber-500 text-white',
  delete: 'bg-rose-500 text-white',
} satisfies Record<AgentCrudAction, string>;

export const AgentPermissionCenterModal: React.FC<AgentPermissionCenterModalProps> = ({
  isOpen,
  onClose,
  capabilities,
  toolPermissions,
  fullAccessPermissions,
  allToolPermissionsEnabled,
  enabledToolPermissionCount,
  fullAccessPermissionCount,
  onSetAllToolPermissions,
  onToggleToolPermission,
  onToggleFullAccessPermission,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/25 p-5" onClick={onClose}>
      <div
        className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
              {enabledToolPermissionCount > 0 ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Agent 权限中心</h2>
              <p className="text-xs text-slate-400">
                已授权 {enabledToolPermissionCount} 项，完全权限 {fullAccessPermissionCount} 项
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSetAllToolPermissions(!allToolPermissionsEnabled)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {allToolPermissionsEnabled ? '全部关闭' : '全部开启'}
            </button>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="grid grid-cols-[minmax(180px,1fr)_repeat(4,48px)_64px] items-center gap-2 px-2 pb-2 text-[11px] font-medium text-slate-400">
            <span>模块</span>
            {AGENT_CRUD_ACTIONS.map(action => {
              const Icon = ACTION_ICON_MAP[action.key];
              return (
                <span key={action.key} className="flex justify-center" title={action.label}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
              );
            })}
            <span className="flex justify-center" title="完全权限"><ShieldCheck className="h-3.5 w-3.5" /></span>
          </div>
          <div className="space-y-1">
            {AGENT_PERMISSION_MODULES
              .filter(module => AGENT_CRUD_ACTIONS.some(action => isSupported(capabilities, module.key, action.key)))
              .map(module => {
                const enabledFullActions = (['update', 'delete'] as AgentCrudAction[])
                  .filter(action => isSupported(capabilities, module.key, action) && toolPermissions[module.key]?.[action]);
                const fullEnabled = enabledFullActions.length > 0 && enabledFullActions.every(action => fullAccessPermissions[module.key]?.[action]);
                return (
                  <div key={module.key} className="grid grid-cols-[minmax(180px,1fr)_repeat(4,48px)_64px] items-center gap-2 rounded-2xl px-2 py-2 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{module.label}</p>
                      <p className="truncate text-[11px] text-slate-400">{module.desc}</p>
                    </div>
                    {AGENT_CRUD_ACTIONS.map(action => {
                      const Icon = ACTION_ICON_MAP[action.key];
                      const supported = isSupported(capabilities, module.key, action.key);
                      const enabled = Boolean(toolPermissions[module.key]?.[action.key]);
                      if (!supported) {
                        return <span key={action.key} className="text-center text-slate-200">-</span>;
                      }
                      return (
                        <button
                          key={action.key}
                          onClick={() => onToggleToolPermission(module.key, action.key)}
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                            enabled ? ACTION_TONE_MAP[action.key] : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                          }`}
                          title={`${module.label} ${action.label}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                    <button
                      onClick={() => {
                        enabledFullActions.forEach(action => {
                          if ((fullAccessPermissions[module.key] || DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS[module.key])?.[action] === fullEnabled) {
                            onToggleFullAccessPermission(module.key, action);
                          }
                        });
                      }}
                      disabled={enabledFullActions.length === 0}
                      className={`mx-auto flex h-8 w-10 items-center justify-center rounded-xl transition-colors ${
                        fullEnabled
                          ? 'bg-slate-900 text-white'
                          : enabledFullActions.length > 0
                            ? 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            : 'bg-slate-50 text-slate-200'
                      }`}
                      title={enabledFullActions.length > 0 ? '修改/删除跳过确认，但保留快照' : '没有可设置完全权限的修改/删除工具'}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          完全权限只跳过修改/删除前的人工确认，执行日志和撤销快照仍会保留。
        </div>
      </div>
    </div>
  );
};
