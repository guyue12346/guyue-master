import type { LatexFileCategory, LatexManagedFile, LatexTemplate } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';

const TEMPLATE_FALLBACK_CATEGORY = 'custom';

const getElectronAPI = () => (window as any).electronAPI;

const trimString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeTexFileName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('.tex') ? trimmed : `${trimmed}.tex`;
};

const fileCategoryOf = (file: LatexManagedFile) => file.category || '';
const templateCategoryOf = (template: LatexTemplate) => template.category || TEMPLATE_FALLBACK_CATEGORY;

const canReadLatexFileCategory = (ctx: Parameters<ToolRegistration['execute']>[1], categoryId: string) =>
  ctx.latexFileReadPermissions.includes('__all__') || ctx.latexFileReadPermissions.includes(categoryId);

const canWriteLatexFileCategory = (ctx: Parameters<ToolRegistration['execute']>[1], categoryId: string) =>
  ctx.latexFileWritePermissions.includes('__all__') || ctx.latexFileWritePermissions.includes(categoryId);

const canUseTemplateCategory = (ctx: Parameters<ToolRegistration['execute']>[1], category: string) =>
  ctx.latexTemplatePermissions.includes('__all__') || ctx.latexTemplatePermissions.includes(category);

const loadFileCategories = async (): Promise<LatexFileCategory[]> => {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.latexGetFileCategories) throw new Error('LaTeX 文件分类 API 不可用。');
  const categories = await electronAPI.latexGetFileCategories();
  return Array.isArray(categories) ? categories : [];
};

const loadManagedFiles = async (): Promise<LatexManagedFile[]> => {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.latexListFiles) throw new Error('LaTeX 文件 API 不可用。');
  const files = await electronAPI.latexListFiles();
  return Array.isArray(files) ? files : [];
};

const loadTemplates = async (): Promise<LatexTemplate[]> => {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.latexGetTemplates) throw new Error('LaTeX 模板 API 不可用。');
  const templates = await electronAPI.latexGetTemplates();
  return Array.isArray(templates) ? templates : [];
};

const findManagedFile = (files: LatexManagedFile[], filePath: unknown) => {
  const targetPath = trimString(filePath);
  return files.find(file => file.path === targetPath) || null;
};

const findTemplate = (templates: LatexTemplate[], templateId: unknown) => {
  const id = trimString(templateId);
  return templates.find(template => template.id === id) || null;
};

const requireFileCategory = (categories: LatexFileCategory[], categoryId: unknown) => {
  const id = trimString(categoryId);
  return id ? categories.find(category => category.id === id) || null : null;
};

