/**
 * RAG LlamaIndex Module — Embedding Adapter
 *
 * 📚 知识点：Embedding（嵌入/向量化）深入理解
 * ═══════════════════════════════════════════
 *
 * Embedding 是 RAG 的"翻译官"——把人类语言翻译成数学语言（向量）。
 *
 * 一个 Embedding 模型就是一个函数：
 *   f("猫坐在桌上") → [0.12, -0.34, 0.56, ..., 0.89]  (N 维向量)
 *
 * 核心性质（这是 RAG 能工作的数学基础）：
 *   cos(f("猫坐在桌上"), f("小猫趴在桌子上")) ≈ 0.95  (高相似度)
 *   cos(f("猫坐在桌上"), f("量子力学方程"))     ≈ 0.12  (低相似度)
 *
 * 📚 Embedding 模型的选择标准：
 * ────────────────────────────
 * 1. 维度（Dimensions）：
 *    - 768D (小)  → 存储少、速度快，但细节可能丢失
 *    - 1536D (中) → 最常用平衡点
 *    - 3072D (大) → 信息最丰富，但存储/计算成本翻倍
 *
 * 2. 上下文长度：
 *    - text-embedding-3-small: 最大 8191 tokens
 *    - 超过上下文长度的文本会被截断 → 这就是为什么要先分块
 *
 * 3. 多语言支持：
 *    - OpenAI/Gemini: 出色的中英文支持
 *    - 通义千问: 对中文特别优化
 *    - 智谱: 中文优先
 *
 * 4. 成本：
 *    - text-embedding-3-small: ~$0.02/1M tokens (最便宜)
 *    - text-embedding-3-large: ~$0.13/1M tokens
 *    - Gemini embedding: 免费有配额
 *
 * ⚠️ 重要规则：索引和查询必须用同一个 Embedding 模型！
 * 不同模型的向量空间不兼容，混用会导致检索完全失效。
 *
 * 📚 知识点：为什么不直接用 LlamaIndex 内置的 Embedding？
 * ──────────────────────────────────────────────────────
 * LlamaIndex TS 内置的 Embedding 适配器(@llamaindex/openai 等)
 * 只支持有限的提供商。我们的 App 已经支持 5+ 个 Embedding 提供商
 * (Gemini/OpenAI/智谱/千问/自定义)，所以我们写一个适配器层，
 * 把现有提供商桥接到 LlamaIndex 的接口。
 */

import { EmbeddingConfig, EmbeddingProvider } from './types';

// ════════════════════════════════════════════════════════════
// Provider-Specific Implementations
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：各提供商 API 的差异
 * ──────────────────────────────
 * 虽然概念相同（输入文本 → 输出向量），但各家的 API 格式不同：
 *
 * OpenAI: POST /v1/embeddings  { input: "text", model: "..." }
 * Gemini: POST /models/{model}:embedContent  { content: { parts: [{text}] } }
 * 千问:   POST /compatible-mode/v1/embeddings (OpenAI 兼容格式)
 * 智谱:   POST /v4/embeddings (OpenAI 兼容格式)
 *
 * 好消息是：大部分国产模型采用了 OpenAI 兼容格式。
 */

// ── Provider Base URLs ──
const PROVIDER_BASE_URLS: Record<EmbeddingProvider, string> = {
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  zhipu: 'https://open.bigmodel.cn',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
  ollama: 'http://localhost:11434',
  custom: '',
};

// ── Gemini Embedding ──
// 支持 gemini-embedding-001 (稳定) 和 gemini-embedding-2-preview (多模态)
async function getGeminiEmbedding(
  text: string, apiKey: string, model: string, baseUrl?: string,
): Promise<number[]> {
  const base = (baseUrl || PROVIDER_BASE_URLS.gemini).replace(/\/+$/, '');
  const body: Record<string, unknown> = {
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  };
  // gemini-embedding-001/2 支持 Matryoshka 维度缩放
  if (model.startsWith('gemini-embedding')) {
    body.outputDimensionality = 768;
  }

  // 先尝试 v1beta，失败则尝试 v1
  const versions = ['v1beta', 'v1'];
  let lastError = '';
  for (const ver of versions) {
    const url = `${base}/${ver}/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      const values: number[] | undefined = data?.embedding?.values;
      if (!values || values.length === 0) throw new Error('Gemini Embedding 返回了空向量');
      return values;
    }
    lastError = await res.text().catch(() => `HTTP ${res.status}`);
    if (res.status !== 404) {
      throw new Error(`Gemini embedding error: ${res.status} ${lastError.slice(0, 300)}`);
    }
  }
  throw new Error(`Gemini embedding error: 404 模型 ${model} 不可用。${lastError.slice(0, 200)}`);
}

// ── OpenAI-Compatible Embedding ──
async function getOpenAICompatibleEmbedding(
  text: string, apiKey: string, model: string, baseUrl: string,
): Promise<number[]> {
  const url = `${baseUrl}/v1/embeddings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text, model }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding error (${baseUrl}): ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.data?.[0]?.embedding || [];
}

