import type { AgentCrudAction } from '../agent/agentPermissions';

export type GuyueModuleKind = 'core' | 'builtin' | 'plugin';
export type GuyueModuleUiKind = 'native' | 'webview';

export interface GuyueModulePermissionDeclaration {
  module: string;
  action: AgentCrudAction;
  label?: string;
  description?: string;
  risk?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
}

export interface GuyueAgentScopeManifest {
  id: string;
  name: string;
  description: string;
  icon?: string;
  tools?: string[];
  permissions?: GuyueModulePermissionDeclaration[];
  prompt?: string;
}

export interface GuyueModuleManifest {
  id: string;
  name: string;
  version: string;
  kind: GuyueModuleKind;
  description?: string;
  icon?: string;
  enabledByDefault?: boolean;
  priority?: number;
  shortcut?: string;
  author?: string;
  ui?: {
    type: GuyueModuleUiKind;
    entry?: string;
    appMode?: string;
    sandbox?: boolean;
  };
  agent?: {
    scopes: GuyueAgentScopeManifest[];
    defaultPrompt?: string;
  };
  storage?: {
    namespace: string;
    schemaVersion: number;
    roots?: string[];
  };
  events?: {
    publishes?: string[];
    subscribes?: string[];
  };
  commands?: {
    provides?: string[];
    consumes?: string[];
  };
  runtime?: {
    dirPath?: string;
    entryPath?: string;
    manifestPath?: string;
  };
}

export const moduleManifestToModuleConfig = (manifest: GuyueModuleManifest) => ({
  id: manifest.ui?.appMode || manifest.id,
  name: manifest.name,
  enabled: manifest.enabledByDefault !== false,
  priority: manifest.priority ?? 100,
  icon: manifest.icon || 'Package',
  shortcut: manifest.shortcut,
  isPlugin: manifest.kind === 'plugin',
  pluginPath: manifest.runtime?.entryPath,
});

export const normalizePluginManifest = (
  manifest: any,
  runtime?: GuyueModuleManifest['runtime'],
): GuyueModuleManifest => {
  const moduleLike = manifest?.module && typeof manifest.module === 'object' ? manifest.module : manifest;
  const id = String(moduleLike?.id || manifest?.id || '').trim();
  const name = String(moduleLike?.name || manifest?.name || id).trim();
  const entry = String(moduleLike?.ui?.entry || manifest?.entry || '').trim();
  if (!id || !name || !entry) {
    throw new Error('插件 manifest 必须包含 id、name 和 entry');
  }

  const scopes = Array.isArray(moduleLike?.agent?.scopes)
    ? moduleLike.agent.scopes
    : Array.isArray(manifest?.agent?.scopes)
      ? manifest.agent.scopes
      : [];

  return {
    id,
    name,
    version: String(moduleLike?.version || manifest?.version || '0.0.0'),
    kind: 'plugin',
    description: String(moduleLike?.description || manifest?.description || ''),
    icon: String(moduleLike?.icon || manifest?.icon || 'Package'),
    enabledByDefault: moduleLike?.enabledByDefault !== false,
    priority: Number.isFinite(Number(moduleLike?.priority)) ? Number(moduleLike.priority) : 50,
    shortcut: typeof moduleLike?.shortcut === 'string' ? moduleLike.shortcut : undefined,
    author: String(moduleLike?.author || manifest?.author || ''),
    ui: {
      type: 'webview',
      entry,
      appMode: id,
      sandbox: moduleLike?.ui?.sandbox !== false,
    },
    agent: scopes.length > 0 ? { scopes } : undefined,
    storage: moduleLike?.storage,
    events: moduleLike?.events,
    commands: moduleLike?.commands,
    runtime,
  };
};
