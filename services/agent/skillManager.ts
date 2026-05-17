import type { PromptRecord } from '../../types';

export interface AgentSkillManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  category?: string;
  tags?: string[];
  triggers?: string[];
  source: 'prompt' | 'agent-skill';
  enabled: boolean;
  content?: string;
  path?: string;
  updatedAt?: number;
}

export interface AgentSkillRoot {
  id: string;
  path: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentSkillLoadResult {
  success: boolean;
  skill?: AgentSkillManifest;
  content?: string;
  error?: string;
}

export type AgentSkillSourceFilter = 'agent-skill' | 'prompt' | 'all';

export interface AgentSkillListOptions {
  includeDisabled?: boolean;
  source?: AgentSkillSourceFilter;
  includePromptBacked?: boolean;
}

export const STORAGE_KEY_AGENT_SKILLS = 'guyue_agent_skills_v1';
export const STORAGE_KEY_AGENT_SKILL_ROOTS = 'guyue_agent_skill_roots_v1';
export const STORAGE_KEY_AGENT_SKILL_CATEGORY_OVERRIDES = 'guyue_agent_skill_category_overrides_v1';
const STORAGE_KEY_PROMPTS = 'linkmaster_prompts_v1';

const BUILTIN_AGENT_SKILLS: AgentSkillManifest[] = [
  {
    id: 'builtin:create-plan',
    name: 'create-plan',
    version: '1.0.0',
    description: '把复杂需求拆解为可执行计划，适合编码、重构、研究和长任务执行前使用。',
    category: '规划',
    tags: ['planning', 'agent', 'codex', 'task-breakdown'],
    triggers: ['计划', '规划', '拆解', '重构', '复杂任务', 'create-plan'],
    source: 'agent-skill',
    enabled: true,
    path: 'builtin://create-plan',
    updatedAt: 0,
    content: [
      '---',
      'name: create-plan',
      'description: 将复杂任务拆解为清晰、可验证、可执行的步骤计划。',
      'category: 规划',
      'tags: planning;agent;task-breakdown;codex',
      'triggers: 计划;规划;拆解;复杂任务;重构;create-plan',
      '---',
      '',
      '# create-plan',
      '',
      '当用户提出复杂任务、重构、研究、长文写作或多步骤执行请求时，先把需求转成计划，再进入执行。',
      '',
      '## 工作方式',
      '',
      '1. 复述目标：用一句话明确最终交付物。',
      '2. 列出约束：时间、权限、数据安全、不能改动的范围、需要先确认的信息。',
      '3. 拆分阶段：每个阶段只包含一类行动，避免把读取、修改、验证混在一起。',
      '4. 定义完成标准：每一步都要有可检查的结果。',
      '5. 标出风险：对可能破坏数据、写文件、删除、发送外部请求的步骤标记为需要确认。',
      '6. 执行时按顺序推进：每完成一步，根据结果决定是否调整后续步骤。',
      '',
      '## 输出格式',
      '',
      '```md',
      '目标：...',
      '',
      '约束：',
      '- ...',
      '',
      '计划：',
      '1. ...',
      '   完成标准：...',
      '2. ...',
      '   完成标准：...',
      '',
      '需要确认：',
      '- ...',
      '```',
      '',
      '## 原则',
      '',
      '- 不要直接声称任务完成，除非每个步骤都有执行或验证结果。',
      '- 如果信息不足，先提出最少必要问题。',
      '- 如果涉及本地 App 数据，先查询现有结构，再创建或修改。',
      '- 如果涉及联网，先搜索，再打开可信来源，再总结。',
    ].join('\n'),
  },
];

const safeParseArray = <T = any>(value: string | null): T[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeTags = (tags: unknown): string[] => {
  if (Array.isArray(tags)) {
    return tags.map(tag => String(tag).trim()).filter(Boolean);
  }
  if (typeof tags === 'string') {
    return tags.split(/[;；,，]/).map(tag => tag.trim()).filter(Boolean);
  }
  return [];
};

const promptToAgentSkill = (prompt: PromptRecord): AgentSkillManifest => ({
  id: `prompt:${prompt.id}`,
  name: prompt.title,
  description: prompt.description || prompt.note || '',
  category: prompt.category,
  tags: [],
  triggers: [],
  source: 'prompt',
  enabled: true,
  content: prompt.content,
  updatedAt: prompt.updatedAt || prompt.createdAt,
});

export const loadAgentSkillCategoryOverrides = (): Record<string, string> => {
  if (typeof localStorage === 'undefined') return {};
  const raw = localStorage.getItem(STORAGE_KEY_AGENT_SKILL_CATEGORY_OVERRIDES);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([id, category]) => [String(id), String(category).trim()])
        .filter(([, category]) => category),
    );
  } catch {
    return {};
  }
};

