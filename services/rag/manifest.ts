import {
  RAG_MANIFEST_FILE,
  RAG_SCHEMA_VERSION,
  type EmbeddingConfig,
  type RagCollectionRecord,
  type RagCollectionSource,
  type RagFileCollectionRef,
  type RagFileInput,
  type RagFileRecord,
  type RagIndexedFileInput,
  type RagManifest,
} from './types';

const RAG_STORAGE_DIR = 'rag-indexes';
const LS_COLLECTIONS = 'guyue_rag_lab_collections';
const LS_DOCUMENTS = 'guyue_rag_lab_all_documents';

function getElectronAPI(): any {
  return (window as any).electronAPI;
}

export function normalizeRagPath(filePath: string): string {
  return String(filePath || '').trim().replace(/\\/g, '/');
}

export function getRagFileKey(filePath: string, fallbackId?: string): string {
  const normalized = normalizeRagPath(filePath);
  return normalized || `id:${fallbackId || 'unknown'}`;
}

function createEmptyManifest(): RagManifest {
  const now = Date.now();
  return {
    schemaVersion: RAG_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    collections: {},
    files: {},
  };
}

function sanitizeManifest(raw: any): RagManifest {
  const empty = createEmptyManifest();
  if (!raw || typeof raw !== 'object') return empty;
  return {
    schemaVersion: Number(raw.schemaVersion) || RAG_SCHEMA_VERSION,
    createdAt: Number(raw.createdAt) || empty.createdAt,
    updatedAt: Number(raw.updatedAt) || empty.updatedAt,
    collections: raw.collections && typeof raw.collections === 'object' ? raw.collections : {},
    files: raw.files && typeof raw.files === 'object' ? raw.files : {},
  };
}

async function getStorageDir(): Promise<string> {
  const api = getElectronAPI();
  if (!api?.getUserDataPath) throw new Error('Electron API 不可用');
  const dir = `${await api.getUserDataPath()}/${RAG_STORAGE_DIR}`;
  if (api.ensureDir) await api.ensureDir(dir).catch(() => undefined);
  return dir;
}

async function getManifestPath(): Promise<string> {
  return `${await getStorageDir()}/${RAG_MANIFEST_FILE}`;
}

async function safeReadJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await getElectronAPI().readFile(path);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function loadRagManifest(options?: { importLegacy?: boolean }): Promise<RagManifest> {
  const path = await getManifestPath();
  const manifest = sanitizeManifest(await safeReadJson<RagManifest>(path));
  if (options?.importLegacy === false) return manifest;
  return importLegacyRagLabMetadata(manifest);
}

export async function saveRagManifest(manifest: RagManifest): Promise<void> {
  const path = await getManifestPath();
  const normalized = sanitizeManifest({
    ...manifest,
    schemaVersion: RAG_SCHEMA_VERSION,
    updatedAt: Date.now(),
  });
  await getElectronAPI().writeFile(path, JSON.stringify(normalized, null, 2));
}

export async function updateRagManifest(
  mutator: (manifest: RagManifest) => void | Promise<void>,
): Promise<RagManifest> {
  const manifest = await loadRagManifest();
  await mutator(manifest);
  manifest.schemaVersion = RAG_SCHEMA_VERSION;
  manifest.updatedAt = Date.now();
  await saveRagManifest(manifest);
  return manifest;
}

function readLocalStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function upsertCollection(
  manifest: RagManifest,
  input: Partial<RagCollectionRecord> & { id: string },
): RagCollectionRecord {
  const now = Date.now();
  const prev = manifest.collections[input.id];
  const next: RagCollectionRecord = {
    id: input.id,
    name: input.name || prev?.name || input.id,
    source: input.source || prev?.source || 'unknown',
    createdAt: prev?.createdAt || input.createdAt || now,
    updatedAt: input.updatedAt || now,
    vectorCount: input.vectorCount ?? prev?.vectorCount ?? 0,
    fileCount: input.fileCount ?? prev?.fileCount ?? 0,
    docPaths: input.docPaths || prev?.docPaths || [],
    embeddingProvider: input.embeddingProvider ?? prev?.embeddingProvider,
    embeddingModel: input.embeddingModel ?? prev?.embeddingModel,
    payloadPath: input.payloadPath ?? prev?.payloadPath,
    config: input.config ?? prev?.config,
    metadata: {
      ...(prev?.metadata || {}),
      ...(input.metadata || {}),
    },
  };
  manifest.collections[input.id] = next;
  return next;
}

