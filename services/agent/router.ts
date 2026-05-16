import { getEnabledAgentModules, getModuleById } from './agentModules';

const VIRTUAL_AGENT_SCOPE_LABELS: Record<string, string> = {
  web: '联网搜索',
};

export const normalizeModuleScope = (moduleIds?: Array<string | null | undefined>): string[] => {
  const enabledIds = new Set(getEnabledAgentModules().map(module => module.id));
  const normalized: string[] = [];
  (moduleIds || []).forEach(moduleId => {
    if (!moduleId || (!enabledIds.has(moduleId) && !VIRTUAL_AGENT_SCOPE_LABELS[moduleId]) || normalized.includes(moduleId)) return;
    normalized.push(moduleId);
  });
  return normalized;
};

export const getModuleDisplayName = (moduleId: string): string =>
  getModuleById(moduleId)?.name || VIRTUAL_AGENT_SCOPE_LABELS[moduleId] || moduleId;

export const getModuleScopeLabel = (moduleIds: string[]): string =>
  moduleIds
    .map(getModuleDisplayName)
    .join('、');
