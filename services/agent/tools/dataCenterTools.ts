import type { APIRecord, OJStatCategory, OJSubmission, OJSite, ResourceItem, SSHRecord } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';
import { buildSshCommand, normalizeLimit, textIncludes, toSafeApiRecord } from './toolUtils';

interface WebsiteRecord {
  id: string;
  url: string;
  account: string;
  password: string;
  note: string;
  shortName: string;
  tag: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface WebsiteTag {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

const PASSWORD_STORAGE_KEY = 'linkmaster_passwords_v1';
const PASSWORD_TAGS_STORAGE_KEY = 'linkmaster_password_tags_v1';
const WEBSITE_EVENT_NAME = 'guyue-password-manager-updated';
const WEBSITE_TAG_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

const readLocalJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeLocalJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const notifyWebsiteRecordsChanged = () => {
  window.dispatchEvent(new CustomEvent(WEBSITE_EVENT_NAME));
};

const readWebsiteRecords = () => readLocalJson<WebsiteRecord[]>(PASSWORD_STORAGE_KEY, []);
const readWebsiteTags = () => readLocalJson<WebsiteTag[]>(PASSWORD_TAGS_STORAGE_KEY, []);

const saveWebsiteRecords = (records: WebsiteRecord[]) => {
  writeLocalJson(PASSWORD_STORAGE_KEY, records);
  notifyWebsiteRecordsChanged();
};

const saveWebsiteTags = (tags: WebsiteTag[]) => {
  writeLocalJson(PASSWORD_TAGS_STORAGE_KEY, tags);
  notifyWebsiteRecordsChanged();
};

const ensureWebsiteTag = (tagName: string) => {
  const name = tagName.trim() || '默认';
  const tags = readWebsiteTags();
  if (tags.some(tag => tag.name === name)) return name;
  const nextTag: WebsiteTag = {
    id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    color: WEBSITE_TAG_COLORS[tags.length % WEBSITE_TAG_COLORS.length],
    icon: 'Tag',
    sortOrder: tags.length,
  };
  saveWebsiteTags([...tags, nextTag]);
  return name;
};

const normalizeOjDate = (value: unknown) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const normalizeOjCategories = (value: unknown, fallback?: OJStatCategory[]): OJStatCategory[] => {
  if (!Array.isArray(value) || value.length === 0) return fallback || [
    { id: 'easy', name: '简单', color: '#22c55e' },
    { id: 'medium', name: '中等', color: '#f59e0b' },
    { id: 'hard', name: '困难', color: '#ef4444' },
  ];
  return value
    .map((item: any): OJStatCategory | null => {
      const name = String(item?.name || item?.id || '').trim();
      if (!name) return null;
      return {
        id: String(item?.id || name).trim(),
        name,
        color: String(item?.color || '#6366f1').trim(),
      };
    })
    .filter((item: OJStatCategory | null): item is OJStatCategory => Boolean(item));
};

export const DATA_CENTER_TOOL_REGISTRATIONS: ToolRegistration[] = [
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

        const dateStr = normalizeOjDate(args.date);

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
        description: '查询数据中心 API 管理中的接口记录。默认只返回 hasApiKey；传 includeSecret=true 时在权限允许下返回 apiKey 明文。',
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
        const includeSecret = args.includeSecret === true;
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
          .map(record => includeSecret ? { ...toSafeApiRecord(record), apiKey: record.apiKey } : toSafeApiRecord(record));
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
  {
      name: 'query_oj_heatmap',
      module: 'dc-oj',
      tool: {
        name: 'query_oj_heatmap',
        description: '查询 OJ 热力图明细，返回按日期聚合的提交次数和匹配的提交记录。可按平台、分类、最近天数筛选。',
        inputSchema: {
          type: 'object',
          properties: {
            siteId: { type: 'string', description: 'OJ 网站 ID，可从 query_oj_stats 的 availableSites 获取。' },
            categoryId: { type: 'string', description: '分类 ID。' },
            days: { type: 'number', description: '最近 N 天，默认 365，传 0 表示全部。' },
            limit: { type: 'number', description: '返回提交记录条数，默认 80，最大 200。' },
          },
        },
      },
      execute: async (args, ctx) => {
        const days = Number(args.days ?? 365);
        const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
        let submissions = ctx.ojHeatmapData.submissions.filter(item =>
          item.id !== 'lc_stats_meta' &&
          item.categoryId !== 'meta' &&
          item.timestamp >= cutoff
        );
        if (typeof args.siteId === 'string' && args.siteId.trim()) {
          submissions = submissions.filter(item => item.siteId === args.siteId.trim());
        }
        if (typeof args.categoryId === 'string' && args.categoryId.trim()) {
          submissions = submissions.filter(item => item.categoryId === args.categoryId.trim());
        }
        const byDate: Record<string, number> = {};
        for (const item of submissions) {
          byDate[item.date] = (byDate[item.date] || 0) + 1;
        }
        const limit = normalizeLimit(args.limit, 80, 200);
        return {
          success: true,
          period: days > 0 ? `最近 ${days} 天` : '全部',
          total: submissions.length,
          heatmap: byDate,
          submissions: [...submissions]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map(item => ({
              ...item,
              siteName: ctx.ojHeatmapData.sites.find(site => site.id === item.siteId)?.name || item.siteId,
              categoryName: ctx.ojHeatmapData.sites
                .find(site => site.id === item.siteId)
                ?.categories?.find(category => category.id === item.categoryId)?.name || item.categoryId,
            })),
        };
      },
    },
  {
      name: 'update_oj_submission',
      module: 'dc-oj',
      tool: {
        name: 'update_oj_submission',
        description: '修改一条 OJ 做题记录。需要先 query_oj_heatmap 或 query_oj_stats 获取 submission id。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '提交记录 ID。' },
            siteId: { type: 'string', description: '新网站 ID。' },
            categoryId: { type: 'string', description: '新分类 ID。' },
            problemId: { type: 'string', description: '新题号。' },
            problemTitle: { type: 'string', description: '新题目标题。' },
            date: { type: 'string', description: '新日期 YYYY-MM-DD。' },
          },
          required: ['id'],
        },
      },
      execute: async (args, ctx) => {
        const id = String(args.id || '').trim();
        const current = ctx.ojHeatmapData.submissions.find(item => item.id === id);
        if (!current) return { success: false, error: `未找到提交记录「${id}」。` };
        const nextSiteId = typeof args.siteId === 'string' && args.siteId.trim() ? args.siteId.trim() : current.siteId;
        const site = ctx.ojHeatmapData.sites.find(item => item.id === nextSiteId);
        if (!site) return { success: false, error: `网站 ID「${nextSiteId}」不存在。` };
        const nextCategoryId = typeof args.categoryId === 'string' && args.categoryId.trim() ? args.categoryId.trim() : current.categoryId;
        if (site.categories?.length && !site.categories.some(item => item.id === nextCategoryId)) {
          return { success: false, error: `分类 ID「${nextCategoryId}」不属于网站「${site.name}」。` };
        }
        const updates: Partial<OJSubmission> = {
          siteId: nextSiteId,
          categoryId: nextCategoryId,
        };
        if (typeof args.problemId === 'string') updates.problemId = args.problemId.trim();
        if (typeof args.problemTitle === 'string') updates.problemTitle = args.problemTitle.trim();
        if (typeof args.date === 'string') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return { success: false, error: '日期必须是 YYYY-MM-DD。' };
          updates.date = args.date;
          updates.timestamp = new Date(`${args.date}T12:00:00`).getTime();
        }
        const nextData = {
          ...ctx.ojHeatmapData,
          submissions: ctx.ojHeatmapData.submissions.map(item => item.id === id ? { ...item, ...updates } : item),
        };
        ctx.onUpdateOJHeatmapData(nextData);
        return { success: true, message: `OJ 记录「${id}」已更新`, updated: { id, ...updates } };
      },
    },
  {
      name: 'delete_oj_submission',
      module: 'dc-oj',
      tool: {
        name: 'delete_oj_submission',
        description: '删除一条 OJ 做题记录。需要先 query_oj_heatmap 获取 submission id。',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: '提交记录 ID。' } },
          required: ['id'],
        },
      },
      execute: async (args, ctx) => {
        const id = String(args.id || '').trim();
        const current = ctx.ojHeatmapData.submissions.find(item => item.id === id);
        if (!current) return { success: false, error: `未找到提交记录「${id}」。` };
        ctx.onUpdateOJHeatmapData({
          ...ctx.ojHeatmapData,
          submissions: ctx.ojHeatmapData.submissions.filter(item => item.id !== id),
        });
        return { success: true, message: `OJ 记录「${current.problemId}」已删除` };
      },
    },
  {
      name: 'create_oj_site',
      module: 'dc-oj',
      tool: {
        name: 'create_oj_site',
        description: '新增 OJ 网站配置，可同时配置统计分类。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '网站名称。' },
            id: { type: 'string', description: '网站 ID，可选。' },
            color: { type: 'string', description: '主题色，如 #22c55e。' },
            url: { type: 'string', description: '网站链接。' },
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  color: { type: 'string' },
                },
              },
            },
          },
          required: ['name'],
        },
      },
      execute: async (args, ctx) => {
        const name = String(args.name || '').trim();
        if (!name) return { success: false, error: '网站名称不能为空。' };
        const id = String(args.id || name.toLowerCase().replace(/\s+/g, '-')).trim();
        if (ctx.ojHeatmapData.sites.some(site => site.id === id || site.name === name)) {
          return { success: false, error: `OJ 网站「${name}」已存在。` };
        }
        const site: OJSite = {
          id,
          name,
          color: typeof args.color === 'string' && args.color.trim() ? args.color.trim() : '#6366f1',
          url: typeof args.url === 'string' ? args.url.trim() : undefined,
          categories: normalizeOjCategories(args.categories),
        };
        ctx.onUpdateOJHeatmapData({ ...ctx.ojHeatmapData, sites: [...ctx.ojHeatmapData.sites, site] });
        return { success: true, message: `OJ 网站「${site.name}」已创建`, site };
      },
    },
  {
      name: 'update_oj_site',
      module: 'dc-oj',
      tool: {
        name: 'update_oj_site',
        description: '修改 OJ 网站配置。可更新名称、颜色、链接和分类。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '网站 ID。' },
            name: { type: 'string' },
            color: { type: 'string' },
            url: { type: 'string' },
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: { id: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' } },
              },
            },
          },
          required: ['id'],
        },
      },
      execute: async (args, ctx) => {
        const id = String(args.id || '').trim();
        const site = ctx.ojHeatmapData.sites.find(item => item.id === id);
        if (!site) return { success: false, error: `未找到 OJ 网站「${id}」。` };
        const updates: Partial<OJSite> = {};
        if (typeof args.name === 'string') updates.name = args.name.trim();
        if (typeof args.color === 'string') updates.color = args.color.trim();
        if (typeof args.url === 'string') updates.url = args.url.trim();
        if (Array.isArray(args.categories)) updates.categories = normalizeOjCategories(args.categories, site.categories);
        ctx.onUpdateOJHeatmapData({
          ...ctx.ojHeatmapData,
          sites: ctx.ojHeatmapData.sites.map(item => item.id === id ? { ...item, ...updates } : item),
        });
        return { success: true, message: `OJ 网站「${site.name}」已更新`, updated: { id, ...updates } };
      },
    },
  {
      name: 'delete_oj_site',
      module: 'dc-oj',
      tool: {
        name: 'delete_oj_site',
        description: '删除 OJ 网站配置，并删除该网站下的提交记录。',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: '网站 ID。' } },
          required: ['id'],
        },
      },
      execute: async (args, ctx) => {
        const id = String(args.id || '').trim();
        const site = ctx.ojHeatmapData.sites.find(item => item.id === id);
        if (!site) return { success: false, error: `未找到 OJ 网站「${id}」。` };
        ctx.onUpdateOJHeatmapData({
          sites: ctx.ojHeatmapData.sites.filter(item => item.id !== id),
          submissions: ctx.ojHeatmapData.submissions.filter(item => item.siteId !== id),
        });
        return { success: true, message: `OJ 网站「${site.name}」已删除` };
      },
    },
  {
      name: 'query_website_records',
      module: 'dc-website',
      tool: {
        name: 'query_website_records',
        description: '查询数据中心网站管理中的网站账号记录。离线本地权限开启后可返回密码明文。',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '按网站名、URL、账号、密码、备注搜索。' },
            tag: { type: 'string', description: '按标签名称筛选。' },
            includePassword: { type: 'boolean', description: '是否返回密码明文，默认 true。' },
            limit: { type: 'number', description: '最多返回条数，默认 50，最大 200。' },
          },
        },
      },
      execute: async (args) => {
        const keyword = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '';
        const tag = typeof args.tag === 'string' ? args.tag.trim() : '';
        const includePassword = args.includePassword !== false;
        let records = readWebsiteRecords();
        if (tag) records = records.filter(item => item.tag === tag);
        if (keyword) {
          records = records.filter(item =>
            [item.shortName, item.url, item.account, item.password, item.note, item.tag]
              .some(value => String(value || '').toLowerCase().includes(keyword))
          );
        }
        const limit = normalizeLimit(args.limit, 50, 200);
        const tags = readWebsiteTags().sort((a, b) => a.sortOrder - b.sortOrder);
        const result = [...records]
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.updatedAt - a.updatedAt)
          .slice(0, limit)
          .map(item => ({
            id: item.id,
            shortName: item.shortName,
            url: item.url,
            account: item.account,
            password: includePassword ? item.password : undefined,
            tag: item.tag,
            note: item.note,
            sortOrder: item.sortOrder,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }));
        return { success: true, total: records.length, returned: result.length, tags, records: result };
      },
    },
  {
      name: 'create_website_record',
      module: 'dc-website',
      tool: {
        name: 'create_website_record',
        description: '在网站管理中创建一条网站账号/密码记录。',
        inputSchema: {
          type: 'object',
          properties: {
            shortName: { type: 'string', description: '网站简称或显示名。' },
            url: { type: 'string', description: '网站 URL。' },
            account: { type: 'string', description: '账号。' },
            password: { type: 'string', description: '密码。' },
            note: { type: 'string', description: '备注。' },
            tag: { type: 'string', description: '标签名称。不存在时会自动创建。' },
          },
          required: ['shortName'],
        },
      },
      execute: async (args) => {
        const shortName = String(args.shortName || '').trim();
        if (!shortName) return { success: false, error: '网站名称不能为空。' };
        const records = readWebsiteRecords();
        const tag = ensureWebsiteTag(typeof args.tag === 'string' && args.tag.trim() ? args.tag.trim() : '默认');
        const sameTagRecords = records.filter(item => item.tag === tag);
        const now = Date.now();
        const record: WebsiteRecord = {
          id: `pw_${now}_${Math.random().toString(36).slice(2, 8)}`,
          shortName,
          url: typeof args.url === 'string' ? args.url.trim() : '',
          account: typeof args.account === 'string' ? args.account.trim() : '',
          password: typeof args.password === 'string' ? args.password : '',
          note: typeof args.note === 'string' ? args.note.trim() : '',
          tag,
          sortOrder: sameTagRecords.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), 0) + 1,
          createdAt: now,
          updatedAt: now,
        };
        saveWebsiteRecords([record, ...records]);
        return { success: true, message: `网站记录「${record.shortName}」已创建`, record };
      },
    },
  {
      name: 'update_website_record',
      module: 'dc-website',
      tool: {
        name: 'update_website_record',
        description: '修改网站管理中的网站账号/密码记录。需要先 query_website_records 获取 id。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '记录 ID。' },
            shortName: { type: 'string' },
            url: { type: 'string' },
            account: { type: 'string' },
            password: { type: 'string' },
            note: { type: 'string' },
            tag: { type: 'string' },
            sortOrder: { type: 'number' },
          },
          required: ['id'],
        },
      },
      execute: async (args) => {
        const id = String(args.id || '').trim();
        const records = readWebsiteRecords();
        const record = records.find(item => item.id === id);
        if (!record) return { success: false, error: `未找到网站记录「${id}」。` };
        const updates: Partial<WebsiteRecord> = { updatedAt: Date.now() };
        for (const field of ['shortName', 'url', 'account', 'password', 'note'] as const) {
          if (typeof args[field] === 'string') updates[field] = field === 'password' ? args[field] : args[field].trim();
        }
        if (typeof args.tag === 'string') updates.tag = ensureWebsiteTag(args.tag.trim());
        if (typeof args.sortOrder === 'number') updates.sortOrder = args.sortOrder;
        const nextRecords = records.map(item => item.id === id ? { ...item, ...updates } : item);
        saveWebsiteRecords(nextRecords);
        return { success: true, message: `网站记录「${record.shortName}」已更新`, updated: { id, ...updates } };
      },
    },
  {
      name: 'delete_website_record',
      module: 'dc-website',
      tool: {
        name: 'delete_website_record',
        description: '删除网站管理中的网站账号/密码记录。需要先 query_website_records 获取 id。',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: '记录 ID。' } },
          required: ['id'],
        },
      },
      execute: async (args) => {
        const id = String(args.id || '').trim();
        const records = readWebsiteRecords();
        const record = records.find(item => item.id === id);
        if (!record) return { success: false, error: `未找到网站记录「${id}」。` };
        saveWebsiteRecords(records.filter(item => item.id !== id));
        return { success: true, message: `网站记录「${record.shortName}」已删除` };
      },
    },
  {
      name: 'create_website_tag',
      module: 'dc-website',
      tool: {
        name: 'create_website_tag',
        description: '创建网站管理标签。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            color: { type: 'string' },
            icon: { type: 'string' },
          },
          required: ['name'],
        },
      },
      execute: async (args) => {
        const name = String(args.name || '').trim();
        if (!name) return { success: false, error: '标签名称不能为空。' };
        const tags = readWebsiteTags();
        if (tags.some(item => item.name === name)) return { success: false, error: `标签「${name}」已存在。` };
        const tag: WebsiteTag = {
          id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          color: typeof args.color === 'string' && args.color.trim() ? args.color.trim() : WEBSITE_TAG_COLORS[tags.length % WEBSITE_TAG_COLORS.length],
          icon: typeof args.icon === 'string' && args.icon.trim() ? args.icon.trim() : 'Tag',
          sortOrder: tags.length,
        };
        saveWebsiteTags([...tags, tag]);
        return { success: true, message: `网站标签「${name}」已创建`, tag };
      },
    },
  {
      name: 'update_website_tag',
      module: 'dc-website',
      tool: {
        name: 'update_website_tag',
        description: '修改网站管理标签，并同步更新使用该标签的记录。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            color: { type: 'string' },
            icon: { type: 'string' },
            sortOrder: { type: 'number' },
          },
          required: ['id'],
        },
      },
      execute: async (args) => {
        const id = String(args.id || '').trim();
        const tags = readWebsiteTags();
        const tag = tags.find(item => item.id === id);
        if (!tag) return { success: false, error: `未找到网站标签「${id}」。` };
        const nextName = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : tag.name;
        const updates: Partial<WebsiteTag> = { name: nextName };
        if (typeof args.color === 'string') updates.color = args.color.trim();
        if (typeof args.icon === 'string') updates.icon = args.icon.trim();
        if (typeof args.sortOrder === 'number') updates.sortOrder = args.sortOrder;
        saveWebsiteTags(tags.map(item => item.id === id ? { ...item, ...updates } : item));
        if (nextName !== tag.name) {
          const records = readWebsiteRecords();
          saveWebsiteRecords(records.map(item => item.tag === tag.name ? { ...item, tag: nextName, updatedAt: Date.now() } : item));
        }
        return { success: true, message: `网站标签「${tag.name}」已更新`, updated: { id, ...updates } };
      },
    },
  {
      name: 'delete_website_tag',
      module: 'dc-website',
      tool: {
        name: 'delete_website_tag',
        description: '删除网站管理标签，并将使用该标签的记录移动到 fallbackTag 或默认标签。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fallbackTag: { type: 'string', description: '被删除标签下记录迁移到的新标签。' },
          },
          required: ['id'],
        },
      },
      execute: async (args) => {
        const id = String(args.id || '').trim();
        const tags = readWebsiteTags();
        const tag = tags.find(item => item.id === id);
        if (!tag) return { success: false, error: `未找到网站标签「${id}」。` };
        let remaining = tags.filter(item => item.id !== id);
        const fallbackTag = typeof args.fallbackTag === 'string' && args.fallbackTag.trim()
          ? args.fallbackTag.trim()
          : remaining[0]?.name || '默认';
        if (!remaining.some(item => item.name === fallbackTag)) {
          remaining = [...remaining, {
            id: `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: fallbackTag,
            color: WEBSITE_TAG_COLORS[remaining.length % WEBSITE_TAG_COLORS.length],
            icon: 'Tag',
            sortOrder: remaining.length,
          }];
        }
        saveWebsiteTags(remaining);
        const records = readWebsiteRecords();
        saveWebsiteRecords(records.map(item => item.tag === tag.name ? { ...item, tag: fallbackTag, updatedAt: Date.now() } : item));
        return { success: true, message: `网站标签「${tag.name}」已删除，相关记录已迁移到「${fallbackTag}」` };
      },
    },
];
