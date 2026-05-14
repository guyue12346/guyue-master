import type { ToolRegistration } from '../toolRegistry';

const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

export const FILE_TOOL_REGISTRATIONS: ToolRegistration[] = [
  // ─── 文件管理工具（需分类授权）───
  {
    name: 'query_files',
    module: 'files',
    tool: {
      name: 'query_files',
      description: '查询文件管理模块中的文件列表。可按分类筛选、按名称搜索。需要对应分类的权限。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '按分类筛选（可选，不传则返回所有已授权分类的文件）' },
          keyword: { type: 'string', description: '按文件名或备注搜索（可选）' },
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (ctx.filePermissions.length === 0) return { success: false, error: '文件读取未授权。请在 Agent 权限中心开启「文件」读取权限。' };
      let items = ctx.fileRecords.filter(f => ctx.filePermissions.includes(f.category) || ctx.filePermissions.includes('全部'));
      if (typeof args.category === 'string' && args.category.trim()) {
        const cat = args.category.trim();
        if (!ctx.filePermissions.includes(cat) && !ctx.filePermissions.includes('全部')) {
          return { success: false, error: `分类「${cat}」未授权。请在 Agent 权限中心开启「文件」读取权限。` };
        }
        items = items.filter(f => f.category === cat);
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        items = items.filter(f => f.name.toLowerCase().includes(kw) || f.note.toLowerCase().includes(kw));
      }
      const limit = Math.min(Number(args.limit) || 20, 50);
      const result = items.slice(0, limit).map(f => ({ id: f.id, name: f.name, type: f.type, category: f.category, importance: f.importance, note: f.note || null }));
      return { success: true, total: items.length, returned: result.length, files: result, authorizedCategories: ctx.filePermissions, hint: '以上仅为文件元信息。如需查看文件内容，请对每个文件调用 read_file 工具并传入对应的 id。' };
    },
  },
  {
    name: 'read_file',
    module: 'files',
    tool: {
      name: 'read_file',
      description: '读取文件管理模块中某个文件的内容。需要先 query_files 获取文件 id。仅支持文本类文件（md、txt、json 等）。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '文件的 id（从 query_files 结果中获取）' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      const file = ctx.fileRecords.find(f => f.id === args.id);
      if (!file) return { success: false, error: `未找到 id 为「${args.id}」的文件。` };
      if (!ctx.filePermissions.includes(file.category) && !ctx.filePermissions.includes('全部')) {
        return { success: false, error: `文件「${file.name}」读取未授权。请在 Agent 权限中心开启「文件」读取权限。` };
      }
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.readFile) return { success: false, error: '文件读取不可用（非桌面端）。' };
      const content = await electronAPI.readFile(file.path);
      if (content === null) return { success: false, error: `读取失败：文件「${file.name}」不存在或无法读取。` };
      const MAX_LEN = 50000;
      const truncated = content.length > MAX_LEN;
      return {
        success: true,
        id: file.id,
        name: file.name,
        category: file.category,
        content: truncated ? content.slice(0, MAX_LEN) : content,
        length: content.length,
        truncated,
      };
    },
  },
  {
    name: 'edit_file',
    module: 'files',
    tool: {
      name: 'edit_file',
      description: '修改文件管理模块中某个文本文件的完整内容。必须先 query_files/read_file 获取文件 id 并确认目标文件。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '文件的 id（从 query_files 结果中获取）' },
          content: { type: 'string', description: '新的完整文件内容' },
        },
        required: ['id', 'content'],
      },
    },
    execute: async (args, ctx) => {
      const file = ctx.fileRecords.find(f => f.id === args.id);
      if (!file) return { success: false, error: `未找到 id 为「${args.id}」的文件。` };
      if (!ctx.filePermissions.includes(file.category) && !ctx.filePermissions.includes('全部')) {
        return { success: false, error: `文件「${file.name}」编辑未授权。请在 Agent 权限中心开启「文件」修改权限。` };
      }
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.writeFile) return { success: false, error: '文件写入不可用（非桌面端）。' };
      const content = typeof args.content === 'string' ? args.content : '';
      const ok = await electronAPI.writeFile(file.path, content);
      if (!ok) return { success: false, error: `文件「${file.name}」保存失败。` };
      return { success: true, message: `文件「${file.name}」已更新。`, id: file.id, name: file.name, length: content.length };
    },
  },

];
