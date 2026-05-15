import type { Category, ImageRecord } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';
import { normalizeLimit } from './toolUtils';

const IMAGE_RECORDS_STORAGE_KEY = 'linkmaster_image_records_v1';
const IMAGE_CATEGORIES_STORAGE_KEY = 'linkmaster_categories_v1';
const IMAGE_RECORDS_EVENT_NAME = 'guyue:image-records-updated';
const CATEGORY_EVENT_NAME = 'guyue:categories-updated';
const IMAGE_MODULE_KEY = 'image-hosting';
const RESERVED_CATEGORY_NAMES = new Set(['全部', '未分类', '默认']);

const trimString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const createImageCategoryId = (name: string) =>
  `cat_${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '') || crypto.randomUUID()}`;

const readImageRecords = (): ImageRecord[] => {
  try {
    const raw = localStorage.getItem(IMAGE_RECORDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveImageRecords = (records: ImageRecord[]) => {
  localStorage.setItem(IMAGE_RECORDS_STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(IMAGE_RECORDS_EVENT_NAME, { detail: { records } }));
};

const readCategoriesMap = (): Record<string, Category[]> => {
  try {
    const raw = localStorage.getItem(IMAGE_CATEGORIES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeCategory = (category: Category): Category | null => {
  const name = trimString(category?.name);
  if (!name || RESERVED_CATEGORY_NAMES.has(name) || category?.id === 'all' || category?.isSystem) return null;
  return {
    id: trimString(category.id) || createImageCategoryId(name),
    name,
    icon: trimString(category.icon) || 'Image',
    color: trimString(category.color) || undefined,
    isSystem: false,
  };
};

const normalizeCategories = (categories: Category[] = []) => {
  const seen = new Set<string>();
  return categories.reduce((acc, category) => {
    const normalized = normalizeCategory(category);
    if (!normalized || seen.has(normalized.name)) return acc;
    seen.add(normalized.name);
    acc.push(normalized);
    return acc;
  }, [] as Category[]);
};

const readImageCategories = (): Category[] => {
  const categoriesMap = readCategoriesMap();
  const stored = normalizeCategories(categoriesMap[IMAGE_MODULE_KEY] || []);
  const existingNames = new Set(stored.map(category => category.name));
  const derived = readImageRecords()
    .map(record => trimString(record.category))
    .filter(name => name && !RESERVED_CATEGORY_NAMES.has(name) && !existingNames.has(name))
    .map(name => ({ id: createImageCategoryId(name), name, icon: 'Image', isSystem: false }));
  return [...stored, ...derived];
};

const saveImageCategories = (categories: Category[]) => {
  const categoriesMap = readCategoriesMap();
  const nextMap = {
    ...categoriesMap,
    [IMAGE_MODULE_KEY]: normalizeCategories(categories),
  };
  localStorage.setItem(IMAGE_CATEGORIES_STORAGE_KEY, JSON.stringify(nextMap));
  window.dispatchEvent(new CustomEvent(CATEGORY_EVENT_NAME, { detail: { categoriesMap: nextMap } }));
};

const resolveCategory = (categories: Category[], params: { categoryId?: unknown; category?: unknown; name?: unknown }) => {
  const categoryId = trimString(params.categoryId);
  const categoryName = trimString(params.category || params.name);
  if (categoryId) {
    const match = categories.find(category => category.id === categoryId);
    if (match) return match;
  }
  if (categoryName) {
    return categories.find(category => category.name === categoryName) || null;
  }
  return null;
};

const requireCategoryName = (args: Record<string, any>) => {
  const categories = readImageCategories();
  const category = resolveCategory(categories, args);
  if (!category) {
    return {
      error: '必须选择已有图床分类。请先 query_image_categories 获取 categoryId；没有分类时先 create_image_category。',
      categories,
    };
  }
  return { category, categories };
};

const toImageSummary = (record: ImageRecord) => ({
  id: record.id,
  name: record.name || record.filename,
  filename: record.filename,
  url: record.url,
  markdown: `![${record.name || record.filename}](${record.url})`,
  category: record.category || null,
  sha: record.sha || null,
  path: record.path || null,
  createdAt: record.createdAt || null,
});

const findImageRecord = (records: ImageRecord[], args: Record<string, any>) => {
  const id = trimString(args.id);
  const url = trimString(args.url);
  const name = trimString(args.name).toLowerCase();
  if (id) return records.find(record => record.id === id) || null;
  if (url) return records.find(record => record.url === url) || null;
  if (name) {
    return records.find(record =>
      (record.name || '').toLowerCase() === name ||
      (record.filename || '').toLowerCase() === name,
    ) || null;
  }
  return null;
};

const parseDataUrl = (url: string, includeDataUrl: boolean) => {
  const match = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const base64 = match[2] || '';
  return {
    success: true,
    source: 'data-url',
    url: 'data-url',
    mimeType: match[1],
    byteLength: Math.floor(base64.length * 0.75),
    base64: includeDataUrl ? base64 : undefined,
    dataUrl: includeDataUrl ? url : undefined,
  };
};

const fetchImageUrl = async (url: string, includeDataUrl: boolean, maxBytes: number) => {
  const dataUrlResult = parseDataUrl(url, includeDataUrl);
  if (dataUrlResult) return dataUrlResult;

  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.fetchImageUrl) {
    const result = await electronAPI.fetchImageUrl({ url, maxBytes });
    if (!result?.success) return result || { success: false, error: '图片读取失败。' };
    return includeDataUrl ? result : { ...result, base64: undefined, dataUrl: undefined };
  }

  const response = await fetch(url);
  if (!response.ok) return { success: false, error: `图片读取失败：HTTP ${response.status}` };
  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
  if (!mimeType.startsWith('image/')) return { success: false, error: `链接不是图片类型：${mimeType}` };
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) return { success: false, error: `图片过大：${buffer.byteLength} bytes，超过限制 ${maxBytes} bytes。` };
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  const base64 = btoa(binary);
  return {
    success: true,
    source: 'renderer-fetch',
    url,
    mimeType,
    byteLength: buffer.byteLength,
    base64: includeDataUrl ? base64 : undefined,
    dataUrl: includeDataUrl ? `data:${mimeType};base64,${base64}` : undefined,
  };
};

export const IMAGE_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'query_image_categories',
    module: 'image',
    tool: {
      name: 'query_image_categories',
      description: '查询图床分类列表，返回分类 ID、名称和图片数量。新增/上传图片前必须先调用。',
      inputSchema: { type: 'object', properties: {} },
    },
    execute: async () => {
      const categories = readImageCategories();
      const records = readImageRecords();
      const counts = records.reduce((acc, record) => {
        const category = trimString(record.category);
        if (category) acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return {
        success: true,
        categories: categories.map(category => ({
          ...category,
          imageCount: counts[category.name] || 0,
        })),
      };
    },
  },
  {
    name: 'create_image_category',
    module: 'image',
    tool: {
      name: 'create_image_category',
      description: '创建图床分类。分类名称不能是“全部/未分类/默认”。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          icon: { type: 'string' },
          color: { type: 'string' },
        },
        required: ['name'],
      },
    },
    execute: async (args) => {
      const name = trimString(args.name);
      if (!name || RESERVED_CATEGORY_NAMES.has(name)) return { success: false, error: '图床分类名称无效。' };
      const categories = readImageCategories();
      if (categories.some(category => category.name === name)) return { success: false, error: `图床分类「${name}」已存在。` };
      const category: Category = {
        id: crypto.randomUUID(),
        name,
        icon: trimString(args.icon) || 'Image',
        color: trimString(args.color) || undefined,
        isSystem: false,
      };
      saveImageCategories([...categories, category]);
      return { success: true, message: `图床分类「${name}」已创建。`, category };
    },
  },
  {
    name: 'update_image_category',
    module: 'image',
    tool: {
      name: 'update_image_category',
      description: '更新图床分类名称、图标或颜色；重命名时会同步更新分类下的图片记录。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          category: { type: 'string', description: '也可用旧分类名称定位' },
          name: { type: 'string', description: '新的分类名称' },
          icon: { type: 'string' },
          color: { type: 'string' },
        },
        required: ['name'],
      },
    },
    execute: async (args) => {
      const categories = readImageCategories();
      const target = resolveCategory(categories, args);
      if (!target) return { success: false, error: '图床分类不存在。请先 query_image_categories 获取 categoryId。' };
      const name = trimString(args.name);
      if (!name || RESERVED_CATEGORY_NAMES.has(name)) return { success: false, error: '图床分类名称无效。' };
      if (categories.some(category => category.id !== target.id && category.name === name)) {
        return { success: false, error: `图床分类「${name}」已存在。` };
      }
      const updatedCategory: Category = {
        ...target,
        name,
        icon: trimString(args.icon) || target.icon || 'Image',
        color: typeof args.color === 'string' ? args.color.trim() || undefined : target.color,
      };
      const nextCategories = categories.map(category => category.id === target.id ? updatedCategory : category);
      saveImageCategories(nextCategories);
      if (name !== target.name) {
        const records = readImageRecords();
        saveImageRecords(records.map(record => record.category === target.name ? { ...record, category: name } : record));
      }
      return { success: true, message: `图床分类「${target.name}」已更新。`, category: updatedCategory };
    },
  },
  {
    name: 'delete_image_category',
    module: 'image',
    tool: {
      name: 'delete_image_category',
      description: '删除图床分类。分类下有图片时必须传 fallbackCategoryId 或 fallbackCategory，把图片迁移到已有分类。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          category: { type: 'string' },
          fallbackCategoryId: { type: 'string' },
          fallbackCategory: { type: 'string' },
        },
      },
    },
    execute: async (args) => {
      const categories = readImageCategories();
      const target = resolveCategory(categories, args);
      if (!target) return { success: false, error: '图床分类不存在。请先 query_image_categories 获取 categoryId。' };
      const remaining = categories.filter(category => category.id !== target.id);
      const records = readImageRecords();
      const affected = records.filter(record => record.category === target.name);
      let fallback: Category | null = null;
      if (affected.length > 0) {
        fallback = resolveCategory(remaining, {
          categoryId: args.fallbackCategoryId,
          category: args.fallbackCategory,
        });
        if (!fallback) return { success: false, error: `分类下有 ${affected.length} 张图片，必须提供有效 fallbackCategoryId。` };
      }
      saveImageCategories(remaining);
      if (fallback) {
        saveImageRecords(records.map(record => record.category === target.name ? { ...record, category: fallback!.name } : record));
      }
      return { success: true, message: `图床分类「${target.name}」已删除。`, movedImageCount: affected.length };
    },
  },
  {
    name: 'query_images',
    module: 'image',
    tool: {
      name: 'query_images',
      description: '查询图床中已有图片。可按名称、分类 ID 或分类名称搜索，返回图片 URL 和 Markdown 链接。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，匹配图片文件名、显示名称或 URL' },
          categoryId: { type: 'string', description: '按分类 ID 筛选' },
          category: { type: 'string', description: '按分类名称筛选' },
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
      },
    },
    execute: async (args) => {
      const categories = readImageCategories();
      let records = readImageRecords();
      const category = resolveCategory(categories, args);
      if (trimString(args.categoryId) || trimString(args.category)) {
        if (!category) return { success: false, error: '指定的图床分类不存在。' };
        records = records.filter(record => record.category === category.name);
      }
      if (trimString(args.keyword)) {
        const keyword = trimString(args.keyword).toLowerCase();
        records = records.filter(record =>
          (record.filename || '').toLowerCase().includes(keyword) ||
          (record.name || '').toLowerCase().includes(keyword) ||
          (record.url || '').toLowerCase().includes(keyword),
        );
      }
      records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const limit = normalizeLimit(args.limit, 20, 100);
      const sliced = records.slice(0, limit);
      return {
        success: true,
        total: records.length,
        returned: sliced.length,
        categories: categories.map(item => ({ id: item.id, name: item.name })),
        images: sliced.map(toImageSummary),
      };
    },
  },
  {
    name: 'read_image_record',
    module: 'image',
    tool: {
      name: 'read_image_record',
      description: '读取图床图片记录详情，返回 URL、Markdown 引用和远程路径信息。可用 id、url 或 name 定位。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
    execute: async (args) => {
      const record = findImageRecord(readImageRecords(), args);
      if (!record) return { success: false, error: '未找到图片记录。请先 query_images 获取 id。' };
      return { success: true, image: toImageSummary(record) };
    },
  },
  {
    name: 'read_image_url',
    module: 'image',
    tool: {
      name: 'read_image_url',
      description: '访问图片 URL 并返回图片 MIME、大小和可选 dataUrl。可传 id 读取图床记录的 URL，也可直接传 url。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图床图片记录 ID，可选' },
          url: { type: 'string', description: '图片 URL，可选；与 id 二选一' },
          includeDataUrl: { type: 'boolean', description: '是否返回 base64 dataUrl；需要展示或进一步处理图片时设为 true' },
          maxBytes: { type: 'number', description: '最大允许读取字节数，默认 2097152，最大 8388608' },
        },
      },
    },
    execute: async (args) => {
      const record = findImageRecord(readImageRecords(), args);
      const url = trimString(args.url) || record?.url || '';
      if (!url) return { success: false, error: '图片 URL 不能为空。请传 url 或有效图片记录 id。' };
      if (!/^https?:\/\//i.test(url) && !/^data:image\//i.test(url)) {
        return { success: false, error: '仅支持 http(s) 图片链接或 data:image URL。' };
      }
      const maxBytes = Math.min(normalizeLimit(args.maxBytes, 2 * 1024 * 1024, 8 * 1024 * 1024), 8 * 1024 * 1024);
      const includeDataUrl = Boolean(args.includeDataUrl);
      const result = await fetchImageUrl(url, includeDataUrl, maxBytes);
      if (!result?.success) return result;
      return {
        ...result,
        name: record?.name || record?.filename || null,
        markdown: `![${record?.name || record?.filename || 'image'}](${url})`,
        hasDataUrl: Boolean(result.dataUrl),
      };
    },
  },
  {
    name: 'create_image_record',
    module: 'image',
    tool: {
      name: 'create_image_record',
      description: '为已有外部图片 URL 创建图床记录，不上传文件。必须指定已有图床分类。',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '图片 URL。' },
          name: { type: 'string', description: '显示名称。' },
          categoryId: { type: 'string', description: '图床分类 ID。' },
          category: { type: 'string', description: '图床分类名称。' },
          filename: { type: 'string', description: '文件名，可选。' },
        },
        required: ['url'],
      },
    },
    execute: async (args) => {
      const url = trimString(args.url);
      if (!url) return { success: false, error: '图片 URL 不能为空。' };
      const categoryResult = requireCategoryName(args);
      if ('error' in categoryResult) return { success: false, error: categoryResult.error };
      const now = Date.now();
      const name = trimString(args.name) || '外部链接';
      const record: ImageRecord = {
        id: `${now}_${Math.random().toString(36).slice(2, 6)}`,
        filename: trimString(args.filename) || name,
        name,
        url,
        sha: '',
        path: '',
        category: categoryResult.category.name,
        createdAt: now,
      };
      saveImageRecords([record, ...readImageRecords()]);
      return { success: true, message: `图片记录「${record.name}」已创建`, record: toImageSummary(record) };
    },
  },
  {
    name: 'upload_image',
    module: 'image',
    tool: {
      name: 'upload_image',
      description: '将用户发送的图片附件上传到图床（Gitee 仓库），并返回访问链接。必须指定已有图床分类。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '图片显示名称（可选，不传则使用文件名）' },
          categoryId: { type: 'string', description: '图床分类 ID。' },
          category: { type: 'string', description: '图床分类名称。' },
          attachmentIndex: { type: 'number', description: '上传第几个图片附件（从 0 开始，默认 0）' },
        },
      },
    },
    execute: async (args, ctx) => {
      const categoryResult = requireCategoryName(args);
      if ('error' in categoryResult) return { success: false, error: categoryResult.error };

      const configStr = localStorage.getItem('linkmaster_image_config_v1');
      if (!configStr) return { success: false, error: '图床未配置。请在「图床管理」中设置 Gitee 配置。' };
      let imgConfig: any;
      try { imgConfig = JSON.parse(configStr); } catch { return { success: false, error: '图床配置格式错误。' }; }
      if (!imgConfig.accessToken || !imgConfig.owner || !imgConfig.repo) {
        return { success: false, error: '图床配置不完整（缺少 accessToken / owner / repo）。' };
      }

      const attachments = ctx.lastUserAttachments || [];
      const imageAttachments = attachments.filter(a => a.type === 'image' && a.base64);
      if (imageAttachments.length === 0) return { success: false, error: '未找到图片附件。请在消息中附带图片后再调用此工具。' };
      const idx = typeof args.attachmentIndex === 'number' ? args.attachmentIndex : 0;
      if (idx < 0 || idx >= imageAttachments.length) return { success: false, error: `图片索引 ${idx} 超出范围，当前共 ${imageAttachments.length} 个图片附件。` };
      const attachment = imageAttachments[idx];
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

      const displayName = trimString(args.name) || attachment.name || filename;
      const newRecord: ImageRecord = {
        id: timestamp.toString(),
        filename,
        name: displayName,
        url: result.content.download_url,
        sha: result.content.sha,
        path: result.content.path,
        category: categoryResult.category.name,
        createdAt: Date.now(),
      };
      saveImageRecords([newRecord, ...readImageRecords()]);
      window.dispatchEvent(new CustomEvent('guyue:image-record-added', { detail: newRecord }));
      return {
        success: true,
        message: `图片已上传至图床：${displayName}`,
        image: toImageSummary(newRecord),
      };
    },
  },
  {
    name: 'update_image_record',
    module: 'image',
    tool: {
      name: 'update_image_record',
      description: '修改图床本地图片记录的名称、分类、URL、文件名等元数据。分类必须是已有分类。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图片记录 ID。' },
          name: { type: 'string', description: '新显示名称。' },
          categoryId: { type: 'string', description: '新分类 ID。' },
          category: { type: 'string', description: '新分类名称。' },
          url: { type: 'string', description: '新 URL。' },
          filename: { type: 'string', description: '新文件名。' },
          path: { type: 'string', description: '远程路径。' },
          sha: { type: 'string', description: '远程 SHA。' },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const id = trimString(args.id);
      const records = readImageRecords();
      const record = records.find(item => item.id === id);
      if (!record) return { success: false, error: `未找到图片记录「${id}」。` };
      const updates: Record<string, any> = {};
      for (const field of ['name', 'url', 'filename', 'path', 'sha']) {
        if (typeof args[field] === 'string') updates[field] = args[field].trim();
      }
      if (trimString(args.categoryId) || trimString(args.category)) {
        const categoryResult = requireCategoryName(args);
        if ('error' in categoryResult) return { success: false, error: categoryResult.error };
        updates.category = categoryResult.category.name;
      }
      const nextRecords = records.map(item => item.id === id ? { ...item, ...updates } : item);
      saveImageRecords(nextRecords);
      return { success: true, message: `图片记录「${record.name || record.filename}」已更新`, updated: { id, ...updates } };
    },
  },
  {
    name: 'delete_image_record',
    module: 'image',
    tool: {
      name: 'delete_image_record',
      description: '删除图床本地图片记录。注意：当前与 UI 行为一致，不删除远程仓库中的图片文件。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图片记录 ID。' },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const id = trimString(args.id);
      const records = readImageRecords();
      const record = records.find(item => item.id === id);
      if (!record) return { success: false, error: `未找到图片记录「${id}」。` };
      saveImageRecords(records.filter(item => item.id !== id));
      return { success: true, message: `图片记录「${record.name || record.filename}」已删除` };
    },
  },
  {
    name: 'rename_image_category',
    module: 'image',
    permission: { module: 'image', action: 'update' },
    tool: {
      name: 'rename_image_category',
      description: '兼容旧接口：重命名图床分类，会同步分类列表和图片记录。推荐使用 update_image_category。',
      inputSchema: {
        type: 'object',
        properties: {
          oldCategory: { type: 'string' },
          newCategory: { type: 'string' },
        },
        required: ['oldCategory', 'newCategory'],
      },
    },
    execute: async (args) => {
      const oldCategory = trimString(args.oldCategory);
      const newCategory = trimString(args.newCategory);
      if (!oldCategory || !newCategory || RESERVED_CATEGORY_NAMES.has(newCategory)) {
        return { success: false, error: 'oldCategory 和 newCategory 无效。' };
      }
      const categories = readImageCategories();
      const target = categories.find(category => category.name === oldCategory);
      if (target) {
        saveImageCategories(categories.map(category =>
          category.id === target.id ? { ...category, name: newCategory } : category,
        ));
      }
      let count = 0;
      const nextRecords = readImageRecords().map(record => {
        if (record.category !== oldCategory) return record;
        count += 1;
        return { ...record, category: newCategory };
      });
      saveImageRecords(nextRecords);
      return { success: true, message: `图床分类「${oldCategory}」已重命名为「${newCategory}」，影响 ${count} 条记录` };
    },
  },
];
