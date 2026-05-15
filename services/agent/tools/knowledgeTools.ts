import type { ToolRegistration } from '../toolRegistry';
import {
  AGENT_KNOWLEDGE_COLLECTION_ID,
  buildRagCollectionIndex,
  getRagFileIndexMetadata,
  listRagCollections,
  listRagCollectionFiles,
  listRagQueryProfiles,
  queryRagKnowledge,
  searchRagCollection,
} from '../../rag';
import { getEmbeddingConfigFromProfiles, normalizeLimit } from './toolUtils';

const getKnowledgeFiles = (ctx: Parameters<ToolRegistration['execute']>[1]) => {
  const kbFileIds = ctx.knowledgeBaseFileIds ?? new Set<string>();
  if (kbFileIds.size === 0) return [];
  return ctx.fileRecords
    .filter(file => kbFileIds.has(file.id))
    .map(file => ({
      id: file.id,
      name: file.name,
      path: file.path,
      type: file.type as any,
      size: file.size,
    }));
};

const assertEmbeddingConfig = () => {
  const config = getEmbeddingConfigFromProfiles();
  if (!config || (!config.apiKey && config.provider !== 'ollama')) {
    return {
      ok: false as const,
      error: '未配置知识库 Embedding API。请在 RAG Lab 或全局 API 配置中添加可用的 Embedding 配置。',
    };
  }
  return { ok: true as const, config };
};