function upsertFile(
  manifest: RagManifest,
  input: {
    fileId?: string;
    filePath: string;
    fileName: string;
    fileType?: string;
    fileSize?: number;
    lastModified?: number;
  },
): RagFileRecord {
  const key = getRagFileKey(input.filePath, input.fileId);
  const now = Date.now();
  const prev = manifest.files[key];
  const next: RagFileRecord = {
    fileId: input.fileId ?? prev?.fileId,
    fileName: input.fileName || prev?.fileName || input.filePath,
    filePath: normalizeRagPath(input.filePath || prev?.filePath || ''),
    fileType: input.fileType ?? prev?.fileType,
    fileSize: input.fileSize ?? prev?.fileSize,
    lastModified: input.lastModified ?? prev?.lastModified,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
    collections: { ...(prev?.collections || {}) },
  };
  manifest.files[key] = next;
  return next;
}

function importLegacyRagLabMetadata(manifest: RagManifest): RagManifest {
  const collections = readLocalStorageJson<any[]>(LS_COLLECTIONS, []);
  const documents = readLocalStorageJson<any[]>(LS_DOCUMENTS, []);
  if (!collections.length && !documents.length) return manifest;

  const docByPath = new Map<string, any>();
  for (const doc of documents) {
    if (doc?.path) docByPath.set(normalizeRagPath(doc.path), doc);
  }

  for (const raw of collections) {
    if (!raw?.id) continue;
    const docPaths: string[] = Array.isArray(raw.docPaths)
      ? raw.docPaths.map(normalizeRagPath)
      : Array.isArray(raw.documents)
        ? raw.documents.map((doc: any) => normalizeRagPath(doc?.path || '')).filter(Boolean)
        : [];

    const collection = upsertCollection(manifest, {
      id: raw.id,
      name: raw.name || raw.id,
      source: 'rag-lab',
      createdAt: raw.createdAt || undefined,
      updatedAt: raw.updatedAt || undefined,
      vectorCount: Number(raw.vectorCount) || 0,
      fileCount: docPaths.length,
      docPaths,
      embeddingProvider: raw.embeddingProvider,
      embeddingModel: raw.embeddingModel,
      metadata: {
        color: raw.color,
        icon: raw.icon,
        summary: raw.summary,
        topicVocabulary: raw.topicVocabulary,
        hasHnsw: raw.hasHnsw,
        hasKg: raw.hasKg,
        kgTripleCount: raw.kgTripleCount,
      },
    });

    for (const path of docPaths) {
      const doc = docByPath.get(path);
      const file = upsertFile(manifest, {
        filePath: path,
        fileName: doc?.name || path.split('/').pop() || path,
        fileType: doc?.type,
        fileSize: doc?.size,
      });
      const prevRef = file.collections[collection.id];
      file.collections[collection.id] = {
        collectionId: collection.id,
        collectionName: collection.name,
        state: prevRef?.state === 'indexed' ? 'indexed' : 'listed',
        includedAt: prevRef?.includedAt || collection.createdAt || Date.now(),
        indexedAt: prevRef?.indexedAt,
        chunkCount: prevRef?.chunkCount || 0,
        embeddingProvider: collection.embeddingProvider,
        embeddingModel: collection.embeddingModel,
        source: 'rag-lab',
        fileSize: file.fileSize,
        lastModified: file.lastModified,
      };
    }
  }

  manifest.updatedAt = Date.now();
  return manifest;
}

