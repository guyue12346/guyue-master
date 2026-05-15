import {
  buildIndex as buildVectorIndex,
  loadCollectionPayload,
  loadCollection,
  search as searchVectorCollection,
  searchMultiple as searchVectorCollections,
  type CollectionInfo,
} from '../vectorService';
import {
  normalizeRagCollectionConfig,
  type RagCollectionRuntimeConfig,
} from './config';
import {
  AGENT_KNOWLEDGE_COLLECTION_ID,
  type RagBuildCollectionParams,
  type RagBuildCollectionResult,
  type RagCollectionSearchParams,
  type RagKnowledgeQueryParams,
  type RagManifest,
  type RagMultiCollectionSearchParams,
  type RagSearchResponse,
} from './types';
import {
  getRagFileMetadata,
  getRagFilesForCollection,
  loadRagManifest,
  recordCollectionIndex,
} from './manifest';

export async function initializeRagRepository(): Promise<RagManifest> {
  return loadRagManifest({ importLegacy: true });
}

export async function listRagCollections() {
  const manifest = await initializeRagRepository();
  return Object.values(manifest.collections).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getRagCollectionInfo(collectionId: string): Promise<CollectionInfo | null> {
  try {
    return await loadCollection(collectionId);
  } catch {
    return null;
  }
}

export async function getRagCollectionRuntimeConfig(collectionId: string): Promise<RagCollectionRuntimeConfig | null> {
  try {
    const payload = await loadCollectionPayload(collectionId);
    return normalizeRagCollectionConfig(payload.config);
  } catch {
    return null;
  }
}

export async function listRagQueryProfiles(collectionId: string) {
  const config = await getRagCollectionRuntimeConfig(collectionId);
  return config?.queryProfiles || [];
}

export async function buildRagCollectionIndex(
  params: RagBuildCollectionParams,
): Promise<RagBuildCollectionResult> {
  const result = await buildVectorIndex(
    params.collectionId,
    params.files.map(file => ({
      id: file.id,
      path: file.path,
      name: file.name,
      type: file.type as any,
    })),
    params.embeddingConfig,
    undefined,
    params.options,
  );

  const info = await getRagCollectionInfo(params.collectionId);
  const manifest = await recordCollectionIndex({
    collectionId: params.collectionId,
    collectionName: params.collectionName,
    source: params.source || 'vector-service',
    files: params.files,
    indexedFiles: (info?.files || []).map(file => ({
      filePath: file.filePath,
      fileName: file.filePath.split('/').pop() || file.filePath,
      chunkCount: file.chunks,
    })),
    embeddingConfig: params.embeddingConfig,
    vectorCount: result.totalChunks,
    config: params.config,
  });

  return {
    ...result,
    manifest,
  };
}

export async function searchRagCollection(
  params: RagCollectionSearchParams,
): Promise<RagSearchResponse> {
  const runtimeConfig = await getRagCollectionRuntimeConfig(params.collectionId);
  const embeddingConfig = params.embeddingConfig
    || runtimeConfig?.build.embedding
    || params.fallbackEmbeddingConfig;
  if (!embeddingConfig) {
    throw new Error(`向量库 "${params.collectionId}" 缺少 Embedding 配置，无法查询`);
  }
  const results = await searchVectorCollection(
    params.collectionId,
    params.query,
    embeddingConfig,
    {
      ...params.options,
      useCollectionConfig: true,
      queryProfileId: params.queryProfileId || params.options?.queryProfileId,
    },
  );
  return { results };
}

export async function searchRagCollections(
  params: RagMultiCollectionSearchParams,
): Promise<RagSearchResponse> {
  if (!params.embeddingConfig) {
    const perCollection: Array<{ collectionId: string; results: any[] }> = [];
    const errors: string[] = [];
    const allResults: any[] = [];

    for (const collectionId of params.collectionIds) {
      try {
        const response = await searchRagCollection({
          collectionId,
          query: params.query,
          fallbackEmbeddingConfig: params.fallbackEmbeddingConfig,
          queryProfileId: params.queryProfileId,
          options: params.options,
        });
        perCollection.push({ collectionId, results: response.results });
        allResults.push(...response.results.map(result => ({
          ...result,
          metadata: {
            ...(result.metadata || {}),
            collectionId,
          },
        })));
      } catch (err: any) {
        errors.push(`${collectionId}: ${err?.message || String(err)}`);
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    const topK = params.options?.topK ?? 5;
    return {
      results: allResults.slice(0, topK),
      perCollection,
      errors,
    };
  }

  const response = await searchVectorCollections(
    params.collectionIds,
    params.query,
    params.embeddingConfig,
    {
      ...params.options,
      useCollectionConfig: true,
      queryProfileId: params.queryProfileId || params.options?.queryProfileId,
    },
  );
  return response;
}

export async function queryRagKnowledge(params: RagKnowledgeQueryParams): Promise<RagSearchResponse> {
  const collections = await listRagCollections();
  const collectionIds = params.collectionIds && params.collectionIds.length > 0
    ? params.collectionIds
    : collections.filter(collection => collection.vectorCount > 0).map(collection => collection.id);
  if (collectionIds.length === 0) {
    return { results: [], perCollection: [], errors: ['没有可搜索的 RAG 向量库集合'] };
  }
  return searchRagCollections({
    collectionIds,
    query: params.query,
    fallbackEmbeddingConfig: params.fallbackEmbeddingConfig,
    queryProfileId: params.queryProfileId,
    options: {
      topK: params.topK ?? 5,
      useCollectionConfig: true,
    },
  });
}

export async function getRagFileIndexMetadata(filePath: string) {
  return getRagFileMetadata(filePath);
}

export async function listRagCollectionFiles(collectionId: string) {
  return getRagFilesForCollection(collectionId);
}

export { AGENT_KNOWLEDGE_COLLECTION_ID };
