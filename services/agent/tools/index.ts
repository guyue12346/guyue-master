import type {
  Category,
  EmailConfig,
  LatexFileCategory,
  LatexManagedFile,
  LatexTemplate,
  MarkdownNote,
  Note,
  OJSubmission,
  PromptRecord,
  RecurringCategory,
  RecurringEvent,
  ResourceItem,
  APIRecord,
  SSHRecord,
  SubTask,
  TodoItem,
} from '../../../types';
import { loadProfiles } from '../../../utils/apiProfileService';
import { buildIndex, loadRagIndex, saveRagIndex, searchIndex } from '../../../utils/ragService';
import { loadContacts } from '../agentStorage';
import type { ToolRegistration } from '../toolRegistry';
import { normalizeTodoPayload, resolveTodoMatch, resolveTodoSchedulePayload } from './todoHelpers';

const getEmbeddingKeyFromProfiles = (): { apiKey: string; baseUrl?: string } => {
  try {
    const profiles = loadProfiles();
    const embProviders = ['openai', 'gemini', 'zhipu', 'qwen', 'ollama', 'cohere', 'voyage', 'jina'];
    const profile = profiles.find(p => embProviders.includes(p.provider) && p.apiKey);
    if (profile) return { apiKey: profile.apiKey, baseUrl: profile.baseUrl || undefined };
  } catch {}
  const apiKey = localStorage.getItem('guyue_rag_embedding_key') || '';
  const baseUrl = localStorage.getItem('guyue_rag_embedding_base_url')?.trim() || undefined;
  return { apiKey, baseUrl };
};

const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

const textIncludes = (value: unknown, keyword: string) =>
  typeof value === 'string' && value.toLowerCase().includes(keyword.toLowerCase());

const buildSshCommand = (record: Pick<SSHRecord, 'host' | 'username' | 'port'>) =>
  `ssh -p ${record.port || '22'} ${record.username || 'root'}@${record.host}`;

const toSafeApiRecord = (record: APIRecord) => ({
  id: record.id,
  title: record.title,
  baseUrl: record.baseUrl,
  endpoint: record.endpoint,
  method: record.method,
  usage: record.usage,
  category: record.category,
  note: record.note,
  priority: record.priority,
  createdAt: record.createdAt,
  hasApiKey: Boolean(record.apiKey),
});