export async function recordCollectionIndex(params: {
  collectionId: string;
  collectionName?: string;
  source?: RagCollectionSource;
  files?: RagFileInput[];
  indexedFiles: RagIndexedFileInput[];
  embeddingConfig?: Pick<EmbeddingConfig, 'provider' | 'model'>;
  vectorCount?: number;
  metadata?: Record<string, any>;
  config?: RagCollectionRecord['config'];
}): Promise<RagManifest> {
  const now = Date.now();
  return updateRagManifest(async manifest => {
    const inputByPath = new Map<string, RagFileInput>();
    for (const file of params.files || []) {
      inputByPath.set(normalizeRagPath(file.path), file);
    }

    const docPaths = Array.from(new Set([
      ...(manifest.collections[params.collectionId]?.docPaths || []),
      ...Array.from(inputByPath.keys()),
      ...params.indexedFiles.map(file => normalizeRagPath(file.filePath)),
    ].filter(Boolean)));

    const collection = upsertCollection(manifest, {
      id: params.collectionId,
      name: params.collectionName || manifest.collections[params.collectionId]?.name || params.collectionId,
      source: params.source || manifest.collections[params.collectionId]?.source || 'vector-service',
      updatedAt: now,
      vectorCount: params.vectorCount ?? params.indexedFiles.reduce((sum, file) => sum + file.chunkCount, 0),
      fileCount: docPaths.length,
      docPaths,
      embeddingProvider: params.embeddingConfig?.provider,
      embeddingModel: params.embeddingConfig?.model,
      config: params.config,
      metadata: params.metadata,
    });

    for (const indexed of params.indexedFiles) {
      const path = normalizeRagPath(indexed.filePath);
      const original = inputByPath.get(path);
      const file = upsertFile(manifest, {
        fileId: indexed.fileId || original?.id,
        filePath: path,
        fileName: indexed.fileName || original?.name || path.split('/').pop() || path,
        fileType: indexed.fileType || original?.type,
        fileSize: indexed.fileSize ?? original?.size,
        lastModified: indexed.lastModified ?? original?.lastModified,
      });
      const existing = file.collections[collection.id];
      const ref: RagFileCollectionRef = {
        collectionId: collection.id,
        collectionName: collection.name,
        state: 'indexed',
        includedAt: existing?.includedAt || indexed.indexedAt || now,
        indexedAt: indexed.indexedAt || now,
        chunkCount: indexed.chunkCount,
        embeddingProvider: params.embeddingConfig?.provider || collection.embeddingProvider,
        embeddingModel: params.embeddingConfig?.model || collection.embeddingModel,
        source: params.source || collection.source,
        fileSize: file.fileSize,
        lastModified: file.lastModified,
      };
      file.collections[collection.id] = ref;
    }

    for (const [path, original] of inputByPath) {
      if (params.indexedFiles.some(file => normalizeRagPath(file.filePath) === path)) continue;
      const file = upsertFile(manifest, {
        fileId: original.id,
        filePath: original.path,
        fileName: original.name,
        fileType: original.type,
        fileSize: original.size,
        lastModified: original.lastModified,
      });
      const existing = file.collections[collection.id];
      file.collections[collection.id] = {
        collectionId: collection.id,
        collectionName: collection.name,
        state: existing?.state || 'listed',
        includedAt: existing?.includedAt || now,
        indexedAt: existing?.indexedAt,
        chunkCount: existing?.chunkCount || 0,
        embeddingProvider: params.embeddingConfig?.provider || collection.embeddingProvider,
        embeddingModel: params.embeddingConfig?.model || collection.embeddingModel,
        source: params.source || collection.source,
        fileSize: file.fileSize,
        lastModified: file.lastModified,
      };
    }
  });
}

export async function removeFileFromCollectionManifest(
  collectionId: string,
  filePath: string,
): Promise<RagManifest> {
  return updateRagManifest(manifest => {
    const key = getRagFileKey(filePath);
    const file = manifest.files[key];
    if (file?.collections[collectionId]) {
      file.collections[collectionId] = {
        ...file.collections[collectionId],
        state: 'removed',
      };
      file.updatedAt = Date.now();
    }
    const collection = manifest.collections[collectionId];
    if (collection) {
      collection.docPaths = collection.docPaths.filter(path => normalizeRagPath(path) !== normalizeRagPath(filePath));
      collection.fileCount = collection.docPaths.length;
      collection.updatedAt = Date.now();
    }
  });
}

export async function removeCollectionFromManifest(collectionId: string): Promise<RagManifest> {
  return updateRagManifest(manifest => {
    delete manifest.collections[collectionId];
    for (const file of Object.values(manifest.files)) {
      if (file.collections[collectionId]) {
        file.collections[collectionId] = {
          ...file.collections[collectionId],
          state: 'removed',
        };
        file.updatedAt = Date.now();
      }
    }
  });
}

export async function getRagFileMetadata(filePath: string): Promise<RagFileRecord | null> {
  const manifest = await loadRagManifest();
  return manifest.files[getRagFileKey(filePath)] || null;
}

export async function getRagFilesForCollection(collectionId: string): Promise<RagFileRecord[]> {
  const manifest = await loadRagManifest();
  return Object.values(manifest.files).filter(file => {
    const ref = file.collections[collectionId];
    return ref && ref.state !== 'removed';
  });
}
