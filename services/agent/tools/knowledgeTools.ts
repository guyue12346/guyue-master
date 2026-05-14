import { buildIndex, loadRagIndex, saveRagIndex, searchIndex } from '../../../utils/ragService';
import type { ToolRegistration } from '../toolRegistry';
import { getEmbeddingKeyFromProfiles, normalizeLimit } from './toolUtils';

export const KNOWLEDGE_TOOL_REGISTRATIONS: ToolRegistration[] = [
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
];