export const TOOL_REGISTRY: ToolRegistration[] = [
  {
    name: 'create_todo',
    module: 'todo',
    tool: {
      name: 'create_todo',
      description: '创建一个新的待办事项。创建前必须先 query_todos 获取可用分类列表（availableCategories），category 必须是其中之一，不可自行编造。普通时点事项用 dueDate；时间段日程必须使用 startDateTime + endDateTime（或 durationMinutes）创建 range 事件。',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '待办事项标题或内容' },
          description: { type: 'string', description: '补充说明' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
          category: { type: 'string', description: '分类名称，必须是系统已有分类，工具执行时会校验。若已有分类均不合适，请先调用 create_category 创建新分类。' },
          dueDate: { type: 'string', description: '单个时间点或全天事项时间，格式 YYYY-MM-DDTHH:mm，如 "2026-03-15T14:00"。若仅传日期且想视为全天，可传 timeType="allday"。' },
          timeType: { type: 'string', enum: ['point', 'range', 'allday'], description: '时间类型。时间段日程请传 range。' },
          startDateTime: { type: 'string', description: '时间段事件开始时间，格式 YYYY-MM-DDTHH:mm，例如 "2026-03-15T15:00"。' },
          endDateTime: { type: 'string', description: '时间段事件结束时间，格式 YYYY-MM-DDTHH:mm，例如 "2026-03-15T17:00"。' },
          durationMinutes: { type: 'number', description: '时间段事件时长（分钟）。若未提供 endDateTime，可用它配合 startDateTime 自动计算结束时间。' },
        },
        required: ['content'],
      },
    },
    execute: async (args, ctx) => {
      if (typeof args.category === 'string' && args.category.trim()) {
        const catName = args.category.trim();
        if (!ctx.todoCategories.includes(catName)) {
          return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.todoCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "todo"）创建新分类后再试。` };
        }
      }
      const schedule = resolveTodoSchedulePayload(args);
      if (schedule.error) {
        return { success: false, error: schedule.error };
      }
      const todoData = normalizeTodoPayload(args);
      todoData.id = crypto.randomUUID();
      ctx.onCreateTodo(todoData);
      // 同步更新 ctx.todos 以便后续 create_subtask 能立即找到
      ctx.todos.push({
        id: todoData.id,
        content: todoData.content || '新事项',
        description: todoData.description,
        isCompleted: false,
        priority: todoData.priority || 'medium',
        category: todoData.category || '未分类',
        dueDate: todoData.dueDate,
        timeType: todoData.timeType,
        timeStart: todoData.timeStart,
        timeEnd: todoData.timeEnd,
        createdAt: Date.now(),
      } as TodoItem);
      return { success: true, message: '待办事项创建成功', todo: { id: todoData.id, ...todoData } };
    },
  },
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
    name: 'create_oj_submission',
    module: 'dc-oj',
    tool: {
      name: 'create_oj_submission',
      description: '创建一条 OJ 做题记录（洛谷、AcWing、LeetCode 等）。从用户描述或截图中提取题号、平台、难度等信息。',
      inputSchema: {
        type: 'object',
        properties: {
          siteName: { type: 'string', description: '平台名称，如 "洛谷"、"AcWing"、"LeetCode"' },
          categoryId: { type: 'string', description: '难度/分类的唯一 ID（从 query_oj_stats 返回的站点 categories[].id 获取）。不确定时可省略。' },
          problemId: { type: 'string', description: '题号，如 "P1001"、"3"、"1"' },
          problemTitle: { type: 'string', description: '题目标题（可选）' },
          date: { type: 'string', description: '做题日期 YYYY-MM-DD，默认今天' },
        },
        required: ['siteName', 'problemId'],
      },
    },
    execute: async (args, ctx) => {
      const siteName = (typeof args.siteName === 'string' ? args.siteName : '').trim();
      const site = ctx.ojHeatmapData.sites.find(s =>
        s.name.toLowerCase() === siteName.toLowerCase() ||
        s.id.toLowerCase() === siteName.toLowerCase()
      );
      if (!site) {
        const available = ctx.ojHeatmapData.sites.map(s => s.name).join('、') || '暂无';
        return { success: false, error: `未找到平台「${siteName}」，当前可用平台：${available}` };
      }

      let categoryId = site.categories?.[0]?.id || 'easy';
      if (args.categoryId && site.categories) {
        const matched = site.categories.find(c => c.id === String(args.categoryId).trim());
        if (!matched) {
          const available = site.categories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」在平台「${site.name}」中不存在。可用分类：${available}。` };
        }
        categoryId = matched.id;
      }

      const now = new Date();
      const dateStr = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
        ? args.date
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const submission: OJSubmission = {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        siteId: site.id,
        categoryId,
        problemId: String(args.problemId).trim(),
        problemTitle: typeof args.problemTitle === 'string' ? args.problemTitle.trim() : undefined,
        timestamp: Date.now(),
        date: dateStr,
      };
      ctx.onCreateOJSubmission(submission);
      const catLabel = site.categories?.find(c => c.id === categoryId)?.name || categoryId;
      return { success: true, message: `做题记录创建成功：${site.name} ${submission.problemId}（${catLabel}）`, submission };
    },
  },
  {
    name: 'create_resource',
    module: 'dc-resources',
    tool: {
      name: 'create_resource',
      description: '创建一条资源记录（云盘、AI 资源、服务器、域名、订阅服务等）。调用前请先 query_resources 获取分类列表及其 ID，用 categoryId 指定分类。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '资源名称，如 "iCloud 200G"、"ChatGPT Plus"' },
          categoryId: { type: 'string', description: '分类的唯一 ID（从 query_resources 返回的 categories[].id 获取）。不确定时可省略，将使用默认分类。' },
          expireDate: { type: 'string', description: '到期日期 YYYY-MM-DD（可选）' },
          capacityUsed: { type: 'number', description: '已用容量数值（可选）' },
          capacityTotal: { type: 'number', description: '总容量数值（可选）' },
          capacityUnit: { type: 'string', description: '容量单位，如 GB、TB（可选）' },
          costAmount: { type: 'number', description: '费用金额（可选）' },
          costPeriod: { type: 'string', enum: ['month', 'year', 'once'], description: '费用周期（可选）' },
          url: { type: 'string', description: '资源网址（可选）' },
          note: { type: 'string', description: '备注（可选）' },
          account: { type: 'string', description: '账号/用户名（可选）' },
          autoRenewal: { type: 'boolean', description: '是否自动续费（可选）' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      const categories = ctx.resourceData.categories;
      let categoryId = categories[0]?.id || 'cloud';
      if (args.categoryId) {
        const matched = categories.find(c => c.id === String(args.categoryId).trim());
        if (!matched) {
          const available = categories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。请先调用 query_resources 获取正确的分类 ID。` };
        }
        categoryId = matched.id;
      }

      const item: Partial<ResourceItem> = {
        name: typeof args.name === 'string' ? args.name.trim() : '新资源',
        categoryId,
        expireDate: typeof args.expireDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.expireDate) ? args.expireDate : undefined,
        capacity: (args.capacityTotal && args.capacityTotal > 0)
          ? { used: Number(args.capacityUsed) || 0, total: Number(args.capacityTotal), unit: typeof args.capacityUnit === 'string' ? args.capacityUnit : 'GB' }
          : undefined,
        cost: (args.costAmount && args.costAmount > 0)
          ? { amount: Number(args.costAmount), period: (['month', 'year', 'once'].includes(args.costPeriod) ? args.costPeriod : 'month') as 'month' | 'year' | 'once' }
          : undefined,
        url: typeof args.url === 'string' ? args.url.trim() : undefined,
        note: typeof args.note === 'string' ? args.note.trim() : undefined,
        account: typeof args.account === 'string' ? args.account.trim() : undefined,
        autoRenewal: typeof args.autoRenewal === 'boolean' ? args.autoRenewal : undefined,
      };
      ctx.onCreateResource(item);
      const catLabel = categories.find(c => c.id === categoryId)?.name || categoryId;
      return { success: true, message: `资源创建成功：${item.name}（${catLabel}）`, resource: item };
    },
  },
  // ─── 查询工具（只读，不修改数据）───
  {
    name: 'query_todos',
    module: 'todo',
    tool: {
      name: 'query_todos',
      description: '查询当前所有待办事项及可用分类列表。创建/修改待办前必须先调用此工具获取可用分类名称，不可自行编造分类。',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['all', 'pending', 'completed'], description: '筛选状态：all=全部，pending=未完成，completed=已完成。默认 pending。' },
          limit: { type: 'number', description: '最多返回条数，默认 20，最大 50。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.read) return { success: false, error: '待办查询未授权。请点击 🔒 按钮，在权限面板中开启「待办事项」读取权限。' };
      const status = args.status || 'pending';
      const limit = Math.min(Number(args.limit) || 20, 50);
      let items = ctx.todos;
      if (status === 'pending') items = items.filter(t => !t.isCompleted);
      else if (status === 'completed') items = items.filter(t => t.isCompleted);
      const result = items.slice(0, limit).map(t => ({
        id: t.id,
        content: t.content,
        priority: t.priority,
        category: t.category,
        isCompleted: t.isCompleted,
        dueDate: t.dueDate ? new Date(t.dueDate).toLocaleString('zh-CN') : null,
        timeType: t.timeType || (t.dueDate ? 'allday' : null),
        timeStart: t.timeStart ? new Date(t.timeStart).toLocaleString('zh-CN') : null,
        timeEnd: t.timeEnd ? new Date(t.timeEnd).toLocaleString('zh-CN') : null,
        schedule: t.timeType === 'range' && t.timeStart
          ? `${new Date(t.timeStart).toLocaleString('zh-CN')} ～ ${new Date(t.timeEnd || (t.timeStart + 3600000)).toLocaleString('zh-CN')}`
          : (t.dueDate ? new Date(t.dueDate).toLocaleString('zh-CN') : null),
        description: t.description || null,
        subtaskCount: t.subtasks?.length || 0,
        subtaskCompleted: t.subtasks?.filter(s => s.isCompleted).length || 0,
      }));
      return { success: true, total: items.length, returned: result.length, availableCategories: ctx.todoCategories, todos: result };
    },
  },
  {
    name: 'query_oj_stats',
    module: 'dc-oj',
    tool: {
      name: 'query_oj_stats',
      description: '查询 OJ 做题统计数据，包括各平台提交总数、最近做题记录等。可用于生成学习总结或分析刷题情况。',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '统计最近 N 天的数据，默认 30，传 0 表示全部。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.ojStats.read) return { success: false, error: '刷题统计查询未授权。请点击 🔒 按钮，在权限面板中开启「刷题统计」读取权限。' };
      const days = Number(args.days ?? 30);
      const now = Date.now();
      const cutoff = days > 0 ? now - days * 86400000 : 0;
      const subs = ctx.ojHeatmapData.submissions.filter(s =>
        s.id !== 'lc_stats_meta' && s.categoryId !== 'meta' && s.timestamp >= cutoff
      );
      const bysite: Record<string, { name: string; total: number; byCategory: Record<string, number> }> = {};
      for (const site of ctx.ojHeatmapData.sites) {
        bysite[site.id] = { name: site.name, total: 0, byCategory: {} };
      }
      for (const s of subs) {
        if (!bysite[s.siteId]) continue;
        bysite[s.siteId].total += 1;
        bysite[s.siteId].byCategory[s.categoryId] = (bysite[s.siteId].byCategory[s.categoryId] || 0) + 1;
      }
      const recent = subs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map(s => ({
        site: ctx.ojHeatmapData.sites.find(st => st.id === s.siteId)?.name || s.siteId,
        problemId: s.problemId,
        problemTitle: s.problemTitle || null,
        category: s.categoryId,
        date: s.date,
      }));
      return {
        success: true,
        period: days > 0 ? `最近 ${days} 天` : '全部',
        totalSubmissions: subs.length,
        availableSites: ctx.ojHeatmapData.sites.map(site => ({
          id: site.id,
          name: site.name,
          categories: site.categories?.map(category => ({ id: category.id, name: category.name })) || [],
        })),
        bySite: Object.values(bysite).filter(v => v.total > 0),
        recentSubmissions: recent,
      };
    },
  },
  {
    name: 'query_resources',
    module: 'dc-resources',
    tool: {
      name: 'query_resources',
      description: '查询资源中心的资源列表及所有分类（含唯一 ID）。创建资源前必须先调用此工具获取分类 ID。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 categories[].id 获取）。不传则返回全部。' },
          expiringSoonDays: { type: 'number', description: '筛选 N 天内即将到期的资源，不传则不过滤。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.resources.read) return { success: false, error: '资源查询未授权。请点击 🔒 按钮，在权限面板中开启「资源中心」读取权限。' };
      const cats = ctx.resourceData.categories;
      let items = ctx.resourceData.items;
      if (args.categoryId) {
        const catId = String(args.categoryId).trim();
        items = items.filter(i => i.categoryId === catId);
      }
      if (args.expiringSoonDays) {
        const limit = Date.now() + Number(args.expiringSoonDays) * 86400000;
        items = items.filter(i => {
          if (!i.expireDate) return false;
          return new Date(i.expireDate).getTime() <= limit;
        });
      }
      const result = items.map(i => {
        const cat = cats.find(c => c.id === i.categoryId);
        const expireTs = i.expireDate ? new Date(i.expireDate).getTime() : null;
        const daysLeft = expireTs ? Math.ceil((expireTs - Date.now()) / 86400000) : null;
        return {
          name: i.name,
          categoryId: i.categoryId,
          categoryName: cat?.name || i.categoryId,
          expireDate: i.expireDate || null,
          daysLeft,
          capacity: i.capacity ? `${i.capacity.used}/${i.capacity.total} ${i.capacity.unit || 'GB'}` : null,
          cost: i.cost ? `${i.cost.amount} / ${i.cost.period}` : null,
          autoRenewal: i.autoRenewal ?? null,
          note: i.note || null,
        };
      });
      return { success: true, total: result.length, categories: cats.map(c => ({ id: c.id, name: c.name })), resources: result };
    },
  },
  {
    name: 'query_ssh_records',
    module: 'dc-ssh',
    tool: {
      name: 'query_ssh_records',
      description: '查询数据中心 SSH 管理中的连接记录。可按关键词、分类筛选，返回连接命令、主机、端口、用户名、备注等信息。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '按标题、主机、用户名、命令、备注搜索（可选）。' },
          category: { type: 'string', description: '按分类名称筛选（可选）。' },
          limit: { type: 'number', description: '最多返回条数，默认 20，最大 100。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
      const category = typeof args.category === 'string' ? args.category.trim() : '';
      const limit = normalizeLimit(args.limit);
      let records = ctx.sshRecords;
      if (category) records = records.filter(record => record.category === category);
      if (keyword) {
        records = records.filter(record =>
          textIncludes(record.title, keyword) ||
          textIncludes(record.host, keyword) ||
          textIncludes(record.username, keyword) ||
          textIncludes(record.command, keyword) ||
          textIncludes(record.note, keyword)
        );
      }
      const result = [...records]
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(record => ({
          id: record.id,
          title: record.title,
          host: record.host,
          username: record.username,
          port: record.port,
          command: record.command,
          category: record.category,
          networkType: record.networkType,
          note: record.note,
          priority: record.priority,
          createdAt: record.createdAt,
        }));
      return { success: true, total: records.length, returned: result.length, availableCategories: ctx.sshCategories, records: result };
    },
  },
  {
    name: 'create_ssh_record',
    module: 'dc-ssh',
    tool: {
      name: 'create_ssh_record',
      description: '在数据中心 SSH 管理中创建一条连接记录。缺少 command 时会自动生成 ssh -p 端口 用户名@主机。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '连接名称。' },
          host: { type: 'string', description: '主机地址或 IP。' },
          username: { type: 'string', description: '用户名，默认 root。' },
          port: { type: 'string', description: '端口，默认 22。' },
          command: { type: 'string', description: '完整 SSH 命令（可选）。' },
          category: { type: 'string', description: '分类名称，可使用已有分类，也可传新分类。' },
          networkType: { type: 'string', description: '网络类型，如 局域网、公网、内网穿透。' },
          note: { type: 'string', description: '备注。' },
          priority: { type: 'number', description: '排序优先级，数字越小越靠前。' },
        },
        required: ['title', 'host'],
      },
    },
    execute: async (args, ctx) => {
      const title = String(args.title || '').trim();
      const host = String(args.host || '').trim();
      if (!title || !host) return { success: false, error: '创建 SSH 记录需要 title 和 host。' };
      const record: SSHRecord = {
        id: crypto.randomUUID(),
        title,
        host,
        username: typeof args.username === 'string' && args.username.trim() ? args.username.trim() : 'root',
        port: typeof args.port === 'string' && args.port.trim() ? args.port.trim() : '22',
        category: typeof args.category === 'string' && args.category.trim() ? args.category.trim() : '未分类',
        command: '',
        note: typeof args.note === 'string' ? args.note.trim() : '',
        priority: typeof args.priority === 'number' ? args.priority : undefined,
        networkType: typeof args.networkType === 'string' && args.networkType.trim() ? args.networkType.trim() : '局域网',
        createdAt: Date.now(),
      };
      record.command = typeof args.command === 'string' && args.command.trim()
        ? args.command.trim()
        : buildSshCommand(record);
      ctx.onSaveSSH(record);
      ctx.sshRecords.unshift(record);
      return { success: true, message: `SSH 记录「${record.title}」已创建`, record };
    },
  },
  {
    name: 'update_ssh_record',
    module: 'dc-ssh',
    tool: {
      name: 'update_ssh_record',
      description: '修改数据中心 SSH 管理中的连接记录。需要先 query_ssh_records 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'SSH 记录 id。' },
          title: { type: 'string', description: '新连接名称。' },
          host: { type: 'string', description: '新主机地址或 IP。' },
          username: { type: 'string', description: '新用户名。' },
          port: { type: 'string', description: '新端口。' },
          command: { type: 'string', description: '新 SSH 命令；不传且主机/端口/用户名变化时自动重算。' },
          category: { type: 'string', description: '新分类名称。' },
          networkType: { type: 'string', description: '新网络类型。' },
          note: { type: 'string', description: '新备注。' },
          priority: { type: 'number', description: '新排序优先级。' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      const record = ctx.sshRecords.find(item => item.id === args.id);
      if (!record) return { success: false, error: `未找到 id 为「${args.id}」的 SSH 记录。` };
      const updates: Partial<SSHRecord> = {};
      const stringFields: Array<keyof Pick<SSHRecord, 'title' | 'host' | 'username' | 'port' | 'command' | 'category' | 'networkType' | 'note'>> = [
        'title', 'host', 'username', 'port', 'command', 'category', 'networkType', 'note',
      ];
      for (const field of stringFields) {
        if (typeof args[field] === 'string') updates[field] = args[field].trim() as any;
      }
      if (typeof args.priority === 'number') updates.priority = args.priority;
      const shouldRebuildCommand = !updates.command && (updates.host || updates.username || updates.port);
      if (shouldRebuildCommand) {
        const merged = { ...record, ...updates };
        updates.command = buildSshCommand(merged);
      }
      ctx.onSaveSSH({ id: record.id, ...updates });
      Object.assign(record, updates);
      return { success: true, message: `SSH 记录「${record.title}」已更新`, updated: { id: record.id, ...updates } };
    },
  },
  {
    name: 'delete_ssh_record',
    module: 'dc-ssh',
    tool: {
      name: 'delete_ssh_record',
      description: '删除数据中心 SSH 管理中的连接记录。需要先 query_ssh_records 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'SSH 记录 id。' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      const record = ctx.sshRecords.find(item => item.id === args.id);
      if (!record) return { success: false, error: `未找到 id 为「${args.id}」的 SSH 记录。` };
      ctx.onDeleteSSH(record.id);
      ctx.sshRecords = ctx.sshRecords.filter(item => item.id !== record.id);
      return { success: true, message: `SSH 记录「${record.title}」已删除` };
    },
  },
  {
    name: 'query_api_records',
    module: 'dc-api',
    tool: {
      name: 'query_api_records',
      description: '查询数据中心 API 管理中的接口记录。默认不返回 apiKey 明文，只返回 hasApiKey。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '按标题、URL、endpoint、用途、备注搜索（可选）。' },
          category: { type: 'string', description: '按分类名称筛选（可选）。' },
          method: { type: 'string', description: '按 HTTP 方法筛选，如 GET、POST（可选）。' },
          includeSecret: { type: 'boolean', description: '是否尝试返回密钥。安全原因下此工具不会返回密钥明文。' },
          limit: { type: 'number', description: '最多返回条数，默认 20，最大 100。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (args.includeSecret === true) {
        return { success: false, error: 'Agent 不支持直接读取 API Key 明文。请使用 hasApiKey 判断是否已保存密钥。' };
      }
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
      const category = typeof args.category === 'string' ? args.category.trim() : '';
      const method = typeof args.method === 'string' ? args.method.trim().toUpperCase() : '';
      const limit = normalizeLimit(args.limit);
      let records = ctx.apiRecords;
      if (category) records = records.filter(record => record.category === category);
      if (method) records = records.filter(record => record.method.toUpperCase() === method);
      if (keyword) {
        records = records.filter(record =>
          textIncludes(record.title, keyword) ||
          textIncludes(record.baseUrl, keyword) ||
          textIncludes(record.endpoint, keyword) ||
          textIncludes(record.usage, keyword) ||
          textIncludes(record.note, keyword)
        );
      }
      const result = [...records]
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(toSafeApiRecord);
      return { success: true, total: records.length, returned: result.length, availableCategories: ctx.apiCategories, records: result };
    },
  },
  {
    name: 'create_api_record',
    module: 'dc-api',
    tool: {
      name: 'create_api_record',
      description: '在数据中心 API 管理中创建一条接口记录。可以保存用户明确提供的 apiKey；查询工具不会回显密钥。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'API 记录名称。' },
          baseUrl: { type: 'string', description: '基础 URL。' },
          endpoint: { type: 'string', description: '接口路径或完整 URL。' },
          method: { type: 'string', description: 'HTTP 方法，默认 GET，如 GET、POST、PUT、PATCH、DELETE。' },
          apiKey: { type: 'string', description: '用户明确提供时保存的 API Key。' },
          usage: { type: 'string', description: '用途说明。' },
          category: { type: 'string', description: '分类名称，可使用已有分类，也可传新分类。' },
          note: { type: 'string', description: '备注。' },
          priority: { type: 'number', description: '排序优先级，数字越小越靠前。' },
        },
        required: ['title', 'endpoint'],
      },
    },
    execute: async (args, ctx) => {
      const title = String(args.title || '').trim();
      const endpoint = String(args.endpoint || '').trim();
      if (!title || !endpoint) return { success: false, error: '创建 API 记录需要 title 和 endpoint。' };
      const record: APIRecord = {
        id: crypto.randomUUID(),
        title,
        baseUrl: typeof args.baseUrl === 'string' ? args.baseUrl.trim() : '',
        endpoint,
        method: typeof args.method === 'string' ? args.method.toUpperCase() : 'GET',
        apiKey: typeof args.apiKey === 'string' ? args.apiKey : '',
        usage: typeof args.usage === 'string' ? args.usage.trim() : '',
        category: typeof args.category === 'string' && args.category.trim() ? args.category.trim() : '未分类',
        note: typeof args.note === 'string' ? args.note.trim() : '',
        priority: typeof args.priority === 'number' ? args.priority : undefined,
        createdAt: Date.now(),
      };
      ctx.onSaveAPI(record);
      ctx.apiRecords.unshift(record);
      return { success: true, message: `API 记录「${record.title}」已创建`, record: toSafeApiRecord(record) };
    },
  },
  {
    name: 'update_api_record',
    module: 'dc-api',
    tool: {
      name: 'update_api_record',
      description: '修改数据中心 API 管理中的接口记录。需要先 query_api_records 获取 id。不传 apiKey 时保留原密钥。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'API 记录 id。' },
          title: { type: 'string', description: '新名称。' },
          baseUrl: { type: 'string', description: '新基础 URL。' },
          endpoint: { type: 'string', description: '新接口路径或完整 URL。' },
          method: { type: 'string', description: '新 HTTP 方法，如 GET、POST、PUT、PATCH、DELETE。' },
          apiKey: { type: 'string', description: '新 API Key；不传则不修改。' },
          usage: { type: 'string', description: '新用途说明。' },
          category: { type: 'string', description: '新分类名称。' },
          note: { type: 'string', description: '新备注。' },
          priority: { type: 'number', description: '新排序优先级。' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      const record = ctx.apiRecords.find(item => item.id === args.id);
      if (!record) return { success: false, error: `未找到 id 为「${args.id}」的 API 记录。` };
      const updates: Partial<APIRecord> = {};
      const stringFields: Array<keyof Pick<APIRecord, 'title' | 'baseUrl' | 'endpoint' | 'method' | 'apiKey' | 'usage' | 'category' | 'note'>> = [
        'title', 'baseUrl', 'endpoint', 'method', 'apiKey', 'usage', 'category', 'note',
      ];
      for (const field of stringFields) {
        if (typeof args[field] === 'string') {
          updates[field] = field === 'method' ? args[field].toUpperCase() as any : args[field].trim() as any;
        }
      }
      if (typeof args.priority === 'number') updates.priority = args.priority;
      ctx.onSaveAPI({ id: record.id, ...updates });
      Object.assign(record, updates);
      return { success: true, message: `API 记录「${record.title}」已更新`, updated: toSafeApiRecord(record) };
    },
  },
  {
    name: 'delete_api_record',
    module: 'dc-api',
    tool: {
      name: 'delete_api_record',
      description: '删除数据中心 API 管理中的接口记录。需要先 query_api_records 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'API 记录 id。' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      const record = ctx.apiRecords.find(item => item.id === args.id);
      if (!record) return { success: false, error: `未找到 id 为「${args.id}」的 API 记录。` };
      ctx.onDeleteAPI(record.id);
      ctx.apiRecords = ctx.apiRecords.filter(item => item.id !== record.id);
      return { success: true, message: `API 记录「${record.title}」已删除` };
    },
  },
  {
    name: 'create_leetcode_list',
    module: 'leetcode',
    tool: {
      name: 'create_leetcode_list',
      description: '创建一个 LeetCode 题单，由若干分组构成，每组包含多道题目。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '题单标题' },
          description: { type: 'string', description: '题单描述（可选）' },
          priority: { type: 'number', description: '排序优先级，数字越小越靠前，默认 10' },
          groups: {
            type: 'array',
            description: '题目分组列表',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '分组名称，如"基础 DP"' },
                problems: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '题目完整标题，如 "70. 爬楼梯"' },
                      url: { type: 'string', description: 'LeetCode 题目链接，如 "https://leetcode.cn/problems/climbing-stairs/"' },
                      note: { type: 'string', description: '备注信息（可选）' },
                    },
                    required: ['title', 'url'],
                  },
                },
              },
              required: ['name', 'problems'],
            },
          },
        },
        required: ['title', 'groups'],
      },
    },
    execute: async (args, _ctx) => {
      const groups = Array.isArray(args.groups) ? args.groups : [];
      const mdLines: string[] = [];
      const categories: { title: string; problems: { title: string; url: string; note?: string }[] }[] = [];
      for (const group of groups) {
        mdLines.push(`### ${group.name}`);
        mdLines.push('| 题目 | 相关链接 | 备注 |');
        mdLines.push('|---|---|---|');
        const problems: { title: string; url: string; note?: string }[] = [];
        for (const p of (Array.isArray(group.problems) ? group.problems : [])) {
          mdLines.push(`| [${p.title}](${p.url}) | | ${p.note || ''} |`);
          problems.push({ title: p.title, url: p.url, note: p.note || undefined });
        }
        categories.push({ title: group.name, problems });
        mdLines.push('');
      }
      const rawMarkdown = mdLines.join('\n');
      const totalProblems = categories.reduce((n, g) => n + g.problems.length, 0);
      const newList = {
        id: Date.now().toString(),
        title: String(args.title || '').trim(),
        description: String(args.description || '').trim(),
        priority: Number(args.priority) || 10,
        categories,
        rawMarkdown,
        createdAt: Date.now(),
      };
      const existing: any[] = JSON.parse(localStorage.getItem('leetcode_lists') || '[]');
      existing.push(newList);
      existing.sort((a: any, b: any) => (a.priority ?? 10) - (b.priority ?? 10));
      localStorage.setItem('leetcode_lists', JSON.stringify(existing));
      return { success: true, message: `题单「${newList.title}」已创建，包含 ${categories.length} 个分组共 ${totalProblems} 道题。` };
    },
  },
  {
    name: 'create_learning_course',
    module: 'learning',
    tool: {
      name: 'create_learning_course',
      description: '在学习中心创建一个完整的结构化课程（含学习模块、讲义、练习、个人资源、自定义分区）。调用前必须先 query_learning_courses 获取已有分类列表及其 ID，然后用 categoryId 指定分类；若需要新分类请先自行说明。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '课程标题' },
          description: { type: 'string', description: '课程简介' },
          categoryId: { type: 'string', description: '所属分类的唯一 ID（从 query_learning_courses 返回的 categories[].id 获取）。若传入的 ID 不存在，可传 categoryName 来自动创建新分类。' },
          categoryName: { type: 'string', description: '仅在需要创建新分类时使用。传入新分类的显示名称，会自动创建。必须与 categoryId 二选一。' },
          introMarkdown: { type: 'string', description: '课程总览 Markdown（支持 # 标题、列表等）' },
          icon: { type: 'string', description: 'Lucide 图标名，如 "BookOpen"、"Code2"' },
          priority: { type: 'number', description: '排序优先级，默认 10' },
          modules: {
            type: 'array',
            description: '学习内容模块列表，每个模块包含多个讲义',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '模块标题，如 "第一章 基础概念"' },
                description: { type: 'string', description: '模块描述' },
                lectures: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '讲义标题' },
                      lecturer: { type: 'string', description: '讲师/来源' },
                      date: { type: 'string', description: '日期，如 "2025-01-15"' },
                      desc: { type: 'string', description: '讲义描述' },
                      icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe', 'music', 'image'], description: '图标类型' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
          assignmentModules: {
            type: 'array',
            description: '练习模块列表',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '练习模块标题' },
                description: { type: 'string', description: '描述' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '练习项标题' },
                      link: { type: 'string', description: '链接（可选）' },
                      icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe'], description: '图标' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
          personalModules: {
            type: 'array',
            description: '个人资源模块列表',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '资源模块标题' },
                description: { type: 'string', description: '描述' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '资源项标题' },
                      link: { type: 'string', description: '链接（可选）' },
                      icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe'], description: '图标' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
          customSections: {
            type: 'array',
            description: '自定义分区列表（用户自定义的额外板块）',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '分区标题' },
                icon: { type: 'string', description: 'Lucide 图标名，如 "Star"' },
                color: { type: 'string', enum: ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'cyan', 'amber'], description: '颜色' },
                modules: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { title: { type: 'string' }, link: { type: 'string' }, icon: { type: 'string' } },
                          required: ['title'],
                        },
                      },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['title'],
      },
    },
    execute: async (args, _ctx) => {
      const title = String(args.title || '').trim();
      const description = String(args.description || '').trim();
      const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
      let targetCategory: any = null;
      // 优先用 categoryId 精确匹配
      if (args.categoryId) {
        targetCategory = cats.find((c: any) => c.id === String(args.categoryId).trim());
        if (!targetCategory) {
          const available = cats.map((c: any) => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。请先调用 query_learning_courses 获取正确的分类 ID。` };
        }
      } else if (args.categoryName) {
        // 创建新分类
        const catName = String(args.categoryName).trim();
        targetCategory = { id: `cat_${Date.now()}`, name: catName, icon: args.icon || 'BookOpen', color: 'blue', priority: 10 };
        cats.push(targetCategory);
        localStorage.setItem('learning_categories_v1', JSON.stringify(cats));
      } else {
        return { success: false, error: '必须提供 categoryId（已有分类）或 categoryName（创建新分类）。请先调用 query_learning_courses 查看已有分类。' };
      }

      const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const courseId = genId('course');

      // 构建 modules
      const modules = (Array.isArray(args.modules) ? args.modules : []).map((m: any) => ({
        id: genId('mod'),
        title: String(m.title || ''),
        description: String(m.description || ''),
        lectures: (Array.isArray(m.lectures) ? m.lectures : []).map((l: any) => ({
          id: genId('lec'),
          title: String(l.title || ''),
          lecturer: String(l.lecturer || ''),
          materials: '',
          date: String(l.date || ''),
          desc: String(l.desc || ''),
          icon: l.icon || undefined,
        })),
      }));

      // 构建 assignmentModules
      const assignmentModules = (Array.isArray(args.assignmentModules) ? args.assignmentModules : []).map((m: any) => ({
        id: genId('amod'),
        title: String(m.title || ''),
        description: String(m.description || ''),
        items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
          id: genId('ai'),
          title: String(i.title || ''),
          link: String(i.link || ''),
          icon: i.icon || undefined,
        })),
      }));

      // 构建 personalModules
      const personalModules = (Array.isArray(args.personalModules) ? args.personalModules : []).map((m: any) => ({
        id: genId('pmod'),
        title: String(m.title || ''),
        description: String(m.description || ''),
        items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
          id: genId('pi'),
          title: String(i.title || ''),
          link: String(i.link || ''),
          icon: i.icon || undefined,
        })),
      }));

      // 构建 customSections
      const customSections = (Array.isArray(args.customSections) ? args.customSections : []).map((s: any) => ({
        id: genId('csec'),
        title: String(s.title || ''),
        icon: String(s.icon || 'Star'),
        color: String(s.color || 'blue'),
        modules: (Array.isArray(s.modules) ? s.modules : []).map((m: any) => ({
          id: genId('cm'),
          title: String(m.title || ''),
          description: String(m.description || ''),
          items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
            id: genId('ci'),
            title: String(i.title || ''),
            link: String(i.link || ''),
            icon: i.icon || undefined,
          })),
        })),
      }));

      const totalLectures = modules.reduce((n: number, m: any) => n + m.lectures.length, 0);
      const totalAssignments = assignmentModules.reduce((n: number, m: any) => n + m.items.length, 0);

      const newCourse = {
        id: courseId,
        title,
        description,
        categoryId: targetCategory.id,
        modules,
        assignments: [],
        assignmentModules,
        personalModules,
        customSections,
        introMarkdown: String(args.introMarkdown || '').trim() || `# ${title}\n\n${description || '在这里编写学习总览...'}`,
        icon: args.icon || undefined,
        priority: Number(args.priority) || 10,
      };
      const courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
      courses.push(newCourse);
      localStorage.setItem('learning_courses_v1', JSON.stringify(courses));
      // 通知 LearningManager 重新读取
      window.dispatchEvent(new CustomEvent('learning-data-updated'));

      const parts = [`课程「${title}」已创建，归属分类「${targetCategory.name}」`];
      if (modules.length > 0) parts.push(`${modules.length} 个学习模块（${totalLectures} 个讲义）`);
      if (assignmentModules.length > 0) parts.push(`${assignmentModules.length} 个练习模块（${totalAssignments} 个练习项）`);
      if (personalModules.length > 0) parts.push(`${personalModules.length} 个个人资源模块`);
      if (customSections.length > 0) parts.push(`${customSections.length} 个自定义分区`);
      return { success: true, message: parts.join('，') + '。' };
    },
  },
  {
    name: 'query_leetcode_lists',
    module: 'leetcode',
    tool: {
      name: 'query_leetcode_lists',
      description: '查询所有 LeetCode 题单，返回标题、描述、分组数和题目总数。创建新题单前可先调用以避免重复。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    execute: async (_args, ctx) => {
      if (!ctx.dataPermissions.leetcodeLists.read) return { success: false, error: '题单查询未授权。请点击 🔒 按钮，在权限面板中开启「题单」读取权限。' };
      const lists: any[] = JSON.parse(localStorage.getItem('leetcode_lists') || '[]');
      return {
        success: true,
        total: lists.length,
        lists: lists.map((l: any) => ({
          id: l.id,
          title: l.title,
          description: l.description || null,
          priority: l.priority ?? 10,
          groupCount: (l.categories || []).length,
          problemCount: (l.categories || []).reduce((n: number, g: any) => n + (g.problems || []).length, 0),
          createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString('zh-CN') : null,
        })),
      };
    },
  },
  {
    name: 'query_learning_courses',
    module: 'learning',
    tool: {
      name: 'query_learning_courses',
      description: '查询学习中心的分类和课程列表，返回每个分类的唯一 ID。创建课程前必须先调用此工具获取分类 ID。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 categories[].id 获取），不传则返回全部' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.learningCourses.read) return { success: false, error: '学习课程查询未授权。请点击 🔒 按钮，在权限面板中开启「学习课程」读取权限。' };
      const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
      let courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
      if (args.categoryId) {
        const catId = String(args.categoryId).trim();
        courses = courses.filter((c: any) => c.categoryId === catId);
      }
      return {
        success: true,
        categories: cats.map((c: any) => ({ id: c.id, name: c.name })),
        courses: courses.map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description || null,
          categoryId: c.categoryId,
          categoryName: cats.find((cat: any) => cat.id === c.categoryId)?.name || c.categoryId,
          moduleCount: (c.modules || []).length,
          lectureCount: (c.modules || []).reduce((n: number, m: any) => n + (m.lectures || []).length, 0),
          assignmentModuleCount: (c.assignmentModules || []).length,
          personalModuleCount: (c.personalModules || []).length,
          customSectionCount: (c.customSections || []).length,
        })),
      };
    },
  },
  // ─── 修改工具（需要写入权限）───
  {
    name: 'update_todo',
    module: 'todo',
    tool: {
      name: 'update_todo',
      description: '修改一条已有的待办事项。可修改内容、优先级、分类、截止日期、完成状态等字段。需要先 query_todos 获取 id 和可用分类列表。category 必须是已有分类名称，不可自行编造。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办的 id（从 query_todos 结果中获取）' },
          content: { type: 'string', description: '新的内容标题（可选）' },
          description: { type: 'string', description: '新的描述（可选）' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '新的优先级（可选）' },
          category: { type: 'string', description: '新的分类名称（必须是 query_todos 返回的 availableCategories 中的值，不可自行编造）' },
          dueDate: { type: 'string', description: '新的单点时间 YYYY-MM-DDTHH:mm（可选）' },
          timeType: { type: 'string', enum: ['point', 'range', 'allday'], description: '新的时间类型（可选）' },
          startDateTime: { type: 'string', description: '新的时间段开始时间 YYYY-MM-DDTHH:mm（可选）' },
          endDateTime: { type: 'string', description: '新的时间段结束时间 YYYY-MM-DDTHH:mm（可选）' },
          durationMinutes: { type: 'number', description: '新的时长分钟（可选，配合 startDateTime 使用）' },
          isCompleted: { type: 'boolean', description: '是否已完成（可选）' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请在权限面板中开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.id);
      if (!todo) return { success: false, error: `未找到 id 为「${args.id}」的待办事项。` };
      const updates: Partial<TodoItem> = {};
      if (typeof args.content === 'string') updates.content = args.content.trim();
      if (typeof args.description === 'string') updates.description = args.description;
      if (['high', 'medium', 'low'].includes(args.priority)) updates.priority = args.priority;
      if (typeof args.category === 'string') {
        const catName = args.category.trim();
        if (catName && !ctx.todoCategories.includes(catName)) {
          return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.todoCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "todo"）创建新分类后再试。` };
        }
        updates.category = catName;
      }
      const schedule = resolveTodoSchedulePayload(args);
      if (schedule.error) {
        return { success: false, error: schedule.error };
      }
      Object.assign(updates, schedule.updates);
      if (typeof args.isCompleted === 'boolean') {
        updates.isCompleted = args.isCompleted;
        if (args.isCompleted) updates.completedAt = Date.now();
      }
      ctx.onUpdateTodo(args.id, updates);
      return { success: true, message: `待办「${todo.content}」已更新`, updated: updates };
    },
  },
  {
    name: 'delete_todo',
    module: 'todo',
    tool: {
      name: 'delete_todo',
      description: '删除一条待办事项。优先用 id 删除；若没有 id，可传 content 做精确匹配。若重名项超过一条，工具会要求先 query_todos 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办的 id' },
          content: { type: 'string', description: '待办标题。仅在没有 id 时使用，会先精确匹配。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办删除未授权。请在权限面板中开启「待办事项」写入权限。' };
      const match = resolveTodoMatch(ctx.todos, args);
      if (!match.todo) return { success: false, error: match.error || '未找到待办事项。' };
      ctx.onDeleteTodo(match.todo.id, { skipConfirm: true });
      return { success: true, message: `待办「${match.todo.content}」已删除` };
    },
  },
  // ─── 子任务工具 ───
  {
    name: 'query_subtasks',
    module: 'todo',
    tool: {
      name: 'query_subtasks',
      description: '查询某条待办事项的所有子任务。需要先 query_todos 获取待办 id。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
        },
        required: ['todoId'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.read) return { success: false, error: '待办查询未授权。请开启「待办事项」读取权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const subtasks = todo.subtasks || [];
      return {
        success: true,
        todoId: todo.id,
        todoContent: todo.content,
        total: subtasks.length,
        completed: subtasks.filter(s => s.isCompleted).length,
        subtasks: subtasks.map(s => ({ id: s.id, content: s.content, isCompleted: s.isCompleted })),
      };
    },
  },
  {
    name: 'create_subtask',
    module: 'todo',
    tool: {
      name: 'create_subtask',
      description: '为某条待办事项添加一个或多个子任务。需要同时创建多个子任务时，请将所有内容一次性放入 contents 数组，而不是多次调用此工具（多次调用会因状态竞争导致只保留最后一个）。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
          contents: { type: 'array', items: { type: 'string' }, description: '子任务内容列表，支持一次传入多个，如 ["阅读", "写作"]' },
        },
        required: ['todoId', 'contents'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const rawList: string[] = Array.isArray(args.contents)
        ? args.contents.map((c: unknown) => String(c).trim()).filter(Boolean)
        : (typeof args.contents === 'string' ? [String(args.contents).trim()] : []);
      if (rawList.length === 0) return { success: false, error: 'contents 不能为空。' };
      const newSubtasks: SubTask[] = rawList.map(content => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        content,
        isCompleted: false,
      }));
      const subtasks = [...(todo.subtasks || []), ...newSubtasks];
      ctx.onUpdateTodo(args.todoId, { subtasks });
      const names = newSubtasks.map(s => `「${s.content}」`).join('、');
      return { success: true, message: `已为「${todo.content}」添加 ${newSubtasks.length} 个子任务：${names}`, subtasks: newSubtasks };
    },
  },
  {
    name: 'update_subtask',
    module: 'todo',
    tool: {
      name: 'update_subtask',
      description: '修改某条待办事项的子任务（内容或完成状态）。需要先 query_subtasks 获取子任务 id。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
          subtaskId: { type: 'string', description: '子任务的 id' },
          content: { type: 'string', description: '新的子任务内容（可选）' },
          isCompleted: { type: 'boolean', description: '是否已完成（可选）' },
        },
        required: ['todoId', 'subtaskId'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const subtasks = [...(todo.subtasks || [])];
      const idx = subtasks.findIndex(s => s.id === args.subtaskId);
      if (idx === -1) return { success: false, error: `未找到 id 为「${args.subtaskId}」的子任务。` };
      if (typeof args.content === 'string') subtasks[idx] = { ...subtasks[idx], content: args.content.trim() };
      if (typeof args.isCompleted === 'boolean') subtasks[idx] = { ...subtasks[idx], isCompleted: args.isCompleted };
      ctx.onUpdateTodo(args.todoId, { subtasks });
      return { success: true, message: `子任务「${subtasks[idx].content}」已更新`, subtask: subtasks[idx] };
    },
  },
  {
    name: 'delete_subtask',
    module: 'todo',
    tool: {
      name: 'delete_subtask',
      description: '删除某条待办事项的子任务。需要先 query_subtasks 获取子任务 id。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
          subtaskId: { type: 'string', description: '子任务的 id' },
        },
        required: ['todoId', 'subtaskId'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const subtask = (todo.subtasks || []).find(s => s.id === args.subtaskId);
      if (!subtask) return { success: false, error: `未找到 id 为「${args.subtaskId}」的子任务。` };
      const subtasks = (todo.subtasks || []).filter(s => s.id !== args.subtaskId);
      ctx.onUpdateTodo(args.todoId, { subtasks });
      return { success: true, message: `子任务「${subtask.content}」已删除` };
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
  {
    name: 'update_resource',
    module: 'dc-resources',
    tool: {
      name: 'update_resource',
      description: '修改一条已有的资源记录。需要先 query_resources 获取资源名称，再通过名称匹配修改。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要修改的资源名称（精确匹配）' },
          newName: { type: 'string', description: '新名称（可选）' },
          expireDate: { type: 'string', description: '新的到期日期 YYYY-MM-DD（可选）' },
          capacityUsed: { type: 'number', description: '新的已用容量（可选）' },
          capacityTotal: { type: 'number', description: '新的总容量（可选）' },
          costAmount: { type: 'number', description: '新的费用金额（可选）' },
          note: { type: 'string', description: '新的备注（可选）' },
          autoRenewal: { type: 'boolean', description: '是否自动续费（可选）' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.resources.write) return { success: false, error: '资源修改未授权。请在权限面板中开启「资源中心」写入权限。' };
      const item = ctx.resourceData.items.find(i => i.name === args.name);
      if (!item) return { success: false, error: `未找到名为「${args.name}」的资源。` };
      const updates: Partial<ResourceItem> = {};
      if (typeof args.newName === 'string') updates.name = args.newName.trim();
      if (typeof args.expireDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.expireDate)) updates.expireDate = args.expireDate;
      if (typeof args.note === 'string') updates.note = args.note;
      if (typeof args.autoRenewal === 'boolean') updates.autoRenewal = args.autoRenewal;
      if (item.capacity && (args.capacityUsed !== undefined || args.capacityTotal !== undefined)) {
        updates.capacity = {
          used: typeof args.capacityUsed === 'number' ? args.capacityUsed : item.capacity.used,
          total: typeof args.capacityTotal === 'number' ? args.capacityTotal : item.capacity.total,
          unit: item.capacity.unit,
        };
      }
      if (item.cost && typeof args.costAmount === 'number') {
        updates.cost = { ...item.cost, amount: args.costAmount };
      }
      ctx.onUpdateResource(item.id, updates);
      return { success: true, message: `资源「${item.name}」已更新`, updated: updates };
    },
  },
  {
    name: 'delete_resource',
    module: 'dc-resources',
    tool: {
      name: 'delete_resource',
      description: '删除一条资源记录。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要删除的资源名称（精确匹配）' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.resources.write) return { success: false, error: '资源删除未授权。请在权限面板中开启「资源中心」写入权限。' };
      const item = ctx.resourceData.items.find(i => i.name === args.name);
      if (!item) return { success: false, error: `未找到名为「${args.name}」的资源。` };
      ctx.onDeleteResource(item.id);
      return { success: true, message: `资源「${item.name}」已删除` };
    },
  },
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
  // ─── 图床工具 ───
  {
    name: 'query_images',
    module: 'image',
    tool: {
      name: 'query_images',
      description: '查询图床中已有的图片。可按名称或分类搜索，返回图片的 URL 和 Markdown 链接。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，匹配图片文件名或显示名称（可选，不传则返回全部）' },
          category: { type: 'string', description: '按分类筛选（可选）' },
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
        required: [],
      },
    },
    execute: async (args) => {
      let records: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
      if (typeof args.category === 'string' && args.category.trim()) {
        const cat = args.category.trim();
        records = records.filter((r: any) => r.category === cat || (!r.category && cat === '未分类'));
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        records = records.filter((r: any) =>
          (r.filename || '').toLowerCase().includes(kw) || (r.name || '').toLowerCase().includes(kw)
        );
      }
      records.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 20;
      const sliced = records.slice(0, limit);
      // 收集所有可用分类
      const allRecords: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
      const categories = [...new Set(allRecords.map((r: any) => r.category || '未分类'))];
      return {
        success: true,
        total: records.length,
        returned: sliced.length,
        categories,
        images: sliced.map((r: any) => ({
          name: r.name || r.filename,
          filename: r.filename,
          url: r.url,
          markdown: `![${r.name || r.filename}](${r.url})`,
          category: r.category || '未分类',
          createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') : null,
        })),
      };
    },
  },
  {
    name: 'upload_image',
    module: 'image',
    tool: {
      name: 'upload_image',
      description: '将用户发送的图片附件上传到图床（Gitee 仓库），并返回访问链接。用户必须在消息中附带图片。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '图片显示名称（可选，不传则使用文件名）' },
          category: { type: 'string', description: '图床分类名称（可选，默认"未分类"）' },
          attachmentIndex: { type: 'number', description: '上传第几个图片附件（从 0 开始，默认 0 即第一个图片）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      // 1. 获取图床配置
      const configStr = localStorage.getItem('linkmaster_image_config_v1');
      if (!configStr) return { success: false, error: '图床未配置。请在「图床管理」中设置 Gitee 配置。' };
      let imgConfig: any;
      try { imgConfig = JSON.parse(configStr); } catch { return { success: false, error: '图床配置格式错误。' }; }
      if (!imgConfig.accessToken || !imgConfig.owner || !imgConfig.repo) return { success: false, error: '图床配置不完整（缺少 accessToken / owner / repo）。' };

      // 2. 获取用户附件中的图片
      const attachments = ctx.lastUserAttachments || [];
      const imageAttachments = attachments.filter(a => a.type === 'image' && a.base64);
      if (imageAttachments.length === 0) return { success: false, error: '未找到图片附件。请在消息中附带图片后再调用此工具。' };
      const idx = typeof args.attachmentIndex === 'number' ? args.attachmentIndex : 0;
      if (idx < 0 || idx >= imageAttachments.length) return { success: false, error: `图片索引 ${idx} 超出范围，当前共 ${imageAttachments.length} 个图片附件。` };
      const attachment = imageAttachments[idx];

      // 3. 生成唯一文件名并上传
      const ext = (attachment.name || 'image.png').split('.').pop()?.toLowerCase() || 'png';
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).slice(2, 9);
      const filename = `${timestamp}_${randomStr}.${ext}`;
      const uploadPath = imgConfig.path ? `${imgConfig.path}/${filename}` : filename;

      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.uploadImage) return { success: false, error: '上传功能不可用（非桌面端）。' };

      const result = await electronAPI.uploadImage({
        accessToken: imgConfig.accessToken,
        owner: imgConfig.owner,
        repo: imgConfig.repo,
        path: uploadPath,
        content: attachment.base64,
        message: `Upload ${filename} via Agent`,
      });

      if (!result || !result.content) return { success: false, error: `上传失败：${result?.message || '未知错误'}` };

      // 4. 创建图片记录并保存
      const displayName = (typeof args.name === 'string' && args.name.trim()) ? args.name.trim() : (attachment.name || filename);
      const category = (typeof args.category === 'string' && args.category.trim()) ? args.category.trim() : '未分类';
      const newRecord = {
        id: timestamp.toString(),
        filename,
        name: displayName,
        url: result.content.download_url,
        sha: result.content.sha,
        path: result.content.path,
        category,
        createdAt: Date.now(),
      };
      // 保存到 localStorage 并触发事件通知 App
      const existing: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
      existing.unshift(newRecord);
      localStorage.setItem('linkmaster_image_records_v1', JSON.stringify(existing));
      // 通过自定义事件通知 App 更新状态
      window.dispatchEvent(new CustomEvent('guyue:image-record-added', { detail: newRecord }));

      return {
        success: true,
        message: `图片已上传至图床：${displayName}`,
        url: result.content.download_url,
        markdown: `![${displayName}](${result.content.download_url})`,
        name: displayName,
        category,
      };
    },
  },
  // ─── 通讯录查询工具 ───
  {
    name: 'query_contacts',
    module: 'email',
    tool: {
      name: 'query_contacts',
      description: '查询通讯录联系人，可按关键词搜索简称、邮箱或备注。用户提到联系人名字时，先用此工具查找对应的邮箱地址。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，匹配简称、邮箱或备注' },
        },
        required: [],
      },
    },
    execute: async (args) => {
      const contacts = loadContacts();
      if (contacts.length === 0) return { success: true, total: 0, contacts: [], hint: '通讯录为空，请让用户在邮件设置面板中添加联系人。' };
      const kw = (typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '');
      const matched = kw ? contacts.filter(c =>
        c.nickname.toLowerCase().includes(kw) || c.email.toLowerCase().includes(kw) || c.note.toLowerCase().includes(kw)
      ) : contacts;
      return {
        success: true,
        total: matched.length,
        contacts: matched.map(c => ({ id: c.id, nickname: c.nickname, email: c.email, note: c.note || null })),
      };
    },
  },
  // ─── 邮件发送工具（二次确认） ───
  {
    name: 'send_email',
    module: 'email',
    tool: {
      name: 'send_email',
      description: '发送一封邮件。调用后不会立即发送，系统将生成一张确认卡片展示给用户，用户手动确认后才真正发出。你只需提供主题、正文和收件人即可。',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: '邮件主题' },
          content: { type: 'string', description: '邮件正文，支持 HTML 标签（如 <h1>、<p>、<ul> 等）' },
          recipient: { type: 'string', description: '收件人邮箱地址（可选，不传则使用系统设置中的默认收件人）' },
        },
        required: ['subject', 'content'],
      },
    },
    execute: async (args) => {
      const configStr = localStorage.getItem('linkmaster_email_config');
      if (!configStr) return { success: false, error: '邮箱未配置。请在「Agent 设置 → 邮件」中完成 SMTP 设置。' };
      let config: EmailConfig;
      try { config = JSON.parse(configStr); } catch { return { success: false, error: '邮箱配置格式错误，请重新设置。' }; }
      if (!config.smtp?.host || !config.smtp?.user || !config.smtp?.pass) return { success: false, error: '邮箱 SMTP 配置不完整，请检查设置。' };

      const recipient = (typeof args.recipient === 'string' && args.recipient.trim()) ? args.recipient.trim() : config.recipient;
      if (!recipient) return { success: false, error: '收件人地址为空，请指定收件人或在设置中配置默认收件人。' };

      // 查找通讯录匹配的简称（用于显示）
      const contacts = loadContacts();
      const contactMatch = contacts.find(c => c.email === recipient);
      const displayName = contactMatch ? `${contactMatch.nickname} <${recipient}>` : recipient;

      // 不立即发送，返回待确认状态
      const confirmationId = crypto.randomUUID();
      return {
        success: true,
        pendingConfirmation: true,
        confirmationId,
        confirmationType: 'send_email',
        recipient,
        recipientDisplay: displayName,
        subject: String(args.subject || '').trim(),
        contentPreview: String(args.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
        fullContent: String(args.content || ''),
        message: `邮件已准备好，等待用户确认发送。收件人：${displayName}，主题：${args.subject}`,
      };
    },
  },
  // ─── 重复事件工具 ───
  {
    name: 'query_recurring_events',
    module: 'todo',
    tool: {
      name: 'query_recurring_events',
      description: '查询所有重复事件（循环日程），返回标题、分类及其唯一 ID、重复规则、时间等信息。创建重复事件前必须先调用此工具获取分类 ID。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 availableCategories[].id 获取）。不传返回全部。' },
          onlyActive: { type: 'boolean', description: '是否只返回已激活的事件，默认 true' },
          limit: { type: 'number', description: '最多返回条数，默认 30' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.read) return { success: false, error: '重复事件查询未授权。请在权限面板中开启「待办事项」读取权限。' };
      let items = ctx.recurringEvents;
      const onlyActive = args.onlyActive !== false;
      if (onlyActive) items = items.filter(e => e.isActive);
      if (typeof args.categoryId === 'string' && args.categoryId.trim()) {
        const catId = args.categoryId.trim();
        const matchedCat = ctx.recurringCategories.find(c => c.id === catId);
        if (matchedCat) items = items.filter(e => e.category === matchedCat.name);
      }
      const limit = Math.min(Number(args.limit) || 30, 50);
      const WEEKDAY = ['日','一','二','三','四','五','六'];
      const result = items.slice(0, limit).map(e => {
        let recurrenceDesc = '';
        if (e.interval === 1) {
          recurrenceDesc = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[e.recurrence] || e.recurrence;
        } else {
          const unit = { daily: '天', weekly: '周', monthly: '月', yearly: '年' }[e.recurrence] || e.recurrence;
          recurrenceDesc = `每 ${e.interval} ${unit}`;
        }
        if (e.recurrence === 'weekly' && e.weekDays?.length) {
          recurrenceDesc += `（${e.weekDays.sort((a,b)=>a-b).map(d=>'周'+WEEKDAY[d]).join('、')}）`;
        }
        const timeDesc = e.allDay ? '全天' : (() => {
          const h = Math.floor((e.startTime??0)/60), m = (e.startTime??0)%60;
          const dur = e.duration ?? 60;
          const eh = Math.floor(((e.startTime??0)+dur)/60) % 24, em = ((e.startTime??0)+dur) % 60;
          return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} – ${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
        })();
        return {
          id: e.id,
          title: e.title,
          category: e.category,
          recurrence: recurrenceDesc,
          time: timeDesc,
          startDate: new Date(e.startDate).toLocaleDateString('zh-CN'),
          endDate: e.endDate ? new Date(e.endDate).toLocaleDateString('zh-CN') : null,
          isActive: e.isActive,
          description: e.description || null,
        };
      });
      const availableCats = ctx.recurringCategories.map(c => ({ id: c.id, name: c.name }));
      return { success: true, total: items.length, returned: result.length, availableCategories: availableCats, recurringEvents: result };
    },
  },
  {
    name: 'create_recurring_event',
    module: 'todo',
    tool: {
      name: 'create_recurring_event',
      description: '创建一个重复事件（循环日程）。调用前必须先 query_recurring_events 获取分类列表及其 ID，用 categoryId 指定分类。若已有分类均不合适，请先调用 create_recurring_category 创建新分类。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '事件标题，如"高数课"、"周例会"' },
          description: { type: 'string', description: '备注描述（可选）' },
          categoryId: { type: 'string', description: '分类的唯一 ID（从 query_recurring_events 返回的 availableCategories[].id 获取）。' },
          recurrence: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'], description: '重复类型：daily=每天，weekly=每周，monthly=每月，yearly=每年' },
          interval: { type: 'number', description: '重复间隔，如 interval=2 配合 weekly 表示每两周。默认 1。' },
          weekDays: { type: 'array', items: { type: 'number', minimum: 0, maximum: 6 }, description: '每周重复时指定星期几（0=周日，1=周一…6=周六）。仅在 recurrence="weekly" 时生效。' },
          startDate: { type: 'string', description: '重复开始日期，格式 YYYY-MM-DD，默认今天' },
          endDate: { type: 'string', description: '重复结束日期，格式 YYYY-MM-DD（可选，不传表示永久）' },
          allDay: { type: 'boolean', description: '是否为全天事件。默认 false。' },
          startTime: { type: 'string', description: '开始时间，格式 HH:mm，如 "09:00"。allDay=false 时有效。' },
          duration: { type: 'number', description: '时长（分钟），如 90 表示 1.5 小时。allDay=false 时有效，默认 60。' },
          color: { type: 'string', description: '事件颜色 hex 值，如 "#3b82f6"（蓝）、"#8b5cf6"（紫）、"#22c55e"（绿）、"#ef4444"（红）、"#f97316"（橙）（可选）' },
        },
        required: ['title', 'recurrence'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件创建未授权。请在权限面板中开启「待办事项」写入权限。' };
      const title = (typeof args.title === 'string' ? args.title.trim() : '') || '新重复事件';
      const recurrence = (['daily','weekly','monthly','yearly'].includes(args.recurrence) ? args.recurrence : 'weekly') as RecurringEvent['recurrence'];
      const interval = Math.max(Number(args.interval) || 1, 1);

      // 日期解析
      const parseDate = (s: string | undefined) => {
        if (!s) return undefined;
        const ts = new Date(s + 'T00:00:00').getTime();
        return isNaN(ts) ? undefined : ts;
      };
      const startDate = parseDate(args.startDate) ?? Date.now();
      const endDate = parseDate(args.endDate);

      // 时间解析
      const allDay = args.allDay === true;
      let startTimeMin: number | undefined;
      let duration: number | undefined;
      if (!allDay && typeof args.startTime === 'string') {
        const [h, m] = args.startTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) startTimeMin = h * 60 + m;
        duration = Math.max(Number(args.duration) || 60, 15);
      }

      // 分类匹配：通过 ID 精确查找
      const catId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
      const matchedCat = catId ? ctx.recurringCategories.find(c => c.id === catId) : null;
      if (catId && !matchedCat) {
        const available = ctx.recurringCategories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
        return { success: false, error: `分类 ID「${catId}」不存在。当前可用分类：${available}。请先调用 query_recurring_events 获取正确的分类 ID。` };
      }
      const categoryValue = matchedCat?.name || '未分类';

      const weekDays = recurrence === 'weekly' && Array.isArray(args.weekDays) && args.weekDays.length > 0
        ? args.weekDays.filter((d: number) => d >= 0 && d <= 6)
        : undefined;

      const eventData: Partial<RecurringEvent> = {
        title,
        description: typeof args.description === 'string' ? args.description.trim() || undefined : undefined,
        category: categoryValue,
        recurrence,
        interval,
        weekDays,
        startDate,
        endDate,
        allDay,
        startTime: startTimeMin,
        duration,
        color: typeof args.color === 'string' ? args.color : undefined,
      };
      ctx.onCreateRecurring(eventData);
      return { success: true, message: `重复事件「${title}」已创建（${recurrence}，分类：${categoryValue}）`, event: eventData };
    },
  },
  {
    name: 'update_recurring_event',
    module: 'todo',
    tool: {
      name: 'update_recurring_event',
      description: '修改一个已有的重复事件。可通过 id 或 eventTitle（事件当前标题）定位，两者提供其一即可；都知道时优先传 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '重复事件的 id（从 query_recurring_events 获取，与 eventTitle 二选一）' },
          eventTitle: { type: 'string', description: '要修改的事件当前标题（精确匹配，与 id 二选一）' },
          title: { type: 'string', description: '新标题（可选）' },
          description: { type: 'string', description: '新描述（可选）' },
          categoryId: { type: 'string', description: '新分类的唯一 ID（从 query_recurring_events 返回的 availableCategories[].id 获取，可选）' },
          isActive: { type: 'boolean', description: '是否激活（可选）' },
          endDate: { type: 'string', description: '新的结束日期 YYYY-MM-DD（可选）' },
          weekDays: { type: 'array', items: { type: 'number' }, description: '新的每周星期几（仅 weekly，可选）' },
          startTime: { type: 'string', description: '新的开始时间 HH:mm（可选）' },
          duration: { type: 'number', description: '新的时长分钟（可选）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件修改未授权。请在权限面板中开启「待办事项」写入权限。' };
      const event = args.id
        ? ctx.recurringEvents.find(e => e.id === args.id)
        : ctx.recurringEvents.find(e => e.title === args.eventTitle);
      if (!event) {
        if (args.id) return { success: false, error: `未找到 id 为「${args.id}」的重复事件。` };
        const titles = ctx.recurringEvents.map(e => e.title).join('、') || '（暂无）';
        return { success: false, error: `未找到标题为「${args.eventTitle}」的重复事件。当前所有事件：${titles}` };
      }
      const updates: Partial<RecurringEvent> = {};
      if (typeof args.title === 'string') updates.title = args.title.trim();
      if (typeof args.description === 'string') updates.description = args.description.trim() || undefined;
      if (typeof args.isActive === 'boolean') updates.isActive = args.isActive;
      if (typeof args.categoryId === 'string') {
        const matched = ctx.recurringCategories.find(c => c.id === args.categoryId.trim());
        if (!matched) {
          const available = ctx.recurringCategories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。` };
        }
        updates.category = matched.name;
      }
      if (typeof args.endDate === 'string') {
        const ts = new Date(args.endDate + 'T23:59:59').getTime();
        if (!isNaN(ts)) updates.endDate = ts;
      }
      if (Array.isArray(args.weekDays)) updates.weekDays = args.weekDays.filter((d:number) => d>=0 && d<=6);
      if (typeof args.startTime === 'string') {
        const [h, m] = args.startTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) updates.startTime = h * 60 + m;
      }
      if (typeof args.duration === 'number') updates.duration = Math.max(args.duration, 15);
      ctx.onUpdateRecurring(event.id, updates);
      return { success: true, message: `重复事件「${event.title}」已更新`, updated: updates };
    },
  },
  {
    name: 'delete_recurring_event',
    module: 'todo',
    tool: {
      name: 'delete_recurring_event',
      description: '删除一个重复事件。可通过 id 或 eventTitle（事件当前标题）定位，两者提供其一即可。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '重复事件的 id（与 eventTitle 二选一）' },
          eventTitle: { type: 'string', description: '要删除的事件标题（精确匹配，与 id 二选一）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件删除未授权。请在权限面板中开启「待办事项」写入权限。' };
      const event = args.id
        ? ctx.recurringEvents.find(e => e.id === args.id)
        : ctx.recurringEvents.find(e => e.title === args.eventTitle);
      if (!event) {
        if (args.id) return { success: false, error: `未找到 id 为「${args.id}」的重复事件。` };
        const titles = ctx.recurringEvents.map(e => e.title).join('、') || '（暂无）';
        return { success: false, error: `未找到标题为「${args.eventTitle}」的重复事件。当前所有事件：${titles}` };
      }
      ctx.onDeleteRecurring(event.id);
      return { success: true, message: `重复事件「${event.title}」已删除` };
    },
  },
  {
    name: 'create_recurring_category',
    module: 'todo',
    tool: {
      name: 'create_recurring_category',
      description: '创建一个新的重复事件分类。当已有分类（课程、工作、健身、生活等）都不适合时，先调用此工具创建新分类，再调用 create_recurring_event 使用该分类名称。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '分类名称，如"学习"、"医疗"、"社交"' },
          color: { type: 'string', description: '分类颜色 hex 值，如 "#3b82f6"（蓝）、"#8b5cf6"（紫）、"#22c55e"（绿）、"#ef4444"（红）、"#f97316"（橙）、"#ec4899"（粉）。不传则自动分配。' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件分类创建未授权。请在权限面板中开启「待办事项」写入权限。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      if (ctx.recurringCategories.find(c => c.name === name)) {
        return { success: false, error: `分类「${name}」已存在，无需重复创建。` };
      }
      const PRESET_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#ef4444','#14b8a6','#f59e0b'];
      const usedColors = new Set(ctx.recurringCategories.map(c => c.color));
      const color = (typeof args.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.color.trim()))
        ? args.color.trim()
        : (PRESET_COLORS.find(c => !usedColors.has(c)) ?? PRESET_COLORS[ctx.recurringCategories.length % PRESET_COLORS.length]);
      const newCat = { id: `rc-${Date.now()}`, name, color };
      ctx.onUpdateRecurringCategories([...ctx.recurringCategories, newCat]);
      const allNames = [...ctx.recurringCategories.map(c => c.name), name].join('、');
      return { success: true, message: `分类「${name}」已创建（颜色：${color}）。现有全部分类：${allNames}`, category: newCat };
    },
  },
  {
    name: 'create_category',
    module: 'todo',
    tool: {
      name: 'create_category',
      description: '为待办事项（todo）、技能卡（prompts）或 Markdown 笔记（markdown）创建新分类。当 create_todo / create_prompt / create_markdown_note 校验失败提示分类不存在时，先调用此工具创建新分类，再重试。',
      inputSchema: {
        type: 'object',
        properties: {
          module: { type: 'string', enum: ['todo', 'prompts', 'markdown'], description: '要添加分类的模块：todo=待办事项，prompts=技能卡，markdown=Markdown 笔记' },
          name: { type: 'string', description: '分类名称，如"学习"、"生活"、"项目"' },
        },
        required: ['module', 'name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '分类创建未授权。请在权限面板中开启「待办事项」写入权限。' };
      const moduleKey = args.module as string;
      if (!['todo', 'prompts', 'markdown'].includes(moduleKey)) return { success: false, error: 'module 参数必须是 todo、prompts 或 markdown 之一。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      const currentList = moduleKey === 'todo' ? ctx.todoCategories : moduleKey === 'prompts' ? ctx.promptCategories : ctx.markdownCategories;
      if (currentList.includes(name)) {
        return { success: false, error: `分类「${name}」在「${moduleKey}」中已存在，无需重复创建。` };
      }
      ctx.onAddCategory(moduleKey, name);
      const allNames = [...currentList, name].join('、');
      return { success: true, message: `分类「${name}」已添加到「${moduleKey}」。现有全部分类：${allNames}` };
    },
  },
  // ─── 知识库工具 ───
  {
    name: 'search_knowledge_base',
    module: 'knowledge',
    tool: {
      name: 'search_knowledge_base',
      description: '在用户的本地知识库文件中进行语义搜索，返回最相关的内容片段及来源文件名。回答与用户文件相关的问题时，请优先调用此工具。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索问题或关键词，使用自然语言描述你要查找的内容' },
          topK: { type: 'number', description: '返回最相关片段数量，默认 5，最多 10' },
        },
        required: ['query'],
      },
    },
    execute: async (args, ctx) => {
      const { apiKey: embeddingApiKey, baseUrl: embeddingBaseUrl } = getEmbeddingKeyFromProfiles();
      if (!embeddingApiKey) {
        return { success: false, error: '未配置知识库 Embedding API Key。请在全局设置中添加 API 配置，或在 Agent 右侧栏点击知识库图标并配置 Gemini API Key。' };
      }
      const kbFileIds = ctx.knowledgeBaseFileIds;
      if (kbFileIds.size === 0) {
        return { success: false, error: '知识库中没有文件。请先在文件管理模块中悬停文件、点击绿色脑图标将文件加入知识库。' };
      }
      const kbFiles = ctx.fileRecords.filter(f => kbFileIds.has(f.id));
      if (kbFiles.length === 0) {
        return { success: false, error: '知识库文件已不存在，请重新添加。' };
      }
      try {
        let index = await loadRagIndex();
        const progressLogs: string[] = [];
        index = await buildIndex(kbFiles, index, embeddingApiKey, msg => progressLogs.push(msg), embeddingBaseUrl);
        await saveRagIndex(index);
        const topK = Math.min(Math.max(typeof args.topK === 'number' ? args.topK : 5, 1), 10);
        const results = await searchIndex(args.query as string, index, embeddingApiKey, topK, embeddingBaseUrl);
        if (results.length === 0) {
          return { success: true, results: [], message: '知识库中未找到与该问题相关的内容。', indexLog: progressLogs };
        }
        const formatted = results.map(r => ({
          source: r.fileName,
          relevance: Math.round(r.score * 100) / 100,
          content: r.text,
        }));
        return {
          success: true,
          results: formatted,
          message: `找到 ${results.length} 条相关内容，请基于以下内容回答，并在回答末尾注明"来源：文件名"。`,
          indexLog: progressLogs.length > 0 ? progressLogs : undefined,
        };
      } catch (e) {
        return { success: false, error: `知识库检索失败：${(e as Error).message}` };
      }
    },
  },
  {
    name: 'build_knowledge_base',
    module: 'knowledge',
    tool: {
      name: 'build_knowledge_base',
      description: '对知识库中所有文件建立或更新向量索引。首次使用或文件更新后调用，完成后 search_knowledge_base 才能检索到最新内容。',
      inputSchema: {
        type: 'object',
        properties: {
          forceRebuild: { type: 'boolean', description: '是否强制重建所有文件的索引（默认 false，仅索引新文件）' },
        },
      },
    },
    execute: async (args, ctx) => {
      const { apiKey: embeddingApiKey, baseUrl: embeddingBaseUrl } = getEmbeddingKeyFromProfiles();
      if (!embeddingApiKey) {
        return { success: false, error: '未配置知识库 Embedding API Key。请在全局设置中添加 API 配置。' };
      }
      const kbFileIds = ctx.knowledgeBaseFileIds;
      if (kbFileIds.size === 0) {
        return { success: false, error: '知识库中没有文件，请先在文件管理模块添加文件。' };
      }
      const kbFiles = ctx.fileRecords.filter(f => kbFileIds.has(f.id));
      try {
        const existingIndex = args.forceRebuild ? [] : await loadRagIndex();
        const progressLogs: string[] = [];
        const newIndex = await buildIndex(kbFiles, existingIndex as any[], embeddingApiKey, msg => progressLogs.push(msg), embeddingBaseUrl);
        await saveRagIndex(newIndex);
        const chunkCount = newIndex.filter((c: any) => kbFileIds.has(c.fileId)).length;
        return {
          success: true,
          message: `✅ 知识库索引构建完成！共 ${kbFiles.length} 个文件，${chunkCount} 个文本块。`,
          details: progressLogs,
        };
      } catch (e) {
        return { success: false, error: `索引构建失败：${(e as Error).message}` };
      }
    },
  },
  // ─── LaTeX 模块工具 ───────────────────────────────────────────────────────────
  {
    name: 'query_latex_file_categories',
    module: 'latex',
    tool: {
      name: 'query_latex_file_categories',
      description: '查询 LaTeX 文件分类列表（含唯一 ID）。操作文件前必须先调用此工具获取分类 ID。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    execute: async (_args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetFileCategories) return { success: false, error: 'LaTeX API 不可用。' };
      const categories = await electronAPI.latexGetFileCategories();
      return { success: true, categories, hint: '使用 categoryId 参数操作文件。如需新分类，调用 create_latex_file_category。' };
    },
  },
  {
    name: 'create_latex_file_category',
    module: 'latex',
    tool: {
      name: 'create_latex_file_category',
      description: '创建新的 LaTeX 文件分类。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '分类名称' },
        },
        required: ['name'],
      },
    },
    execute: async (args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetFileCategories) return { success: false, error: 'LaTeX API 不可用。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      const existing: any[] = await electronAPI.latexGetFileCategories();
      if (existing.some((c: any) => c.name === name)) {
        return { success: false, error: `分类「${name}」已存在。`, existingCategory: existing.find((c: any) => c.name === name) };
      }
      const newCat = { id: crypto.randomUUID(), name };
      const updated = [...existing, newCat];
      await electronAPI.latexSaveFileCategories(updated);
      // Auto-authorize the new category
      _ctx.onAutoAuthLatexFileCategory(newCat.id);
      return { success: true, message: `文件分类「${name}」已创建并已自动授权。`, category: newCat };
    },
  },
  {
    name: 'query_latex_files',
    module: 'latex',
    tool: {
      name: 'query_latex_files',
      description: '查询 LaTeX 托管文件列表。可按分类 ID 筛选、按文件名搜索。需要对应分类的权限。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（可选）' },
          keyword: { type: 'string', description: '按文件名搜索（可选）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (ctx.latexFileReadPermissions.length === 0) return { success: false, error: 'LaTeX 读取未授权。请在 Agent 权限中心开启「LaTeX」读取权限。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexListFiles) return { success: false, error: 'LaTeX API 不可用。' };
      let files: any[] = await electronAPI.latexListFiles();
      // Filter by read permission
      files = files.filter(f => {
        const cat = f.category || '__uncategorized__';
        return ctx.latexFileReadPermissions.includes(cat) || ctx.latexFileReadPermissions.includes('__all__');
      });
      if (typeof args.categoryId === 'string' && args.categoryId.trim()) {
        const catId = args.categoryId.trim();
        if (!ctx.latexFileReadPermissions.includes(catId) && !ctx.latexFileReadPermissions.includes('__all__')) {
          return { success: false, error: `分类「${catId}」未授权读取。请在 Agent 权限中心开启「LaTeX」读取权限。` };
        }
        files = files.filter(f => (f.category || '__uncategorized__') === catId);
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        files = files.filter(f => f.name.toLowerCase().includes(kw));
      }
      const result = files.map((f: any) => {
        const fCat = f.category || '__uncategorized__';
        const writable = ctx.latexFileWritePermissions.includes(fCat) || ctx.latexFileWritePermissions.includes('__all__');
        return { name: f.name, path: f.path, size: f.size, modifiedAt: f.modifiedAt, category: f.category || null, writable };
      });
      return { success: true, total: result.length, files: result, readableCategories: ctx.latexFileReadPermissions, writableCategories: ctx.latexFileWritePermissions };
    },
  },
  {
    name: 'read_latex_file',
    module: 'latex',
    tool: {
      name: 'read_latex_file',
      description: '读取一个 LaTeX 托管文件的内容。通过文件路径定位。',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件的完整路径（从 query_latex_files 结果中获取）' },
        },
        required: ['filePath'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexOpenManagedFile) return { success: false, error: 'LaTeX API 不可用。' };
      // Check read permission by looking up the file's category
      const files: any[] = await electronAPI.latexListFiles();
      const file = files.find((f: any) => f.path === args.filePath);
      if (!file) return { success: false, error: `未找到文件「${args.filePath}」。` };
      const cat = file.category || '__uncategorized__';
      if (!ctx.latexFileReadPermissions.includes(cat) && !ctx.latexFileReadPermissions.includes('__all__')) {
        return { success: false, error: `LaTeX 文件读取未授权。请在 Agent 权限中心开启「LaTeX」读取权限。` };
      }
      const result = await electronAPI.latexOpenManagedFile(args.filePath);
      if (!result) return { success: false, error: '文件读取失败。' };
      const writable = ctx.latexFileWritePermissions.includes(cat) || ctx.latexFileWritePermissions.includes('__all__');
      return { success: true, name: file.name, path: result.path, content: result.content, length: result.content.length, writable };
    },
  },
  {
    name: 'edit_latex_file',
    module: 'latex',
    tool: {
      name: 'edit_latex_file',
      description: '修改一个 LaTeX 托管文件的内容。需要提供完整的新文件内容。',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件路径（从 query_latex_files 获取）' },
          content: { type: 'string', description: '新的完整文件内容' },
        },
        required: ['filePath', 'content'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveManagedFile) return { success: false, error: 'LaTeX API 不可用。' };
      const files: any[] = await electronAPI.latexListFiles();
      const file = files.find((f: any) => f.path === args.filePath);
      if (!file) return { success: false, error: `未找到文件「${args.filePath}」。` };
      const cat = file.category || '__uncategorized__';
      if (!ctx.latexFileWritePermissions.includes(cat) && !ctx.latexFileWritePermissions.includes('__all__')) {
        return { success: false, error: 'LaTeX 文件编辑未授权。请在 Agent 权限中心开启「LaTeX」修改权限。' };
      }
      const ok = await electronAPI.latexSaveManagedFile({ filePath: args.filePath, content: args.content });
      if (!ok) return { success: false, error: '文件保存失败。' };
      return { success: true, message: `文件「${file.name}」已更新。`, length: args.content.length };
    },
  },
  {
    name: 'query_latex_template_categories',
    module: 'latex',
    tool: {
      name: 'query_latex_template_categories',
      description: '查询 LaTeX 模板分类列表（含唯一 ID）。创建/查询模板时需先调用此工具。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    execute: async (_args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      // Derive unique categories from templates
      const catSet = new Map<string, string>();
      templates.forEach((t: any) => {
        const cat = t.category || 'custom';
        if (!catSet.has(cat)) catSet.set(cat, cat); // category name is used as both id and name for templates
      });
      const categories = Array.from(catSet.entries()).map(([id, name]) => ({ id, name }));
      return { success: true, categories, hint: '模板分类的 ID 即是分类名称字符串。' };
    },
  },
  {
    name: 'create_latex_template_category',
    module: 'latex',
    tool: {
      name: 'create_latex_template_category',
      description: '创建新的 LaTeX 模板分类。会创建一个占位模板使分类出现。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '分类名称' },
        },
        required: ['name'],
      },
    },
    execute: async (args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveTemplate) return { success: false, error: 'LaTeX API 不可用。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      if (templates.some((t: any) => t.category === name)) {
        return { success: false, error: `模板分类「${name}」已存在。` };
      }
      const placeholder = {
        id: `cat-${Date.now()}`,
        name: '新模板',
        content: '% 新模板\n\\documentclass{article}\n\\begin{document}\n\n\\end{document}',
        category: name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await electronAPI.latexSaveTemplate(placeholder);
      // Auto-authorize the new template category
      _ctx.onAutoAuthLatexTemplateCategory(name);
      return { success: true, message: `模板分类「${name}」已创建并已自动授权。`, categoryId: name };
    },
  },
  {
    name: 'query_latex_templates',
    module: 'latex',
    tool: {
      name: 'query_latex_templates',
      description: '查询 LaTeX 模板列表。可按分类筛选。需要对应分类的权限。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '按分类名称筛选（可选，即 query_latex_template_categories 返回的 id）' },
          keyword: { type: 'string', description: '按模板名称搜索（可选）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (ctx.latexTemplatePermissions.length === 0) return { success: false, error: 'LaTeX 模板读取未授权。请在 Agent 权限中心开启「LaTeX」读取权限。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      let templates: any[] = await electronAPI.latexGetTemplates();
      // Filter by permission
      templates = templates.filter(t => {
        const cat = t.category || 'custom';
        return ctx.latexTemplatePermissions.includes(cat) || ctx.latexTemplatePermissions.includes('__all__');
      });
      if (typeof args.category === 'string' && args.category.trim()) {
        const cat = args.category.trim();
        if (!ctx.latexTemplatePermissions.includes(cat) && !ctx.latexTemplatePermissions.includes('__all__')) {
          return { success: false, error: `模板分类「${cat}」未授权。请在 Agent 权限中心开启「LaTeX」读取权限。` };
        }
        templates = templates.filter(t => t.category === cat);
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        templates = templates.filter(t => t.name.toLowerCase().includes(kw) || (t.description || '').toLowerCase().includes(kw));
      }
      const result = templates.map(t => ({ id: t.id, name: t.name, description: t.description || null, category: t.category, hasContent: !!t.content }));
      return { success: true, total: result.length, templates: result };
    },
  },
  {
    name: 'read_latex_template',
    module: 'latex',
    tool: {
      name: 'read_latex_template',
      description: '读取一个 LaTeX 模板的完整内容。通过模板 ID 定位（从 query_latex_templates 结果中获取）。',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: '模板 ID（从 query_latex_templates 结果中获取）' },
        },
        required: ['templateId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      const tpl = templates.find((t: any) => t.id === args.templateId);
      if (!tpl) return { success: false, error: `未找到模板「${args.templateId}」。` };
      const cat = tpl.category || 'custom';
      if (!ctx.latexTemplatePermissions.includes(cat) && !ctx.latexTemplatePermissions.includes('__all__')) {
        return { success: false, error: `LaTeX 模板读取未授权。请在 Agent 权限中心开启「LaTeX」读取权限。` };
      }
      return { success: true, id: tpl.id, name: tpl.name, description: tpl.description || null, category: tpl.category, content: tpl.content, length: (tpl.content || '').length };
    },
  },
  {
    name: 'create_latex_template',
    module: 'latex',
    tool: {
      name: 'create_latex_template',
      description: '创建一个新的 LaTeX 模板。需提供名称、分类和完整的 .tex 源码内容。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '模板名称' },
          description: { type: 'string', description: '模板描述（可选）' },
          category: { type: 'string', description: '分类名称（从 query_latex_template_categories 获取，或新分类名）' },
          content: { type: 'string', description: '完整的 .tex 源码内容' },
        },
        required: ['name', 'category', 'content'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveTemplate) return { success: false, error: 'LaTeX API 不可用。' };
      const cat = typeof args.category === 'string' ? args.category.trim() : 'custom';
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '模板名称不能为空。' };
      const content = typeof args.content === 'string' ? args.content : '';
      const tpl = {
        id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        description: typeof args.description === 'string' ? args.description.trim() || undefined : undefined,
        content,
        category: cat,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ok = await electronAPI.latexSaveTemplate(tpl);
      if (!ok) return { success: false, error: '模板保存失败。' };
      // If category is new, auto-authorize it
      if (!ctx.latexTemplatePermissions.includes(cat)) {
        ctx.onAutoAuthLatexTemplateCategory(cat);
      }
      return { success: true, message: `模板「${name}」已创建。`, id: tpl.id, category: cat };
    },
  },
  {
    name: 'edit_latex_template',
    module: 'latex',
    tool: {
      name: 'edit_latex_template',
      description: '修改一个已有的 LaTeX 模板。可更新名称、描述、分类或内容。',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: '模板 ID（从 query_latex_templates 获取）' },
          name: { type: 'string', description: '新的模板名称（可选）' },
          description: { type: 'string', description: '新的描述（可选）' },
          category: { type: 'string', description: '新的分类（可选）' },
          content: { type: 'string', description: '新的完整 .tex 源码内容（可选）' },
        },
        required: ['templateId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveTemplate || !electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      const tpl = templates.find((t: any) => t.id === args.templateId);
      if (!tpl) return { success: false, error: `未找到模板「${args.templateId}」。` };
      const oldCat = tpl.category || 'custom';
      if (!ctx.latexTemplatePermissions.includes(oldCat) && !ctx.latexTemplatePermissions.includes('__all__')) {
        return { success: false, error: `LaTeX 模板编辑未授权。请在 Agent 权限中心开启「LaTeX」修改权限。` };
      }
      const newCat = typeof args.category === 'string' && args.category.trim() ? args.category.trim() : oldCat;
      if (newCat !== oldCat && !ctx.latexTemplatePermissions.includes(newCat) && !ctx.latexTemplatePermissions.includes('__all__')) {
        return { success: false, error: `目标分类「${newCat}」未授权。请在 Agent 权限中心开启「LaTeX」修改权限。` };
      }
      const updated = {
        ...tpl,
        name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : tpl.name,
        description: typeof args.description === 'string' ? (args.description.trim() || undefined) : tpl.description,
        category: newCat,
        content: typeof args.content === 'string' ? args.content : tpl.content,
        updatedAt: Date.now(),
      };
      const ok = await electronAPI.latexSaveTemplate(updated);
      if (!ok) return { success: false, error: '模板保存失败。' };
      return { success: true, message: `模板「${updated.name}」已更新。`, id: tpl.id };
    },
  },
];
