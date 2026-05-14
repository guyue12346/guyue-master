import type { ToolRegistration } from '../toolRegistry';
import {
  agentNowId,
  loadAgentCanvasCategories,
  loadAgentCanvasDrawings,
  saveAgentCanvasCategories,
  saveAgentCanvasDrawings,
  type AgentCanvasCategoryMeta,
  type AgentDrawingFile,
} from './localData';

const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

export const CANVAS_TOOL_REGISTRATIONS: ToolRegistration[] = [
  // ─── 画布工具 ───
  {
    name: 'query_canvas_categories',
    module: 'canvas',
    tool: {
      name: 'query_canvas_categories',
      description: '查询画布分类列表及每个分类下的画布数量。',
      inputSchema: { type: 'object', properties: {} },
    },
    execute: async () => {
      const [categories, drawings] = await Promise.all([loadAgentCanvasCategories(), loadAgentCanvasDrawings()]);
      const counts = drawings.reduce((acc, drawing) => {
        const name = drawing.category || '';
        if (name) acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return { success: true, categories: categories.map(category => ({ ...category, canvasCount: counts[category.name] || 0 })) };
    },
  },
  {
    name: 'create_canvas_category',
    module: 'canvas',
    tool: {
      name: 'create_canvas_category',
      description: '创建画布分类，可设置 lucide 图标名和颜色。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          icon: { type: 'string', description: 'Lucide 图标名，默认 Layers' },
          color: { type: 'string', description: '十六进制颜色，例如 #3b82f6' },
        },
        required: ['name'],
      },
    },
    execute: async (args) => {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name || name === '未分类' || name === '全部') return { success: false, error: '画布分类名称无效。' };
      const categories = await loadAgentCanvasCategories();
      if (categories.some(category => category.name === name)) return { success: false, error: `画布分类「${name}」已存在。` };
      const category: AgentCanvasCategoryMeta = {
        name,
        icon: typeof args.icon === 'string' && args.icon.trim() ? args.icon.trim() : 'Layers',
        color: typeof args.color === 'string' && /^#[0-9a-f]{6}$/i.test(args.color.trim()) ? args.color.trim() : '#3b82f6',
      };
      saveAgentCanvasCategories([...categories, category]);
      return { success: true, message: `画布分类「${name}」已创建。`, category };
    },
  },
  {
    name: 'query_canvases',
    module: 'canvas',
    tool: {
      name: 'query_canvases',
      description: '查询画布库中的画布元数据。可按分类或关键词过滤；不会返回完整 Excalidraw 场景数据。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          keyword: { type: 'string' },
          limit: { type: 'number' },
        },
      },
    },
    execute: async (args) => {
      let drawings = await loadAgentCanvasDrawings();
      if (typeof args.category === 'string' && args.category.trim()) {
        const category = args.category.trim();
        drawings = drawings.filter(drawing => drawing.category === category);
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const keyword = args.keyword.trim().toLowerCase();
        drawings = drawings.filter(drawing => drawing.name.toLowerCase().includes(keyword));
      }
      drawings.sort((a, b) => b.updatedAt - a.updatedAt);
      const limit = normalizeLimit(args.limit, 20, 80);
      return {
        success: true,
        total: drawings.length,
        canvases: drawings.slice(0, limit).map(drawing => ({
          id: drawing.id,
          name: drawing.name,
          category: drawing.category || null,
          elementCount: Array.isArray(drawing.data?.elements) ? drawing.data.elements.length : 0,
          createdAt: drawing.createdAt,
          updatedAt: drawing.updatedAt,
        })),
      };
    },
  },
  {
    name: 'create_canvas',
    module: 'canvas',
    tool: {
      name: 'create_canvas',
      description: '创建一个空白画布。必须指定已有画布分类 category；如果分类不存在，请先 create_canvas_category。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['name', 'category'],
      },
    },
    execute: async (args) => {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      const category = typeof args.category === 'string' ? args.category.trim() : '';
      if (!name) return { success: false, error: '画布名称不能为空。' };
      if (!category) return { success: false, error: '必须指定画布分类。' };
      const categories = await loadAgentCanvasCategories();
      if (!categories.some(item => item.name === category)) return { success: false, error: `画布分类「${category}」不存在，请先 create_canvas_category。` };
      const drawings = await loadAgentCanvasDrawings();
      const drawing: AgentDrawingFile = {
        id: agentNowId('draw'),
        name,
        category,
        data: { elements: [], appState: {}, files: {} },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveAgentCanvasDrawings([drawing, ...drawings], drawing.id);
      return { success: true, message: `画布「${name}」已创建。`, canvas: { id: drawing.id, name, category } };
    },
  },
  {
    name: 'update_canvas_meta',
    module: 'canvas',
    tool: {
      name: 'update_canvas_meta',
      description: '修改画布名称或分类。不会改动绘图内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const drawings = await loadAgentCanvasDrawings();
      const target = drawings.find(drawing => drawing.id === args.id);
      if (!target) return { success: false, error: `未找到画布「${args.id}」。` };
      const categories = await loadAgentCanvasCategories();
      const nextCategory = typeof args.category === 'string' && args.category.trim() ? args.category.trim() : target.category;
      if (nextCategory && !categories.some(category => category.name === nextCategory)) {
        return { success: false, error: `画布分类「${nextCategory}」不存在。` };
      }
      const updated: AgentDrawingFile = {
        ...target,
        name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : target.name,
        category: nextCategory,
        updatedAt: Date.now(),
      };
      saveAgentCanvasDrawings(drawings.map(drawing => drawing.id === updated.id ? updated : drawing));
      return { success: true, message: `画布「${updated.name}」已更新。`, canvas: { id: updated.id, name: updated.name, category: updated.category || null } };
    },
  },
  {
    name: 'delete_canvas',
    module: 'canvas',
    tool: {
      name: 'delete_canvas',
      description: '删除画布。该操作会触发确认和快照回退。',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
    execute: async (args) => {
      const drawings = await loadAgentCanvasDrawings();
      const target = drawings.find(drawing => drawing.id === args.id);
      if (!target) return { success: false, error: `未找到画布「${args.id}」。` };
      saveAgentCanvasDrawings(drawings.filter(drawing => drawing.id !== target.id));
      return { success: true, message: `画布「${target.name}」已删除。` };
    },
  },

];
