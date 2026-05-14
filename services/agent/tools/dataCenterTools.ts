import type { APIRecord, OJSubmission, ResourceItem, SSHRecord } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';
import { buildSshCommand, normalizeLimit, textIncludes, toSafeApiRecord } from './toolUtils';

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
];
