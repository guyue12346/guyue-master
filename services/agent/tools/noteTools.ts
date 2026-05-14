import type { MarkdownNote, Note, PromptRecord } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';
import { normalizeLimit } from './toolUtils';

export const NOTE_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
      name: 'create_note',
      module: 'notes',
      tool: {
        name: 'create_note',
        description: '创建一个便签笔记（短文本备忘）',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '笔记内容' },
            color: { type: 'string', enum: ['bg-yellow-100', 'bg-green-100', 'bg-blue-100', 'bg-pink-100', 'bg-purple-100', 'bg-orange-100'], description: '便签颜色，默认 bg-yellow-100' },
          },
          required: ['content'],
        },
      },
      execute: async (args, ctx) => {
        const noteData: Partial<Note> = {
          content: typeof args.content === 'string' ? args.content.trim() : '新便签',
          color: args.color || 'bg-yellow-100',
        };
        ctx.onCreateNote(noteData);
        return { success: true, message: '便签创建成功', note: noteData };
      },
    },
  {
      name: 'create_prompt',
      module: 'prompts',
      tool: {
        name: 'create_prompt',
        description: '创建一个 Prompt 技能卡（用于存储可复用的提示词/技能模板）',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '技能名称' },
            content: { type: 'string', description: '提示词/技能内容，支持 Markdown' },
            category: { type: 'string', description: '分类名称，必须是系统已有分类，工具执行时会校验。若已有分类均不合适，请先调用 create_category 创建新分类。' },
            description: { type: 'string', description: '简短描述' },
          },
          required: ['title', 'content'],
        },
      },
      execute: async (args, ctx) => {
        if (typeof args.category === 'string' && args.category.trim()) {
          const catName = args.category.trim();
          if (!ctx.promptCategories.includes(catName)) {
            return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.promptCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "prompts"）创建新分类后再试。` };
          }
        }
        const promptData: Partial<PromptRecord> = {
          title: typeof args.title === 'string' ? args.title.trim() : '未命名技能',
          content: typeof args.content === 'string' ? args.content : '',
          category: typeof args.category === 'string' ? args.category.trim() : '未分类',
          description: typeof args.description === 'string' ? args.description : undefined,
        };
        ctx.onCreatePrompt(promptData);
        return { success: true, message: '技能卡创建成功', prompt: promptData };
      },
    },
  {
      name: 'create_markdown_note',
      module: 'markdown',
      tool: {
        name: 'create_markdown_note',
        description: '创建一篇 Markdown 长文笔记（适合日记、笔记、文章）',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记标题' },
            content: { type: 'string', description: '笔记正文，Markdown 格式' },
            category: { type: 'string', description: '分类名称，必须是系统已有分类，工具执行时会校验。若已有分类均不合适，请先调用 create_category 创建新分类。' },
          },
          required: ['title', 'content'],
        },
      },
      execute: async (args, ctx) => {
        if (typeof args.category === 'string' && args.category.trim()) {
          const catName = args.category.trim();
          if (!ctx.markdownCategories.includes(catName)) {
            return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.markdownCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "markdown"）创建新分类后再试。` };
          }
        }
        const noteData: Partial<MarkdownNote> = {
          title: typeof args.title === 'string' ? args.title.trim() : '新笔记',
          content: typeof args.content === 'string' ? args.content : '',
          category: typeof args.category === 'string' ? args.category.trim() : '',
        };
        ctx.onCreateMarkdownNote(noteData);
        return { success: true, message: 'Markdown 笔记创建成功', note: noteData };
      },
    },
  {
      name: 'query_notes',
      module: 'notes',
      tool: {
        name: 'query_notes',
        description: '查询当前所有便签笔记。',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '最多返回条数，默认 20' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.read) return { success: false, error: '便签查询未授权。请在权限面板中开启「待办事项」读取权限。' };
        const limit = Math.min(Number(args.limit) || 20, 50);
        const result = ctx.notes.slice(0, limit).map(n => ({
          id: n.id,
          content: n.content,
          color: n.color,
          createdAt: new Date(n.createdAt).toLocaleString('zh-CN'),
        }));
        return { success: true, total: ctx.notes.length, returned: result.length, notes: result };
      },
    },
  {
      name: 'update_note',
      module: 'notes',
      tool: {
        name: 'update_note',
        description: '修改一条已有的便签笔记。需要先 query_notes 获取 id。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '便签的 id' },
            content: { type: 'string', description: '新的内容（可选）' },
            color: { type: 'string', enum: ['bg-yellow-100', 'bg-green-100', 'bg-blue-100', 'bg-pink-100', 'bg-purple-100', 'bg-orange-100'], description: '新的颜色（可选）' },
          },
          required: ['id'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '便签修改未授权。请在权限面板中开启「待办事项」写入权限。' };
        const note = ctx.notes.find(n => n.id === args.id);
        if (!note) return { success: false, error: `未找到 id 为「${args.id}」的便签。` };
        const updates: Partial<Note> = {};
        if (typeof args.content === 'string') updates.content = args.content;
        if (typeof args.color === 'string') updates.color = args.color;
        ctx.onUpdateNote(args.id, updates);
        return { success: true, message: '便签已更新', updated: updates };
      },
    },
  {
      name: 'delete_note',
      module: 'notes',
      tool: {
        name: 'delete_note',
        description: '删除一条便签笔记。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '便签的 id' },
          },
          required: ['id'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '便签删除未授权。请在权限面板中开启「待办事项」写入权限。' };
        const note = ctx.notes.find(n => n.id === args.id);
        if (!note) return { success: false, error: `未找到 id 为「${args.id}」的便签。` };
        ctx.onDeleteNote(args.id);
        return { success: true, message: '便签已删除' };
      },
    },
];