export const saveAgentSkillCategoryOverrides = (overrides: Record<string, string>) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_AGENT_SKILL_CATEGORY_OVERRIDES, JSON.stringify(overrides));
};

const applyAgentSkillCategoryOverrides = (skills: AgentSkillManifest[]): AgentSkillManifest[] => {
  const overrides = loadAgentSkillCategoryOverrides();
  if (Object.keys(overrides).length === 0) return skills;
  return skills.map(skill => overrides[skill.id] ? { ...skill, category: overrides[skill.id] } : skill);
};

export const loadBuiltinAgentSkills = (): AgentSkillManifest[] =>
  BUILTIN_AGENT_SKILLS.map(skill => ({ ...skill }));

export const parseSkillMarkdown = (content: string, fallback: Partial<AgentSkillManifest> = {}): AgentSkillManifest => {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const meta: Record<string, string> = {};
  if (frontmatter) {
    frontmatter[1].split('\n').forEach(line => {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
      if (match) meta[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    });
  }
  const body = frontmatter ? content.slice(frontmatter[0].length) : content;
  const title = meta.name || meta.title || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback.name || '未命名 Skill';
  const id = fallback.id || meta.id || `skill:${title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-').replace(/^-+|-+$/g, '') || Date.now()}`;
  return {
    id,
    name: title,
    version: meta.version || fallback.version,
    description: meta.description || body.match(/^>\s*(.+)$/m)?.[1]?.trim() || fallback.description || '',
    category: meta.category || fallback.category || 'Skills',
    tags: normalizeTags(meta.tags || fallback.tags),
    triggers: normalizeTags(meta.triggers || fallback.triggers),
    source: 'agent-skill',
    enabled: fallback.enabled !== false,
    content,
    path: fallback.path,
    updatedAt: fallback.updatedAt || Date.now(),
  };
};

export const loadAgentSkillRoots = (): AgentSkillRoot[] => {
  if (typeof localStorage === 'undefined') return [];
  return safeParseArray<AgentSkillRoot>(localStorage.getItem(STORAGE_KEY_AGENT_SKILL_ROOTS))
    .filter(root => root && root.id && root.path)
    .map(root => ({ ...root, enabled: root.enabled !== false }));
};

export const saveAgentSkillRoots = (roots: AgentSkillRoot[]) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_AGENT_SKILL_ROOTS, JSON.stringify(roots));
};

export const upsertAgentSkillRoot = (path: string) => {
  const normalized = path.trim();
  if (!normalized) throw new Error('Skill 路径不能为空');
  const now = Date.now();
  const roots = loadAgentSkillRoots();
  const existing = roots.find(root => root.path === normalized);
  const next: AgentSkillRoot = existing
    ? { ...existing, enabled: true, updatedAt: now }
    : {
        id: `skill-root-${now}-${Math.random().toString(36).slice(2, 7)}`,
        path: normalized,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
  saveAgentSkillRoots(existing ? roots.map(root => root.id === existing.id ? next : root) : [next, ...roots]);
  return next;
};

export const setAgentSkillEnabled = (skillId: string, enabled: boolean) => {
  const skills = loadStoredAgentSkills();
  saveStoredAgentSkills(skills.map(skill => skill.id === skillId ? { ...skill, enabled, updatedAt: Date.now() } : skill));
};

export const scanAgentSkillDirectories = async (): Promise<AgentSkillManifest[]> => {
  const roots = loadAgentSkillRoots().filter(root => root.enabled);
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  if (!api?.agentSkillScan || roots.length === 0) return [];
  const result = await api.agentSkillScan({ roots: roots.map(root => root.path) });
  if (!result?.success || !Array.isArray(result.skills)) return [];
  return result.skills
    .filter((skill: any) => skill?.content)
    .map((skill: any) => parseSkillMarkdown(String(skill.content || ''), {
      id: skill.id,
      path: skill.path,
      enabled: skill.enabled !== false,
      updatedAt: skill.updatedAt,
    }));
};

export const loadPromptBackedAgentSkills = (): AgentSkillManifest[] => {
  if (typeof localStorage === 'undefined') return [];
  return safeParseArray<PromptRecord>(localStorage.getItem(STORAGE_KEY_PROMPTS))
    .filter(prompt => prompt && prompt.id && prompt.title && prompt.content)
    .map(promptToAgentSkill);
};

export const loadStoredAgentSkills = (): AgentSkillManifest[] => {
  if (typeof localStorage === 'undefined') return [];
  return safeParseArray<AgentSkillManifest>(localStorage.getItem(STORAGE_KEY_AGENT_SKILLS))
    .filter(skill => skill && skill.id && skill.name)
    .map(skill => ({
      ...skill,
      source: skill.source || 'agent-skill',
      enabled: skill.enabled !== false,
      tags: normalizeTags(skill.tags),
      triggers: normalizeTags(skill.triggers),
    }));
};

export const saveStoredAgentSkills = (skills: AgentSkillManifest[]) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_AGENT_SKILLS, JSON.stringify(skills));
};