const getTemplateCategories = (templates: LatexTemplate[]) => {
  const counts = new Map<string, number>();
  templates.forEach((template) => {
    const category = templateCategoryOf(template);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([id, count]) => ({ id, name: id, templateCount: count }));
};

const ensureTemplateCategoryExists = (templates: LatexTemplate[], category: string) =>
  templates.some(template => templateCategoryOf(template) === category);

const applyTemplateVariables = (content: string, variables: unknown) => {
  if (!Array.isArray(variables)) return content;
  return variables.reduce((next, item: any) => {
    const key = trimString(item?.key);
    if (!key) return next;
    const value = typeof item?.value === 'string' ? item.value : String(item?.value ?? '');
    return next.split(`{{${key}}}`).join(value);
  }, content);
};

export const LATEX_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'query_latex_file_categories',
    module: 'latex',
    tool: {
      name: 'query_latex_file_categories',
      description: '查询 LaTeX 托管文件分类列表（含唯一 ID 和文件数量）。创建或移动文件前必须先调用。',
      inputSchema: { type: 'object', properties: {} },
    },
    execute: async () => {
      const [categories, files] = await Promise.all([loadFileCategories(), loadManagedFiles()]);
      const counts = files.reduce((acc, file) => {
        const categoryId = fileCategoryOf(file);
        if (categoryId) acc[categoryId] = (acc[categoryId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return {
        success: true,
        categories: categories.map(category => ({ ...category, fileCount: counts[category.id] || 0 })),
      };
    },
  },
  {
    name: 'create_latex_file_category',
    module: 'latex',
    tool: {
      name: 'create_latex_file_category',
      description: '创建 LaTeX 托管文件分类。文件创建时必须选择已有分类。',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: '分类名称' } },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSaveFileCategories) return { success: false, error: 'LaTeX 文件分类保存 API 不可用。' };
      const name = trimString(args.name);
      if (!name || name === '未分类' || name === '默认' || name === '全部') return { success: false, error: '分类名称无效。' };
      const categories = await loadFileCategories();
      if (categories.some(category => category.name === name)) {
        return { success: false, error: `文件分类「${name}」已存在。` };
      }
      const category = { id: crypto.randomUUID(), name };
      const ok = await electronAPI.latexSaveFileCategories([...categories, category]);
      if (!ok) return { success: false, error: '分类保存失败。' };
      ctx.onAutoAuthLatexFileCategory(category.id);
      return { success: true, message: `文件分类「${name}」已创建并自动授权。`, category };
    },
  },
  {
    name: 'update_latex_file_category',
    module: 'latex',
    tool: {
      name: 'update_latex_file_category',
      description: '重命名 LaTeX 托管文件分类。分类 ID 保持不变。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['categoryId', 'name'],
      },
    },
    execute: async (args) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSaveFileCategories) return { success: false, error: 'LaTeX 文件分类保存 API 不可用。' };
      const categories = await loadFileCategories();
      const target = requireFileCategory(categories, args.categoryId);
      if (!target) return { success: false, error: '文件分类不存在。请先 query_latex_file_categories 获取 categoryId。' };
      const name = trimString(args.name);
      if (!name || name === '未分类' || name === '默认' || name === '全部') return { success: false, error: '分类名称无效。' };
      if (categories.some(category => category.id !== target.id && category.name === name)) {
        return { success: false, error: `文件分类「${name}」已存在。` };
      }
      const updated = categories.map(category => category.id === target.id ? { ...category, name } : category);
      const ok = await electronAPI.latexSaveFileCategories(updated);
      if (!ok) return { success: false, error: '分类保存失败。' };
      return { success: true, message: `文件分类「${target.name}」已重命名为「${name}」。`, category: { ...target, name } };
    },
  },
  {
    name: 'delete_latex_file_category',
    module: 'latex',
    tool: {
      name: 'delete_latex_file_category',
      description: '删除 LaTeX 托管文件分类。分类下有文件时必须传 fallbackCategoryId 迁移文件。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          fallbackCategoryId: { type: 'string', description: '有文件时迁移到的目标分类 ID' },
        },
        required: ['categoryId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSaveFileCategories || !electronAPI?.latexSetFileCategory) {
        return { success: false, error: 'LaTeX 文件分类 API 不可用。' };
      }
      const categories = await loadFileCategories();
      const target = requireFileCategory(categories, args.categoryId);
      if (!target) return { success: false, error: '文件分类不存在。请先 query_latex_file_categories 获取 categoryId。' };
      const remaining = categories.filter(category => category.id !== target.id);
      if (remaining.length === 0) return { success: false, error: '至少保留一个 LaTeX 文件分类。' };
      const files = await loadManagedFiles();
      const filesInCategory = files.filter(file => fileCategoryOf(file) === target.id);
      if (filesInCategory.length > 0) {
        const fallback = requireFileCategory(remaining, args.fallbackCategoryId);
        if (!fallback) return { success: false, error: `分类下有 ${filesInCategory.length} 个文件，必须提供有效 fallbackCategoryId。` };
        if (!canWriteLatexFileCategory(ctx, target.id) || !canWriteLatexFileCategory(ctx, fallback.id)) {
          return { success: false, error: 'LaTeX 文件分类迁移未授权。' };
        }
        for (const file of filesInCategory) {
          await electronAPI.latexSetFileCategory({ filePath: file.path, categoryId: fallback.id });
        }
      }
      const ok = await electronAPI.latexSaveFileCategories(remaining);
      if (!ok) return { success: false, error: '分类删除失败。' };
      return { success: true, message: `文件分类「${target.name}」已删除。`, movedFileCount: filesInCategory.length };
    },
  },
  {
    name: 'query_latex_files',
    module: 'latex',
    tool: {
      name: 'query_latex_files',
      description: '查询 LaTeX 托管文件列表。可按分类 ID 或文件名搜索。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          keyword: { type: 'string' },
        },
      },
    },
    execute: async (args, ctx) => {
      if (ctx.latexFileReadPermissions.length === 0) return { success: false, error: 'LaTeX 文件读取未授权。' };
      let files = await loadManagedFiles();
      const categories = await loadFileCategories();
      const categoryById = new Map(categories.map(category => [category.id, category]));
      files = files.filter(file => canReadLatexFileCategory(ctx, fileCategoryOf(file)));
      if (trimString(args.categoryId)) {
        const categoryId = trimString(args.categoryId);
        if (!canReadLatexFileCategory(ctx, categoryId)) return { success: false, error: `分类「${categoryId}」未授权读取。` };
        files = files.filter(file => fileCategoryOf(file) === categoryId);
      }
      if (trimString(args.keyword)) {
        const keyword = trimString(args.keyword).toLowerCase();
        files = files.filter(file => file.name.toLowerCase().includes(keyword));
      }
      return {
        success: true,
        total: files.length,
        files: files.map(file => {
          const categoryId = fileCategoryOf(file);
          return {
            name: file.name,
            path: file.path,
            size: file.size,
            modifiedAt: file.modifiedAt,
            categoryId: categoryId || null,
            categoryName: categoryById.get(categoryId)?.name || null,
            writable: canWriteLatexFileCategory(ctx, categoryId),
          };
        }),
      };
    },
  },
  {
    name: 'create_latex_file',
    module: 'latex',
    tool: {
      name: 'create_latex_file',
      description: '新建 LaTeX 托管文件。必须指定已有文件分类 categoryId；可传 content 覆盖默认内容。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          categoryId: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['name', 'categoryId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexNewManagedFile || !electronAPI?.latexSaveManagedFile || !electronAPI?.latexSetFileCategory) {
        return { success: false, error: 'LaTeX 文件 API 不可用。' };
      }
      const categories = await loadFileCategories();
      const category = requireFileCategory(categories, args.categoryId);
      if (!category) return { success: false, error: '必须指定已有文件分类。请先 query_latex_file_categories 获取 categoryId。' };
      if (!canWriteLatexFileCategory(ctx, category.id)) return { success: false, error: `分类「${category.name}」未授权写入。` };
      const name = normalizeTexFileName(trimString(args.name));
      if (!name) return { success: false, error: '文件名不能为空。' };
      const result = await electronAPI.latexNewManagedFile(name);
      if (!result) return { success: false, error: '文件创建失败。' };
      const content = typeof args.content === 'string' ? args.content : result.content;
      if (content !== result.content) await electronAPI.latexSaveManagedFile({ filePath: result.path, content });
      await electronAPI.latexSetFileCategory({ filePath: result.path, categoryId: category.id });
      return { success: true, message: `LaTeX 文件「${name}」已创建。`, file: { name, path: result.path, categoryId: category.id, content } };
    },
  },
  {
    name: 'create_latex_file_from_template',
    module: 'latex',
    tool: {
      name: 'create_latex_file_from_template',
      description: '读取 LaTeX 模板内容，并用该模板新建托管文件。必须指定目标文件分类 categoryId。',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          name: { type: 'string', description: '新文件名，可不带 .tex' },
          categoryId: { type: 'string', description: '目标文件分类 ID' },
          variables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['key', 'value'],
            },
            description: '可选模板变量替换，将模板中的 {{key}} 替换为 value。',
          },
        },
        required: ['templateId', 'name', 'categoryId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexNewManagedFile || !electronAPI?.latexSaveManagedFile || !electronAPI?.latexSetFileCategory) {
        return { success: false, error: 'LaTeX 文件 API 不可用。' };
      }
      const [templates, categories] = await Promise.all([loadTemplates(), loadFileCategories()]);
      const template = findTemplate(templates, args.templateId);
      if (!template) return { success: false, error: '模板不存在。请先 query_latex_templates 获取 templateId。' };
      const templateCategory = templateCategoryOf(template);
      if (!canUseTemplateCategory(ctx, templateCategory)) return { success: false, error: `模板分类「${templateCategory}」未授权读取。` };
      const category = requireFileCategory(categories, args.categoryId);
      if (!category) return { success: false, error: '目标文件分类不存在。请先 query_latex_file_categories 获取 categoryId。' };
      if (!canWriteLatexFileCategory(ctx, category.id)) return { success: false, error: `文件分类「${category.name}」未授权写入。` };
      const name = normalizeTexFileName(trimString(args.name));
      if (!name) return { success: false, error: '文件名不能为空。' };
      const content = applyTemplateVariables(template.content || '', args.variables);
      const result = await electronAPI.latexNewManagedFile(name);
      if (!result) return { success: false, error: '文件创建失败。' };
      await electronAPI.latexSaveManagedFile({ filePath: result.path, content });
      await electronAPI.latexSetFileCategory({ filePath: result.path, categoryId: category.id });
      return {
        success: true,
        message: `已用模板「${template.name}」新建文件「${name}」。`,
        file: { name, path: result.path, categoryId: category.id, content },
        template: { id: template.id, name: template.name, category: templateCategory },
      };
    },
  },
  {
    name: 'read_latex_file',
    module: 'latex',
    tool: {
      name: 'read_latex_file',
      description: '读取 LaTeX 托管文件完整内容。通过 query_latex_files 返回的 path 定位。',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexOpenManagedFile) return { success: false, error: 'LaTeX 文件读取 API 不可用。' };
      const files = await loadManagedFiles();
      const file = findManagedFile(files, args.filePath);
      if (!file) return { success: false, error: '文件不存在。请先 query_latex_files 获取 filePath。' };
      const categoryId = fileCategoryOf(file);
      if (!canReadLatexFileCategory(ctx, categoryId)) return { success: false, error: 'LaTeX 文件读取未授权。' };
      const result = await electronAPI.latexOpenManagedFile(file.path);
      if (!result) return { success: false, error: '文件读取失败。' };
      return {
        success: true,
        name: file.name,
        path: result.path,
        categoryId: categoryId || null,
        content: result.content,
        length: result.content.length,
        writable: canWriteLatexFileCategory(ctx, categoryId),
      };
    },
  },
  {
    name: 'edit_latex_file',
    module: 'latex',
    tool: {
      name: 'edit_latex_file',
      description: '修改 LaTeX 托管文件完整内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['filePath', 'content'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSaveManagedFile) return { success: false, error: 'LaTeX 文件保存 API 不可用。' };
      const files = await loadManagedFiles();
      const file = findManagedFile(files, args.filePath);
      if (!file) return { success: false, error: '文件不存在。请先 query_latex_files 获取 filePath。' };
      const categoryId = fileCategoryOf(file);
      if (!canWriteLatexFileCategory(ctx, categoryId)) return { success: false, error: 'LaTeX 文件编辑未授权。' };
      const ok = await electronAPI.latexSaveManagedFile({ filePath: file.path, content: String(args.content ?? '') });
      if (!ok) return { success: false, error: '文件保存失败。' };
      return { success: true, message: `文件「${file.name}」已更新。`, length: String(args.content ?? '').length };
    },
  },
  {
    name: 'rename_latex_file',
    module: 'latex',
    tool: {
      name: 'rename_latex_file',
      description: '重命名 LaTeX 托管文件。该操作会触发确认。',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          newName: { type: 'string' },
        },
        required: ['filePath', 'newName'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexRenameManagedFile) return { success: false, error: 'LaTeX 文件重命名 API 不可用。' };
      const files = await loadManagedFiles();
      const file = findManagedFile(files, args.filePath);
      if (!file) return { success: false, error: '文件不存在。请先 query_latex_files 获取 filePath。' };
      const categoryId = fileCategoryOf(file);
      if (!canWriteLatexFileCategory(ctx, categoryId)) return { success: false, error: 'LaTeX 文件重命名未授权。' };
      const newName = normalizeTexFileName(trimString(args.newName));
      if (!newName) return { success: false, error: '新文件名不能为空。' };
      const newPath = await electronAPI.latexRenameManagedFile({ filePath: file.path, newName });
      if (!newPath) return { success: false, error: '文件重命名失败。' };
      if (categoryId && electronAPI.latexSetFileCategory) {
        await electronAPI.latexSetFileCategory({ filePath: newPath, categoryId });
      }
      return { success: true, message: `文件「${file.name}」已重命名为「${newName}」。`, oldPath: file.path, path: newPath };
    },
  },
  {
    name: 'move_latex_file',
    module: 'latex',
    tool: {
      name: 'move_latex_file',
      description: '移动 LaTeX 托管文件到另一个文件分类。该操作会触发确认。',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          categoryId: { type: 'string' },
        },
        required: ['filePath', 'categoryId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSetFileCategory) return { success: false, error: 'LaTeX 文件分类设置 API 不可用。' };
      const [files, categories] = await Promise.all([loadManagedFiles(), loadFileCategories()]);
      const file = findManagedFile(files, args.filePath);
      if (!file) return { success: false, error: '文件不存在。请先 query_latex_files 获取 filePath。' };
      const target = requireFileCategory(categories, args.categoryId);
      if (!target) return { success: false, error: '目标文件分类不存在。' };
      const currentCategoryId = fileCategoryOf(file);
      if (!canWriteLatexFileCategory(ctx, currentCategoryId) || !canWriteLatexFileCategory(ctx, target.id)) {
        return { success: false, error: 'LaTeX 文件移动未授权。' };
      }
      const ok = await electronAPI.latexSetFileCategory({ filePath: file.path, categoryId: target.id });
      if (!ok) return { success: false, error: '文件移动失败。' };
      return { success: true, message: `文件「${file.name}」已移动到「${target.name}」。`, filePath: file.path, categoryId: target.id };
    },
  },
  {
    name: 'delete_latex_file',
    module: 'latex',
    tool: {
      name: 'delete_latex_file',
      description: '删除 LaTeX 托管文件。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexDeleteManagedFile) return { success: false, error: 'LaTeX 文件删除 API 不可用。' };
      const files = await loadManagedFiles();
      const file = findManagedFile(files, args.filePath);
      if (!file) return { success: false, error: '文件不存在。请先 query_latex_files 获取 filePath。' };
      const categoryId = fileCategoryOf(file);
      if (!canWriteLatexFileCategory(ctx, categoryId)) return { success: false, error: 'LaTeX 文件删除未授权。' };
      const ok = await electronAPI.latexDeleteManagedFile(file.path);
      if (!ok) return { success: false, error: '文件删除失败。' };
      return { success: true, message: `文件「${file.name}」已删除。`, filePath: file.path };
    },
  },
  {
    name: 'query_latex_template_categories',
    module: 'latex',
    tool: {
      name: 'query_latex_template_categories',
      description: '查询 LaTeX 模板分类列表。模板分类 ID 即分类名称字符串。',
      inputSchema: { type: 'object', properties: {} },
    },
    execute: async () => {
      const templates = await loadTemplates();
      return { success: true, categories: getTemplateCategories(templates) };
    },
  },
  {
    name: 'create_latex_template_category',
    module: 'latex',
    tool: {
      name: 'create_latex_template_category',
      description: '创建 LaTeX 模板分类。当前模板库以模板 category 字段表示分类，因此会创建一个占位模板。',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSaveTemplate) return { success: false, error: 'LaTeX 模板保存 API 不可用。' };
      const name = trimString(args.name);
      if (!name || name === '未分类' || name === '默认' || name === '全部') return { success: false, error: '模板分类名称无效。' };
      const templates = await loadTemplates();
      if (ensureTemplateCategoryExists(templates, name)) return { success: false, error: `模板分类「${name}」已存在。` };
      const placeholder: LatexTemplate = {
        id: `cat-${Date.now()}`,
        name: '新模板',
        description: '分类占位模板，可编辑或删除。',
        content: '% 新模板\n\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n',
        category: name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ok = await electronAPI.latexSaveTemplate(placeholder);
      if (!ok) return { success: false, error: '模板分类创建失败。' };
      ctx.onAutoAuthLatexTemplateCategory(name);
      return { success: true, message: `模板分类「${name}」已创建并自动授权。`, categoryId: name, placeholderTemplateId: placeholder.id };
    },
  },
  {
    name: 'rename_latex_template_category',
    module: 'latex',
    tool: {
      name: 'rename_latex_template_category',
      description: '重命名 LaTeX 模板分类，会批量更新该分类下模板的 category 字段。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          newCategory: { type: 'string' },
        },
        required: ['category', 'newCategory'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexRenameCategory) return { success: false, error: 'LaTeX 模板分类重命名 API 不可用。' };
      const category = trimString(args.category);
      const newCategory = trimString(args.newCategory);
      if (!category || !newCategory) return { success: false, error: '分类名称不能为空。' };
      if (!canUseTemplateCategory(ctx, category)) return { success: false, error: `模板分类「${category}」未授权。` };
      const templates = await loadTemplates();
      if (!ensureTemplateCategoryExists(templates, category)) return { success: false, error: `模板分类「${category}」不存在。` };
      if (ensureTemplateCategoryExists(templates, newCategory)) return { success: false, error: `模板分类「${newCategory}」已存在。` };
      const ok = await electronAPI.latexRenameCategory({ oldName: category, newName: newCategory });
      if (!ok) return { success: false, error: '模板分类重命名失败。' };
      ctx.onAutoAuthLatexTemplateCategory(newCategory);
      return { success: true, message: `模板分类「${category}」已重命名为「${newCategory}」。` };
    },
  },
  {
    name: 'delete_latex_template_category',
    module: 'latex',
    tool: {
      name: 'delete_latex_template_category',
      description: '删除 LaTeX 模板分类。分类下模板会移动到 fallbackCategory。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          fallbackCategory: { type: 'string' },
        },
        required: ['category', 'fallbackCategory'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexDeleteCategory) return { success: false, error: 'LaTeX 模板分类删除 API 不可用。' };
      const category = trimString(args.category);
      const fallbackCategory = trimString(args.fallbackCategory);
      if (!category || !fallbackCategory || category === fallbackCategory) return { success: false, error: '分类和迁移分类无效。' };
      const templates = await loadTemplates();
      if (!ensureTemplateCategoryExists(templates, category)) return { success: false, error: `模板分类「${category}」不存在。` };
      if (!ensureTemplateCategoryExists(templates, fallbackCategory)) return { success: false, error: `迁移目标分类「${fallbackCategory}」不存在。` };
      if (!canUseTemplateCategory(ctx, category) || !canUseTemplateCategory(ctx, fallbackCategory)) {
        return { success: false, error: '模板分类删除或迁移未授权。' };
      }
      const movedCount = templates.filter(template => templateCategoryOf(template) === category).length;
      const ok = await electronAPI.latexDeleteCategory({ categoryName: category, moveToCategory: fallbackCategory });
      if (!ok) return { success: false, error: '模板分类删除失败。' };
      return { success: true, message: `模板分类「${category}」已删除。`, movedTemplateCount: movedCount };
    },
  },
  {
    name: 'query_latex_templates',
    module: 'latex',
    tool: {
      name: 'query_latex_templates',
      description: '查询 LaTeX 模板列表。可按分类和关键词筛选；不返回完整模板内容。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          keyword: { type: 'string' },
        },
      },
    },
    execute: async (args, ctx) => {
      if (ctx.latexTemplatePermissions.length === 0) return { success: false, error: 'LaTeX 模板读取未授权。' };
      let templates = await loadTemplates();
      templates = templates.filter(template => canUseTemplateCategory(ctx, templateCategoryOf(template)));
      if (trimString(args.category)) {
        const category = trimString(args.category);
        if (!canUseTemplateCategory(ctx, category)) return { success: false, error: `模板分类「${category}」未授权。` };
        templates = templates.filter(template => templateCategoryOf(template) === category);
      }
      if (trimString(args.keyword)) {
        const keyword = trimString(args.keyword).toLowerCase();
        templates = templates.filter(template =>
          template.name.toLowerCase().includes(keyword) ||
          (template.description || '').toLowerCase().includes(keyword),
        );
      }
      return {
        success: true,
        total: templates.length,
        templates: templates.map(template => ({
          id: template.id,
          name: template.name,
          description: template.description || null,
          category: templateCategoryOf(template),
          hasContent: Boolean(template.content),
          length: (template.content || '').length,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        })),
      };
    },
  },
  {
    name: 'read_latex_template',
    module: 'latex',
    tool: {
      name: 'read_latex_template',
      description: '读取 LaTeX 模板完整内容。通过 query_latex_templates 返回的 templateId 定位。',
      inputSchema: {
        type: 'object',
        properties: { templateId: { type: 'string' } },
        required: ['templateId'],
      },
    },
    execute: async (args, ctx) => {
      const templates = await loadTemplates();
      const template = findTemplate(templates, args.templateId);
      if (!template) return { success: false, error: '模板不存在。请先 query_latex_templates 获取 templateId。' };
      const category = templateCategoryOf(template);
      if (!canUseTemplateCategory(ctx, category)) return { success: false, error: `模板分类「${category}」未授权读取。` };
      return {
        success: true,
        id: template.id,
        name: template.name,
        description: template.description || null,
        category,
        content: template.content,
        length: (template.content || '').length,
      };
    },
  },
  {
    name: 'create_latex_template',
    module: 'latex',
    tool: {
      name: 'create_latex_template',
      description: '创建 LaTeX 模板。必须指定已有模板分类 category。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['name', 'category', 'content'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSaveTemplate) return { success: false, error: 'LaTeX 模板保存 API 不可用。' };
      const templates = await loadTemplates();
      const category = trimString(args.category);
      if (!category) return { success: false, error: '模板分类不能为空。' };
      if (!ensureTemplateCategoryExists(templates, category)) return { success: false, error: `模板分类「${category}」不存在，请先 create_latex_template_category。` };
      if (!canUseTemplateCategory(ctx, category)) return { success: false, error: `模板分类「${category}」未授权写入。` };
      const name = trimString(args.name);
      if (!name) return { success: false, error: '模板名称不能为空。' };
      const template: LatexTemplate = {
        id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        description: trimString(args.description) || undefined,
        content: typeof args.content === 'string' ? args.content : '',
        category,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ok = await electronAPI.latexSaveTemplate(template);
      if (!ok) return { success: false, error: '模板保存失败。' };
      return { success: true, message: `模板「${name}」已创建。`, template: { id: template.id, name, category } };
    },
  },
  {
    name: 'edit_latex_template',
    module: 'latex',
    tool: {
      name: 'edit_latex_template',
      description: '修改 LaTeX 模板名称、描述、分类或完整内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['templateId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexSaveTemplate) return { success: false, error: 'LaTeX 模板保存 API 不可用。' };
      const templates = await loadTemplates();
      const template = findTemplate(templates, args.templateId);
      if (!template) return { success: false, error: '模板不存在。请先 query_latex_templates 获取 templateId。' };
      const oldCategory = templateCategoryOf(template);
      if (!canUseTemplateCategory(ctx, oldCategory)) return { success: false, error: `模板分类「${oldCategory}」未授权编辑。` };
      const nextCategory = trimString(args.category) || oldCategory;
      if (nextCategory !== oldCategory) {
        if (!ensureTemplateCategoryExists(templates, nextCategory)) return { success: false, error: `目标模板分类「${nextCategory}」不存在。` };
        if (!canUseTemplateCategory(ctx, nextCategory)) return { success: false, error: `目标模板分类「${nextCategory}」未授权。` };
      }
      const updated: LatexTemplate = {
        ...template,
        name: trimString(args.name) || template.name,
        description: typeof args.description === 'string' ? (args.description.trim() || undefined) : template.description,
        category: nextCategory,
        content: typeof args.content === 'string' ? args.content : template.content,
        updatedAt: Date.now(),
      };
      const ok = await electronAPI.latexSaveTemplate(updated);
      if (!ok) return { success: false, error: '模板保存失败。' };
      return { success: true, message: `模板「${updated.name}」已更新。`, template: { id: updated.id, name: updated.name, category: nextCategory } };
    },
  },
  {
    name: 'delete_latex_template',
    module: 'latex',
    tool: {
      name: 'delete_latex_template',
      description: '删除 LaTeX 模板。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: { templateId: { type: 'string' } },
        required: ['templateId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = getElectronAPI();
      if (!electronAPI?.latexDeleteTemplate) return { success: false, error: 'LaTeX 模板删除 API 不可用。' };
      const templates = await loadTemplates();
      const template = findTemplate(templates, args.templateId);
      if (!template) return { success: false, error: '模板不存在。请先 query_latex_templates 获取 templateId。' };
      const category = templateCategoryOf(template);
      if (!canUseTemplateCategory(ctx, category)) return { success: false, error: `模板分类「${category}」未授权删除。` };
      const ok = await electronAPI.latexDeleteTemplate(template.id);
      if (!ok) return { success: false, error: '模板删除失败。' };
      return { success: true, message: `模板「${template.name}」已删除。`, templateId: template.id };
    },
  },
];