// ── Ollama Embedding (本地) ──
async function getOllamaEmbedding(
  text: string, model: string, baseUrl?: string,
): Promise<number[]> {
  const url = `${baseUrl || PROVIDER_BASE_URLS.ollama}/api/embed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embedding error: ${res.status}`);
  }
  const data = await res.json();
  return data.embeddings?.[0] || [];
}

// ════════════════════════════════════════════════════════════
// Unified Embedding Interface
// ════════════════════════════════════════════════════════════

/**
 * 统一的 Embedding 函数
 *
 * 📚 这是适配器模式（Adapter Pattern）：
 * 不同提供商的 API 各不相同，但我们提供统一接口。
 * 调用者（chunking.ts 的语义分割、vectorStore 等）
 * 只需要知道 getEmbedding(text, config) → number[]
 */
export async function getEmbedding(
  text: string,
  config: EmbeddingConfig,
): Promise<number[]> {
  const { provider, apiKey, model, baseUrl } = config;

  switch (provider) {
    case 'gemini':
      return getGeminiEmbedding(text, apiKey, model, baseUrl);

    case 'openai':
      return getOpenAICompatibleEmbedding(
        text, apiKey, model, baseUrl || PROVIDER_BASE_URLS.openai,
      );

    case 'zhipu':
      return getOpenAICompatibleEmbedding(
        text, apiKey, model, baseUrl || PROVIDER_BASE_URLS.zhipu,
      );

    case 'qwen':
      return getOpenAICompatibleEmbedding(
        text, apiKey, model, baseUrl || PROVIDER_BASE_URLS.qwen,
      );

    case 'ollama':
      return getOllamaEmbedding(text, model, baseUrl);

    case 'custom':
      if (!baseUrl) throw new Error('Custom provider requires baseUrl');
      return getOpenAICompatibleEmbedding(text, apiKey, model, baseUrl);

    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}

/**
 * 创建一个绑定了配置的 Embedding 函数
 *
 * 📚 这是闭包（Closure）的经典用法：
 * 把 config "锁"在函数内部，返回一个更简洁的接口。
 * 调用者只需要 embedFn("text") 而不用每次传 config。
 */
export function createEmbedFunction(config: EmbeddingConfig) {
  return (text: string) => getEmbedding(text, config);
}

/**
 * 批量 Embedding（带速率控制）
 *
 * 📚 知识点：速率限制（Rate Limiting）
 * ------------------------------------
 * 大部分 API 有调用频率限制：
 * - OpenAI: 3000 RPM (requests per minute) for embedding
 * - Gemini: 1500 RPM for free tier
 *
 * 批量处理时如果不控制速率，会触发 429 (Too Many Requests) 错误。
 * 简单的解决方案是在请求之间加延迟。
 */
export async function batchEmbed(
  texts: string[],
  config: EmbeddingConfig,
  options?: {
    batchSize?: number;    // 每批多少个 (default: 10)
    delayMs?: number;      // 批次间延迟毫秒 (default: 100)
    onProgress?: (done: number, total: number) => void;
  },
): Promise<number[][]> {
  const batchSize = options?.batchSize ?? 10;
  const delayMs = options?.delayMs ?? 100;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await Promise.all(
      batch.map(text => getEmbedding(text, config)),
    );
    results.push(...embeddings);
    options?.onProgress?.(Math.min(i + batchSize, texts.length), texts.length);

    // Rate limit delay between batches
    if (i + batchSize < texts.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// ════════════════════════════════════════════════════════════
// Available Models Reference
// ════════════════════════════════════════════════════════════

/**
 * 📚 各提供商推荐的 Embedding 模型
 * 这个列表可以在 UI 中用作下拉选项
 */
export const EMBEDDING_MODEL_OPTIONS: Record<EmbeddingProvider, Array<{
  model: string;
  label: string;
  dimensions: number;
  note?: string;
}>> = {
  openai: [
    { model: 'text-embedding-3-small', label: 'Embedding 3 Small', dimensions: 1536, note: '性价比最高' },
    { model: 'text-embedding-3-large', label: 'Embedding 3 Large', dimensions: 3072, note: '最强精度' },
    { model: 'text-embedding-ada-002', label: 'Ada 002 (Legacy)', dimensions: 1536 },
  ],
  gemini: [
    { model: 'gemini-embedding-001', label: 'Gemini Embedding 001', dimensions: 768, note: '稳定·推荐' },
    { model: 'gemini-embedding-2-preview', label: 'Gemini Embedding 2', dimensions: 768, note: '多模态' },
  ],
  zhipu: [
    { model: 'embedding-3', label: '智谱 Embedding 3', dimensions: 2048, note: '最新' },
    { model: 'embedding-2', label: '智谱 Embedding 2', dimensions: 1024 },
  ],
  qwen: [
    { model: 'text-embedding-v3', label: '通义千问 v3', dimensions: 1024, note: '最新' },
    { model: 'text-embedding-v2', label: '通义千问 v2', dimensions: 1536 },
  ],
  ollama: [
    { model: 'nomic-embed-text', label: 'Nomic Embed', dimensions: 768, note: '本地' },
    { model: 'mxbai-embed-large', label: 'MxBai Large', dimensions: 1024, note: '本地' },
  ],
  custom: [],
};
