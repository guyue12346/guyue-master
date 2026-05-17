import type { ToolRegistration } from '../toolRegistry';
import { listAgentSkillsAsync, loadAgentSkill, searchAgentSkillsAsync, type AgentSkillManifest } from '../skillManager';

const compactSkill = (skill: AgentSkillManifest) => ({
  id: skill.id,
  name: skill.name,
  description: skill.description || '',
  category: skill.category || '',
  tags: skill.tags || [],
  triggers: skill.triggers || [],
  source: skill.source,
  enabled: skill.enabled !== false,
  updatedAt: skill.updatedAt,
});

export const SKILL_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'query_agent_skills',
    module: 'skills',
    origin: 'skill',
    exposure: 'direct',
    permission: { module: 'skills', action: 'read' },
    tool: {
      name: 'query_agent_skills',
      description: '查询可供 Agent 使用的 Skills，仅返回真正的 Agent Skill / SKILL.md 能力包，不返回 Prompt 提示词卡片。需要查找领域工作流、流程规范或加载某个 Skill 前使用。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '可选。按标题、描述、标签、触发词搜索。' },
          limit: { type: 'number', description: '最多返回数量，默认 12。' },
          includeDisabled: { type: 'boolean', description: '是否包含禁用技能，默认 false。' },
        },
      },
    },
    execute: async (args) => {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      const limit = Number.isFinite(Number(args.limit)) ? Number(args.limit) : 12;
      const skills = query
        ? await searchAgentSkillsAsync(query, limit)
        : (await listAgentSkillsAsync({ includeDisabled: Boolean(args.includeDisabled) })).slice(0, limit);
      return {
        success: true,
        skills: skills.map(compactSkill),
        message: skills.length
          ? `找到 ${skills.length} 个可用 Skill。需要使用具体内容时调用 load_agent_skill。`
          : '没有找到匹配的 Skill。',
      };
    },
  },
  {
    name: 'load_agent_skill',
    module: 'skills',
    origin: 'skill',
    exposure: 'direct',
    permission: { module: 'skills', action: 'read' },
    tool: {
      name: 'load_agent_skill',
      description: '加载某个 Agent Skill 的完整内容。适合在执行任务前读取 SKILL.md 能力包、流程规范或内置 Skill。必须传 query_agent_skills 返回的 id，或准确标题。',
      inputSchema: {
        type: 'object',
        properties: {
          idOrName: { type: 'string', description: 'Skill id 或准确标题，例如 builtin:create-plan。' },
        },
        required: ['idOrName'],
      },
    },
    execute: async (args) => {
      const result = await loadAgentSkill(String(args.idOrName || ''));
      if (!result.success) return result;
      return {
        success: true,
        skill: result.skill ? compactSkill(result.skill) : undefined,
        content: result.content || '',
        message: result.content
          ? `已加载 Skill「${result.skill?.name || args.idOrName}」。后续回复应遵循该 Skill 内容。`
          : `Skill「${result.skill?.name || args.idOrName}」没有可加载正文。`,
      };
    },
  },
  {
    name: 'load_skill',
    module: 'skills',
    origin: 'skill',
    exposure: 'direct',
    permission: { module: 'skills', action: 'read' },
    tool: {
      name: 'load_skill',
      description: '正式 Skill 加载节点：加载某个 Agent Skill 的完整内容。语义等同 load_agent_skill。',
      inputSchema: {
        type: 'object',
        properties: {
          idOrName: { type: 'string', description: 'Skill id 或准确标题。' },
        },
        required: ['idOrName'],
      },
    },
    execute: async (args, ctx) => SKILL_TOOL_REGISTRATIONS[1].execute(args, ctx),
  },
];
