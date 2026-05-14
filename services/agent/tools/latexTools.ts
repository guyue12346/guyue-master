import type { LatexFileCategory, LatexManagedFile, LatexTemplate } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';

export const LATEX_TOOL_REGISTRATIONS: ToolRegistration[] = [
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