export const KNOWLEDGE_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
      name: 'list_rag_collections',
      module: 'knowledge',
      permission: { module: 'knowledge', action: 'read' },
      tool: {
        name: 'list_rag_collections',
        description: '列出用户已经构建的 RAG 向量库集合及其查询方案。需要基于用户知识库回答问题前，可以先调用它了解有哪些可搜索的集合。',
        inputSchema: {
          type: 'object',
          properties: {
            includeProfiles: { type: 'boolean', description: '是否返回每个集合的查询方案，默认 true' },
          },
        },
      },
      execute: async (args) => {
        try {
          const includeProfiles = args.includeProfiles !== false;
          const collections = await listRagCollections();
          const data = await Promise.all(collections.map(async collection => ({
            id: collection.id,
            name: collection.name,
            source: collection.source,
            vectorCount: collection.vectorCount,
            fileCount: collection.fileCount,
            embeddingProvider: collection.embeddingProvider,
            embeddingModel: collection.embeddingModel,
            updatedAt: collection.updatedAt,
            profiles: includeProfiles
              ? (await listRagQueryProfiles(collection.id)).map(profile => ({
                  id: profile.id,
                  name: profile.name,
                  retrieval: profile.retrieval.strategy,
                  topK: profile.retrieval.topK,
                  reranker: profile.reranker.type,
                  preRetrieval: profile.preRetrieval.strategy,
                }))
              : undefined,
          })));
          return {
            success: true,
            data,
            message: `当前共有 ${data.length} 个 RAG 向量库集合。`,
          };
        } catch (e) {
          return { success: false, error: `读取 RAG 向量库列表失败：${(e as Error).message}` };
        }
      },
    },
  {
      name: 'search_rag_collections',
      module: 'knowledge',
      permission: { module: 'knowledge', action: 'read' },
      tool: {
        name: 'search_rag_collections',
        description: '搜索用户在 RAG Studio 中构建的向量库集合。适合回答“我的知识库/资料/文档里有没有提到...”这类问题。collectionIds 不传时会搜索所有已构建集合。',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索问题或关键词，使用自然语言描述要查找的内容' },
            collectionIds: { type: 'array', items: { type: 'string' }, description: '可选，指定要搜索的 RAG 集合 ID；不传则搜索全部有向量的集合' },
            queryProfileId: { type: 'string', description: '可选，指定集合内保存的查询方案 ID；不传使用集合默认方案' },
            topK: { type: 'number', description: '返回最相关片段数量，默认 5，最多 20' },
          },
          required: ['query'],
        },
      },
      execute: async (args) => {
        const query = String(args.query || '').trim();
        if (!query) return { success: false, error: '搜索问题不能为空。' };
        try {
          const fallbackEmbedding = getEmbeddingConfigFromProfiles() || undefined;
          const allCollections = await listRagCollections();
          const requestedIds = Array.isArray(args.collectionIds)
            ? args.collectionIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
            : [];
          const collectionIds = (requestedIds.length > 0
            ? requestedIds
            : allCollections.filter(collection => collection.vectorCount > 0).map(collection => collection.id)
          );
          if (collectionIds.length === 0) {
            return { success: false, error: '没有可搜索的 RAG 向量库。请先在 RAG Studio 构建向量库。' };
          }

          const topK = normalizeLimit(args.topK, 5, 20);
          const response = await queryRagKnowledge({
            collectionIds,
            query,
            fallbackEmbeddingConfig: fallbackEmbedding,
            queryProfileId: typeof args.queryProfileId === 'string' ? args.queryProfileId : undefined,
            topK,
          });
          const collectionNameById = new Map(allCollections.map(collection => [collection.id, collection.name]));
          const results = response.results.slice(0, topK).map(result => ({
            collectionId: result.metadata?.collectionId,
            collectionName: collectionNameById.get(result.metadata?.collectionId) || result.metadata?.collectionId,
            source: result.fileName,
            filePath: result.filePath,
            relevance: Math.round(result.score * 1000) / 1000,
            content: result.text,
            chunkIndex: result.metadata?.chunkIndex,
          }));
          return {
            success: true,
            results,
            errors: response.errors?.length ? response.errors : undefined,
            message: results.length
              ? `找到 ${results.length} 条相关内容。请基于内容回答，并注明来源文件和知识库。`
              : '未在指定 RAG 向量库中找到相关内容。',
          };
        } catch (e) {
          return { success: false, error: `RAG 向量库搜索失败：${(e as Error).message}` };
        }
      },
    },
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
        const embedding = assertEmbeddingConfig();
        if (!embedding.ok) return { success: false, error: embedding.error };

        const kbFiles = getKnowledgeFiles(ctx);
        if (kbFiles.length === 0) {
          return { success: false, error: '知识库中没有文件。请先在文件管理模块中悬停文件、点击绿色脑图标将文件加入知识库。' };
        }
        try {
          const progressLogs: string[] = [];
          await buildRagCollectionIndex({
            collectionId: AGENT_KNOWLEDGE_COLLECTION_ID,
            collectionName: 'Agent 文件知识库',
            files: kbFiles,
            embeddingConfig: embedding.config,
            source: 'agent',
            options: {
              onProgress: (stage, done, total) => {
                if (stage === 'loading' && kbFiles[done]) {
                  progressLogs.push(`正在索引：${kbFiles[done].name} (${done + 1}/${total})`);
                }
              },
            },
          });

          const topK = normalizeLimit(args.topK, 5, 10);
          const { results } = await searchRagCollection({
            collectionId: AGENT_KNOWLEDGE_COLLECTION_ID,
            query: String(args.query || ''),
            embeddingConfig: embedding.config,
            options: { topK, strategy: 'hybrid' },
          });
          if (results.length === 0) {
            return { success: true, results: [], message: '知识库中未找到与该问题相关的内容。', indexLog: progressLogs };
          }
          const formatted = results.map(r => ({
            source: r.fileName,
            filePath: r.filePath,
            relevance: Math.round(r.score * 100) / 100,
            content: r.text,
            indexedAt: r.metadata?.indexedAt,
            chunkIndex: r.metadata?.chunkIndex,
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
        const embedding = assertEmbeddingConfig();
        if (!embedding.ok) return { success: false, error: embedding.error };

        const kbFiles = getKnowledgeFiles(ctx);
        if (kbFiles.length === 0) {
          return { success: false, error: '知识库中没有文件，请先在文件管理模块添加文件。' };
        }
        try {
          const progressLogs: string[] = [];
          const result = await buildRagCollectionIndex({
            collectionId: AGENT_KNOWLEDGE_COLLECTION_ID,
            collectionName: 'Agent 文件知识库',
            files: kbFiles,
            embeddingConfig: embedding.config,
            source: 'agent',
            options: {
              onProgress: (stage, done, total) => {
                if (stage === 'loading' && kbFiles[done]) {
                  progressLogs.push(`正在索引：${kbFiles[done].name} (${done + 1}/${total})`);
                }
              },
            },
          });
          const files = await listRagCollectionFiles(AGENT_KNOWLEDGE_COLLECTION_ID);
          return {
            success: true,
            message: `知识库索引构建完成。共 ${result.totalFiles} 个文件，${result.totalChunks} 个文本块。`,
            data: {
              collectionId: AGENT_KNOWLEDGE_COLLECTION_ID,
              indexedFiles: files.map(file => ({
                fileName: file.fileName,
                filePath: file.filePath,
                collections: file.collections,
              })),
            },
            details: progressLogs.length > 0 ? progressLogs : undefined,
          };
        } catch (e) {
          return { success: false, error: `索引构建失败：${(e as Error).message}` };
        }
      },
    },
  {
      name: 'get_knowledge_base_index_status',
      module: 'knowledge',
      permission: { module: 'knowledge', action: 'read' },
      tool: {
        name: 'get_knowledge_base_index_status',
        description: '查看当前文件知识库的 RAG 收录状态，包含文件是否已被纳入 RAG 库、所属集合、索引时间和文本块数量。',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: '可选，指定某个文件路径；不传则返回 Agent 文件知识库的全部文件状态' },
          },
        },
      },
      execute: async (args) => {
        try {
          if (typeof args.filePath === 'string' && args.filePath.trim()) {
            const metadata = await getRagFileIndexMetadata(args.filePath.trim());
            return {
              success: true,
              data: metadata,
              message: metadata ? '已找到该文件的 RAG 收录元信息。' : '该文件尚未出现在 RAG 收录 manifest 中。',
            };
          }
          const files = await listRagCollectionFiles(AGENT_KNOWLEDGE_COLLECTION_ID);
          return {
            success: true,
            data: files,
            message: `Agent 文件知识库当前记录 ${files.length} 个文件。`,
          };
        } catch (e) {
          return { success: false, error: `读取 RAG 收录状态失败：${(e as Error).message}` };
        }
      },
    },
];