const shouldIncludeAgentSkillSource = (options: AgentSkillListOptions) =>
  options.source !== 'prompt';

const shouldIncludePromptSource = (options: AgentSkillListOptions) =>
  options.source === 'prompt' || options.source === 'all' || options.includePromptBacked === true;

const filterAgentSkillSources = (skills: AgentSkillManifest[], options: AgentSkillListOptions) =>
  skills.filter(skill => {
    if (skill.source === 'prompt') return shouldIncludePromptSource(options);
    return shouldIncludeAgentSkillSource(options);
  });

export const listAgentSkills = (options: AgentSkillListOptions = {}): AgentSkillManifest[] => {
  const skills = filterAgentSkillSources(applyAgentSkillCategoryOverrides([
    ...(shouldIncludeAgentSkillSource(options) ? loadBuiltinAgentSkills() : []),
    ...(shouldIncludePromptSource(options) ? loadPromptBackedAgentSkills() : []),
    ...(shouldIncludeAgentSkillSource(options) ? loadStoredAgentSkills() : []),
  ]), options);
  const deduped = Array.from(new Map(skills.map(skill => [skill.id, skill])).values());
  return options.includeDisabled ? deduped : deduped.filter(skill => skill.enabled !== false);
};

export const listAgentSkillsAsync = async (options: AgentSkillListOptions = {}) => {
  const scanned = await scanAgentSkillDirectories();
  const skills = filterAgentSkillSources(applyAgentSkillCategoryOverrides([
    ...(shouldIncludeAgentSkillSource(options) ? loadBuiltinAgentSkills() : []),
    ...(shouldIncludePromptSource(options) ? loadPromptBackedAgentSkills() : []),
    ...(shouldIncludeAgentSkillSource(options) ? loadStoredAgentSkills() : []),
    ...(shouldIncludeAgentSkillSource(options) ? scanned : []),
  ]), options);
  const deduped = Array.from(new Map(skills.map(skill => [skill.id, skill])).values());
  return options.includeDisabled ? deduped : deduped.filter(skill => skill.enabled !== false);
};

const skillSearchText = (skill: AgentSkillManifest) => [
  skill.id,
  skill.name,
  skill.description,
  skill.category,
  ...(skill.tags || []),
  ...(skill.triggers || []),
  skill.content?.slice(0, 2000),
].filter(Boolean).join(' ').toLowerCase();

export const searchAgentSkills = (query: string, limit = 12) => {
  const q = query.trim().toLowerCase();
  const skills = listAgentSkills();
  if (!q) return skills.slice(0, limit);
  const tokens = q.split(/[\s,，;；/\\|]+/).filter(Boolean);
  return skills
    .map(skill => ({
      skill,
      score: tokens.reduce((total, token) => total + (skillSearchText(skill).includes(token) ? 1 : 0), 0),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.skill.updatedAt || 0) - (a.skill.updatedAt || 0))
    .slice(0, limit)
    .map(item => item.skill);
};

export const searchAgentSkillsAsync = async (query: string, limit = 12) => {
  const q = query.trim().toLowerCase();
  const skills = await listAgentSkillsAsync();
  if (!q) return skills.slice(0, limit);
  const tokens = q.split(/[\s,，;；/\\|]+/).filter(Boolean);
  return skills
    .map(skill => ({
      skill,
      score: tokens.reduce((total, token) => total + (skillSearchText(skill).includes(token) ? 1 : 0), 0),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.skill.updatedAt || 0) - (a.skill.updatedAt || 0))
    .slice(0, limit)
    .map(item => item.skill);
};

export const loadAgentSkill = async (idOrName: string, options: AgentSkillListOptions = {}): Promise<AgentSkillLoadResult> => {
  const needle = idOrName.trim().toLowerCase();
  if (!needle) return { success: false, error: 'skill id/name 不能为空。' };
  const skill = (await listAgentSkillsAsync({ ...options, includeDisabled: true })).find(item =>
    item.id.toLowerCase() === needle ||
    item.name.toLowerCase() === needle ||
    item.id.toLowerCase().endsWith(`:${needle}`),
  );
  if (!skill) return { success: false, error: `未找到 Skill：${idOrName}` };
  if (skill.enabled === false) return { success: false, error: `Skill 已禁用：${skill.name}` };
  if (skill.path && !skill.content) {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    const result = await api?.agentSkillRead?.({ path: skill.path });
    if (result?.success) {
      return { success: true, skill, content: result.content || '' };
    }
  }
  return {
    success: true,
    skill,
    content: skill.content || '',
  };
};
