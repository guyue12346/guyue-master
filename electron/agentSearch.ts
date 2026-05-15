import { net } from 'electron';

export type AgentSearchProvider =
  | 'duckduckgo-browser'
  | 'openai-web-search'
  | 'searxng'
  | 'brave'
  | 'tavily'
  | 'exa'
  | 'firecrawl'
  | 'bing-web-search'
  | 'google-cse';

export type AgentSearchMode = 'fast' | 'balanced' | 'deep';
export type AgentSpecializedSearchSource = 'github' | 'npm' | 'stackoverflow' | 'arxiv';

export interface AgentWebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedDate?: string;
  score?: number;
  content?: string;
  meta?: Record<string, any>;
}

export interface AgentWebSearchParams {
  query: string;
  provider?: AgentSearchProvider;
  fallbackProviders?: AgentSearchProvider[];
  mode?: AgentSearchMode;
  searchMode?: AgentSearchMode;
  maxResults?: number;
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  apiKeys?: {
    openai?: string;
    bing?: string;
    google?: string;
    brave?: string;
    tavily?: string;
    exa?: string;
    firecrawl?: string;
  };
  bingEndpoint?: string;
  googleCx?: string;
  searxngBaseUrl?: string;
  firecrawlBaseUrl?: string;
  language?: string;
  country?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  topic?: 'general' | 'news' | 'finance';
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface AgentWebOpenParams {
  url: string;
  query?: string;
  maxChars?: number;
  includeHtml?: boolean;
}

export interface AgentWebOpenResult {
  success: boolean;
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  content?: string;
  excerpt?: string;
  html?: string;
  contentType?: string;
  error?: string;
}

export interface AgentSpecializedSearchParams {
  source: AgentSpecializedSearchSource;
  query: string;
  maxResults?: number;
  githubType?: 'repositories' | 'code' | 'issues' | 'pull_requests' | 'users';
  owner?: string;
  repo?: string;
  language?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  tags?: string[];
  arxivCategory?: string;
  specialized?: {
    enabledSources?: AgentSpecializedSearchSource[];
    maxResults?: number;
    apiKeys?: {
      github?: string;
      stackExchange?: string;
    };
  };
}

interface ProviderResult {
  directAnswer: string | null;
  results: AgentWebSearchResult[];
}

const ACTIVE_SEARCH_PROVIDERS = new Set<AgentSearchProvider>([
  'duckduckgo-browser',
  'openai-web-search',
  'searxng',
  'brave',
  'tavily',
  'exa',
  'firecrawl',
  'bing-web-search',
  'google-cse',
]);

const SPECIALIZED_SOURCES = new Set<AgentSpecializedSearchSource>(['github', 'npm', 'stackoverflow', 'arxiv']);

const normalizeMode = (value: unknown): AgentSearchMode =>
  value === 'fast' || value === 'deep' || value === 'balanced' ? value : 'balanced';

const normalizeProvider = (value: unknown): AgentSearchProvider =>
  typeof value === 'string' && ACTIVE_SEARCH_PROVIDERS.has(value as AgentSearchProvider)
    ? value as AgentSearchProvider
    : 'duckduckgo-browser';

const normalizeSpecializedSource = (value: unknown): AgentSpecializedSearchSource | null =>
  typeof value === 'string' && SPECIALIZED_SOURCES.has(value as AgentSpecializedSearchSource)
    ? value as AgentSpecializedSearchSource
    : null;

const normalizeMaxResults = (value: unknown, fallback = 8) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 3), 20);
};

const fetchJson = async (url: string, options?: RequestInit & { bypassCustomProtocolHandlers?: boolean }): Promise<any> => {
  const response = await net.fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 260)}` : ''}`);
  }
  return response.json();
};

const fetchText = async (url: string, options?: RequestInit & { bypassCustomProtocolHandlers?: boolean }): Promise<string> => {
  const response = await net.fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 260)}` : ''}`);
  }
  return response.text();
};

const fetchTextResponse = async (url: string, options?: RequestInit & { bypassCustomProtocolHandlers?: boolean }) => {
  const response = await net.fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 260)}` : ''}`);
  }
  return {
    text: await response.text(),
    finalUrl: response.url,
    contentType: response.headers.get('content-type') || '',
  };
};

const decodeHtmlEntity = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const stripMarkup = (value: unknown): string =>
  decodeHtmlEntity(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

const extractTagContent = (html: string, tag: string): string => {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripMarkup(match[1]) : '';
};

const extractMetaContent = (html: string, names: string[]): string => {
  for (const name of names) {
    const pattern = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
    const reversePattern = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["'][^>]*>`, 'i');
    const match = html.match(pattern) || html.match(reversePattern);
    if (match?.[1]) return stripMarkup(match[1]);
  }
  return '';
};

const htmlToReadableText = (html: string): string => {
  const withoutHidden = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const withBreaks = withoutHidden
    .replace(/<\/(p|div|section|article|header|footer|main|aside|nav|li|ul|ol|table|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return decodeHtmlEntity(withBreaks.replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .filter((line, index, lines) => index === 0 || line !== lines[index - 1])
    .join('\n')
    .trim();
};

const buildFocusedExcerpt = (content: string, query?: string, maxChars = 1800): string => {
  const text = content.trim();
  if (!text || !query?.trim()) return text.slice(0, maxChars);
  const terms = Array.from(new Set(query
    .toLowerCase()
    .split(/[\s,，。:：;；、]+/)
    .map(term => term.trim())
    .filter(term => term.length >= 2)));
  if (terms.length === 0) return text.slice(0, maxChars);
  const lower = text.toLowerCase();
  const firstIndex = terms
    .map(term => lower.indexOf(term))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];
  if (!Number.isFinite(firstIndex)) return text.slice(0, maxChars);
  const start = Math.max(0, firstIndex - Math.floor(maxChars * 0.25));
  const excerpt = text.slice(start, start + maxChars).trim();
  return `${start > 0 ? '...' : ''}${excerpt}${start + maxChars < text.length ? '...' : ''}`;
};

const decodeDuckDuckGoUrl = (href: string): string => {
  const raw = decodeHtmlEntity(String(href || '').trim());
  if (!raw) return '';
  const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
  try {
    const parsed = new URL(normalized, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return parsed.href;
  } catch {
    return normalized;
  }
};

const normalizeDomain = (domain: string): string => {
  const value = domain.trim();
  if (!value) return '';
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
};

const withDomainOperators = (query: string, includeDomains?: string[], excludeDomains?: string[]) => {
  const include = Array.isArray(includeDomains) ? includeDomains.map(normalizeDomain).filter(Boolean) : [];
  const exclude = Array.isArray(excludeDomains) ? excludeDomains.map(normalizeDomain).filter(Boolean) : [];
  const includePrefix = include.length > 0 ? `(${include.map(domain => `site:${domain}`).join(' OR ')}) ` : '';
  const excludeSuffix = exclude.length > 0 ? ` ${exclude.map(domain => `-site:${domain}`).join(' ')}` : '';
  return `${includePrefix}${query}${excludeSuffix}`.trim();
};

const pushUnique = (results: AgentWebSearchResult[], item: AgentWebSearchResult, maxResults: number) => {
  const url = String(item.url || '').trim();
  const title = String(item.title || '').trim();
  if (!title || !/^https?:\/\//i.test(url) || results.length >= maxResults) return;
  if (results.some(result => result.url === url)) return;
  results.push({ ...item, title, url, snippet: stripMarkup(item.snippet || item.content || '').slice(0, 1200) });
};

const parseJsonObjectFromText = (text: string): any | null => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed, trimmed.match(/\{[\s\S]*\}/)?.[0]]
    .filter((item): item is string => Boolean(item && item.trim()));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
};

const extractOpenAIResponseText = (data: any): string => {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const chunks: string[] = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  output.forEach((item: any) => {
    if (typeof item?.content === 'string') chunks.push(item.content);
    if (!Array.isArray(item?.content)) return;
    item.content.forEach((content: any) => {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.output_text === 'string') chunks.push(content.output_text);
      if (typeof content?.summary === 'string') chunks.push(content.summary);
    });
  });
  return chunks.join('\n').trim();
};

const extractOpenAICitations = (data: any, responseText: string, maxResults: number): AgentWebSearchResult[] => {
  const citations: AgentWebSearchResult[] = [];
  const output = Array.isArray(data?.output) ? data.output : [];
  const visitContent = (content: any) => {
    const annotations = Array.isArray(content?.annotations) ? content.annotations : [];
    annotations.forEach((annotation: any) => {
      const url = String(annotation?.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return;
      const start = Number(annotation?.start_index);
      const end = Number(annotation?.end_index);
      const citedText = Number.isFinite(start) && Number.isFinite(end) && end > start
        ? responseText.slice(Math.max(0, start - 80), Math.min(responseText.length, end + 160)).trim()
        : '';
      pushUnique(citations, {
        title: String(annotation?.title || url).trim(),
        url,
        snippet: citedText || responseText.slice(0, 360),
        source: 'openai-web-search',
        meta: { provider: 'openai-responses-web_search', citation: true },
      }, maxResults);
    });
  };
  output.forEach((item: any) => {
    if (Array.isArray(item?.content)) item.content.forEach(visitContent);
  });
  return citations;
};

const tokenizeQuery = (query: string): string[] => {
  const normalized = query
    .toLowerCase()
    .replace(/[“”"‘’'`.,，。！？!?;；:：()[\]{}<>《》【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const terms = new Set<string>();
  normalized.split(' ').forEach(part => {
    const value = part.trim();
    if (!value) return;
    if (/^[\u4e00-\u9fff]+$/.test(value)) {
      if (value.length >= 2) terms.add(value);
      if (value.length >= 4) {
        for (let size = Math.min(4, value.length); size >= 3; size -= 1) {
          for (let i = 0; i <= value.length - size; i += 1) terms.add(value.slice(i, i + size));
        }
      }
      return;
    }
    value.split(/[^a-z0-9_\-\u4e00-\u9fff]+/i).forEach(token => {
      if (token.length >= 2 && !['the', 'and', 'or', 'www', 'com', 'http', 'https'].includes(token)) terms.add(token);
    });
  });
  return Array.from(terms);
};

const scoreRelevance = (result: AgentWebSearchResult, queryTerms: string[]) => {
  if (queryTerms.length === 0) return 1;
  const title = `${result.title || ''}`.toLowerCase();
  const snippet = `${result.snippet || result.content || ''}`.toLowerCase();
  const url = `${result.url || ''}`.toLowerCase();
  let score = 0;
  queryTerms.forEach(term => {
    if (!term) return;
    if (title.includes(term)) score += 5;
    if (snippet.includes(term)) score += 2;
    if (url.includes(encodeURIComponent(term).toLowerCase()) || url.includes(term)) score += 1;
  });
  return score;
};

const applyResultGuards = (providerResult: ProviderResult, params: AgentWebSearchParams, provider: AgentSearchProvider): ProviderResult => {
  const maxResults = normalizeMaxResults(params.maxResults);
  const includeDomains = Array.isArray(params.includeDomains) ? params.includeDomains.map(normalizeDomain).filter(Boolean) : [];
  const excludeDomains = Array.isArray(params.excludeDomains) ? params.excludeDomains.map(normalizeDomain).filter(Boolean) : [];
  const queryTerms = tokenizeQuery(params.query);

  const domainFiltered = providerResult.results.filter(result => {
    try {
      const host = new URL(result.url).hostname.replace(/^www\./i, '');
      if (includeDomains.length > 0 && !includeDomains.some(domain => host === domain || host.endsWith(`.${domain}`))) return false;
      if (excludeDomains.some(domain => host === domain || host.endsWith(`.${domain}`))) return false;
      return true;
    } catch {
      return false;
    }
  });

  const scored = domainFiltered
    .map(item => ({
      ...item,
      meta: {
        ...(item.meta || {}),
        relevanceScore: scoreRelevance(item, queryTerms),
      },
    }))
    .filter(item => queryTerms.length === 0 || Number(item.meta?.relevanceScore || 0) > 0)
    .sort((a, b) => Number(b.meta?.relevanceScore || 0) - Number(a.meta?.relevanceScore || 0));

  const bestScore = Number(scored[0]?.meta?.relevanceScore || 0);
  const hasAnswer = Boolean(providerResult.directAnswer?.trim());
  const minScore = provider === 'duckduckgo-browser' || provider === 'searxng' ? 1 : 4;
  if (!hasAnswer && queryTerms.length > 0 && bestScore < minScore) {
    throw new Error(`搜索结果相关性过低，已丢弃（provider=${provider}）`);
  }

  return {
    directAnswer: providerResult.directAnswer,
    results: scored.slice(0, maxResults),
  };
};

const getProviderMissingConfig = (provider: AgentSearchProvider, params: AgentWebSearchParams): string | null => {
  switch (provider) {
    case 'duckduckgo-browser':
      return null;
    case 'openai-web-search':
      return params.apiKeys?.openai?.trim() ? null : 'OpenAI API Key 未配置';
    case 'bing-web-search':
      return params.apiKeys?.bing?.trim() ? null : 'Bing API Key 未配置';
    case 'google-cse':
      if (!params.apiKeys?.google?.trim()) return 'Google API Key 未配置';
      return params.googleCx?.trim() ? null : 'Google CX 未配置';
    case 'brave':
      return params.apiKeys?.brave?.trim() ? null : 'Brave Search API Key 未配置';
    case 'tavily':
      return params.apiKeys?.tavily?.trim() ? null : 'Tavily API Key 未配置';
    case 'exa':
      return params.apiKeys?.exa?.trim() ? null : 'Exa API Key 未配置';
    case 'firecrawl':
      return params.apiKeys?.firecrawl?.trim() ? null : 'Firecrawl API Key 未配置';
    case 'searxng':
      return params.searxngBaseUrl?.trim() ? null : 'SearXNG Base URL 未配置';
    default:
      return null;
  }
};

const searchWithOpenAI = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const apiKey = params.apiKeys?.openai?.trim();
  if (!apiKey) throw new Error('OpenAI API Key 未配置');
  const mode = normalizeMode(params.searchMode || params.mode);
  const maxResults = normalizeMaxResults(params.maxResults);
  const allowedDomains = Array.isArray(params.includeDomains) ? params.includeDomains.map(normalizeDomain).filter(Boolean) : [];
  const currentDate = new Date().toISOString().slice(0, 10);
  const webSearchTool: Record<string, unknown> = {
    type: 'web_search',
    external_web_access: true,
    search_context_size: mode === 'deep' ? 'high' : mode === 'fast' ? 'low' : 'medium',
  };
  if (allowedDomains.length > 0) webSearchTool.filters = { allowed_domains: allowedDomains };
  if (params.country) {
    webSearchTool.user_location = {
      type: 'approximate',
      country: params.country,
      timezone: params.country.toUpperCase() === 'CN' ? 'Asia/Shanghai' : undefined,
    };
  }

  const data = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: [
            'You are a search runtime for an agent application.',
            'Use hosted web_search first, prefer primary and official sources, reject unrelated search-directory pages.',
            'Return concise current facts in the preferred language. Include concrete dates, values, and locations when relevant.',
            'If possible return JSON: {"answer": "...", "results": [{"title":"...","url":"...","snippet":"..."}]}.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Query: ${params.query}`,
            `Current date: ${currentDate}`,
            `Preferred language: ${params.language || 'zh-CN'}`,
            `Country hint: ${params.country || 'CN'}`,
            `Search mode: ${mode}`,
            `Max sources: ${maxResults}`,
            params.timeRange ? `Time range: ${params.timeRange}` : '',
            params.topic ? `Topic: ${params.topic}` : '',
            allowedDomains.length ? `Allowed domains: ${allowedDomains.join(', ')}` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
      tools: [webSearchTool],
      tool_choice: 'auto',
      temperature: 0,
      max_output_tokens: mode === 'deep' ? 2400 : 1600,
      store: false,
    }),
  });

  const text = extractOpenAIResponseText(data);
  const parsed = parseJsonObjectFromText(text);
  const results: AgentWebSearchResult[] = [];
  if (Array.isArray(parsed?.results)) {
    parsed.results.forEach((item: any) => pushUnique(results, {
      title: String(item?.title || item?.url || '').trim(),
      url: String(item?.url || '').trim(),
      snippet: String(item?.snippet || item?.content || '').trim(),
      publishedDate: typeof item?.publishedDate === 'string' ? item.publishedDate : undefined,
      source: 'openai-web-search',
      meta: { provider: 'openai-responses-web_search' },
    }, maxResults));
  }
  extractOpenAICitations(data, text, maxResults).forEach(item => pushUnique(results, item, maxResults));
  return {
    directAnswer: typeof parsed?.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : text.trim() || null,
    results,
  };
};

const mapBingFreshness = (timeRange?: AgentWebSearchParams['timeRange']) => {
  if (timeRange === 'day') return 'Day';
  if (timeRange === 'week') return 'Week';
  if (timeRange === 'month') return 'Month';
  return '';
};

const searchWithDuckDuckGo = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const maxResults = normalizeMaxResults(params.maxResults);
  const query = withDomainOperators(params.query, params.includeDomains, params.excludeDomains);
  const region = (params.country || 'CN').toUpperCase() === 'CN' ? 'cn-zh' : 'wt-wt';
  const html = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(region)}`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
    },
  });

  const results: AgentWebSearchResult[] = [];
  const anchorRe = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) && results.length < maxResults) {
    const rest = html.slice(anchorRe.lastIndex);
    const nextAnchorOffset = rest.search(/<a[^>]+class="[^"]*\bresult__a\b/i);
    const block = nextAnchorOffset >= 0 ? rest.slice(0, nextAnchorOffset) : rest.slice(0, 2400);
    const snippetMatch = block.match(/<(?:a|div)[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    pushUnique(results, {
      title: stripMarkup(match[2]),
      url: decodeDuckDuckGoUrl(match[1]),
      snippet: stripMarkup(snippetMatch?.[1] || ''),
      source: 'duckduckgo-browser',
      meta: { provider: 'duckduckgo-html' },
    }, maxResults);
  }

  if (results.length > 0) {
    return { directAnswer: null, results };
  }

  const instant = await fetchJson(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`, {
    headers: { Accept: 'application/json' },
  });
  const answer = stripMarkup(instant?.AbstractText || instant?.Answer || '') || null;
  const related = Array.isArray(instant?.RelatedTopics) ? instant.RelatedTopics : [];
  related.forEach((item: any) => {
    const topics = Array.isArray(item?.Topics) ? item.Topics : [item];
    topics.forEach((topic: any) => pushUnique(results, {
      title: stripMarkup(topic?.Text || topic?.FirstURL || ''),
      url: String(topic?.FirstURL || '').trim(),
      snippet: stripMarkup(topic?.Text || ''),
      source: 'duckduckgo-browser',
      meta: { provider: 'duckduckgo-instant-answer' },
    }, maxResults));
  });
  return { directAnswer: answer, results };
};

const searchWithBing = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const apiKey = params.apiKeys?.bing?.trim();
  if (!apiKey) throw new Error('Bing API Key 未配置');
  const maxResults = normalizeMaxResults(params.maxResults);
  const url = new URL((params.bingEndpoint || 'https://api.bing.microsoft.com/v7.0/search').trim());
  url.searchParams.set('q', withDomainOperators(params.query, params.includeDomains, params.excludeDomains));
  url.searchParams.set('count', String(maxResults));
  url.searchParams.set('mkt', params.language || 'zh-CN');
  url.searchParams.set('cc', params.country || 'CN');
  url.searchParams.set('responseFilter', params.topic === 'news' ? 'News' : 'Webpages,News');
  const freshness = mapBingFreshness(params.timeRange);
  if (freshness) url.searchParams.set('freshness', freshness);
  const data = await fetchJson(url.toString(), {
    headers: { Accept: 'application/json', 'Ocp-Apim-Subscription-Key': apiKey },
  });
  const results: AgentWebSearchResult[] = [];
  (Array.isArray(data?.webPages?.value) ? data.webPages.value : []).forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.name || item?.url || ''),
    url: String(item?.url || '').trim(),
    snippet: stripMarkup(item?.snippet || ''),
    source: 'bing-web-search',
    publishedDate: typeof item?.dateLastCrawled === 'string' ? item.dateLastCrawled : undefined,
    meta: { provider: 'bing-web-search-api' },
  }, maxResults));
  (Array.isArray(data?.news?.value) ? data.news.value : []).forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.name || item?.url || ''),
    url: String(item?.url || '').trim(),
    snippet: stripMarkup(item?.description || ''),
    source: 'bing-web-search',
    publishedDate: typeof item?.datePublished === 'string' ? item.datePublished : undefined,
    meta: { provider: 'bing-news-api', providerName: item?.provider?.[0]?.name },
  }, maxResults));
  const directAnswer = [data?.computation?.expression, data?.computation?.value, data?.timeZone?.primaryCityTime?.time].filter(Boolean).join('\n') || null;
  return { directAnswer, results };
};

const searchWithGoogle = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const apiKey = params.apiKeys?.google?.trim();
  const cx = params.googleCx?.trim();
  if (!apiKey) throw new Error('Google API Key 未配置');
  if (!cx) throw new Error('Google CX 未配置');
  const maxResults = normalizeMaxResults(params.maxResults);
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cx);
  url.searchParams.set('q', withDomainOperators(params.query, params.includeDomains, params.excludeDomains));
  url.searchParams.set('num', String(Math.min(maxResults, 10)));
  url.searchParams.set('hl', (params.language || 'zh-CN').split('-')[0] || 'zh');
  if (params.country) url.searchParams.set('gl', params.country.toLowerCase());
  const data = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } });
  const results: AgentWebSearchResult[] = [];
  (Array.isArray(data?.items) ? data.items : []).forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.title || item?.link || ''),
    url: String(item?.link || '').trim(),
    snippet: stripMarkup(item?.snippet || ''),
    source: 'google-cse',
    meta: { provider: 'google-custom-search', displayLink: item?.displayLink },
  }, maxResults));
  return { directAnswer: null, results };
};

const normalizeBaseUrl = (value: string, fallback?: string) => {
  const raw = (value || fallback || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const searchWithSearxng = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const base = normalizeBaseUrl(params.searxngBaseUrl || '');
  if (!base) throw new Error('SearXNG Base URL 未配置');
  const maxResults = normalizeMaxResults(params.maxResults);
  const url = new URL(`${base}/search`);
  url.searchParams.set('q', withDomainOperators(params.query, params.includeDomains, params.excludeDomains));
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', params.language || 'zh-CN');
  url.searchParams.set('safesearch', '0');
  if (params.topic === 'news') url.searchParams.set('categories', 'news');
  if (params.timeRange) url.searchParams.set('time_range', params.timeRange);
  const data = await fetchJson(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'Guyue-Master-Agent/1.0' },
  });
  const results: AgentWebSearchResult[] = [];
  (Array.isArray(data?.results) ? data.results : []).forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.title || item?.url || ''),
    url: String(item?.url || '').trim(),
    snippet: stripMarkup(item?.content || item?.snippet || ''),
    source: 'searxng',
    publishedDate: typeof item?.publishedDate === 'string' ? item.publishedDate : undefined,
    score: typeof item?.score === 'number' ? item.score : undefined,
    meta: { provider: 'searxng', engine: item?.engine, category: item?.category },
  }, maxResults));
  return { directAnswer: stripMarkup(data?.answer || '') || null, results };
};

const mapBraveFreshness = (timeRange?: AgentWebSearchParams['timeRange']) => {
  if (timeRange === 'day') return 'pd';
  if (timeRange === 'week') return 'pw';
  if (timeRange === 'month') return 'pm';
  if (timeRange === 'year') return 'py';
  return '';
};

const searchWithBrave = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const apiKey = params.apiKeys?.brave?.trim();
  if (!apiKey) throw new Error('Brave Search API Key 未配置');
  const maxResults = normalizeMaxResults(params.maxResults);
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', withDomainOperators(params.query, params.includeDomains, params.excludeDomains));
  url.searchParams.set('count', String(Math.min(maxResults, 20)));
  url.searchParams.set('country', params.country || 'CN');
  url.searchParams.set('search_lang', (params.language || 'zh-CN').split('-')[0] || 'zh');
  const freshness = mapBraveFreshness(params.timeRange);
  if (freshness) url.searchParams.set('freshness', freshness);
  const data = await fetchJson(url.toString(), {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
  });
  const results: AgentWebSearchResult[] = [];
  (Array.isArray(data?.web?.results) ? data.web.results : []).forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.title || item?.url || ''),
    url: String(item?.url || '').trim(),
    snippet: stripMarkup(item?.description || ''),
    source: 'brave',
    publishedDate: typeof item?.age === 'string' ? item.age : undefined,
    meta: { provider: 'brave-search-api', language: item?.language, profile: item?.profile?.name },
  }, maxResults));
  return { directAnswer: stripMarkup(data?.query?.original || '') === params.query ? null : stripMarkup(data?.query?.original || '') || null, results };
};

const searchWithTavily = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const apiKey = params.apiKeys?.tavily?.trim();
  if (!apiKey) throw new Error('Tavily API Key 未配置');
  const mode = normalizeMode(params.searchMode || params.mode);
  const maxResults = normalizeMaxResults(params.maxResults);
  const data = await fetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: params.query,
      search_depth: mode === 'deep' ? 'advanced' : 'basic',
      max_results: maxResults,
      include_answer: params.includeAnswer !== false,
      include_raw_content: Boolean(params.includeRawContent),
      include_domains: params.includeDomains || [],
      exclude_domains: params.excludeDomains || [],
      topic: params.topic || 'general',
      days: params.timeRange === 'day' ? 1 : params.timeRange === 'week' ? 7 : params.timeRange === 'month' ? 30 : undefined,
    }),
  });
  const results: AgentWebSearchResult[] = [];
  (Array.isArray(data?.results) ? data.results : []).forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.title || item?.url || ''),
    url: String(item?.url || '').trim(),
    snippet: stripMarkup(item?.content || ''),
    content: typeof item?.raw_content === 'string' ? item.raw_content : undefined,
    source: 'tavily',
    score: typeof item?.score === 'number' ? item.score : undefined,
    meta: { provider: 'tavily' },
  }, maxResults));
  return { directAnswer: typeof data?.answer === 'string' ? data.answer : null, results };
};

const searchWithExa = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const apiKey = params.apiKeys?.exa?.trim();
  if (!apiKey) throw new Error('Exa API Key 未配置');
  const maxResults = normalizeMaxResults(params.maxResults);
  const data = await fetchJson('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      query: params.query,
      numResults: maxResults,
      type: normalizeMode(params.searchMode || params.mode) === 'fast' ? 'keyword' : 'neural',
      includeDomains: params.includeDomains || undefined,
      excludeDomains: params.excludeDomains || undefined,
      contents: params.includeRawContent ? { text: true } : undefined,
    }),
  });
  const results: AgentWebSearchResult[] = [];
  (Array.isArray(data?.results) ? data.results : []).forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.title || item?.url || ''),
    url: String(item?.url || '').trim(),
    snippet: stripMarkup(item?.text || item?.summary || ''),
    content: typeof item?.text === 'string' ? item.text : undefined,
    source: 'exa',
    score: typeof item?.score === 'number' ? item.score : undefined,
    publishedDate: typeof item?.publishedDate === 'string' ? item.publishedDate : undefined,
    meta: { provider: 'exa' },
  }, maxResults));
  return { directAnswer: null, results };
};

const searchWithFirecrawl = async (params: AgentWebSearchParams): Promise<ProviderResult> => {
  const apiKey = params.apiKeys?.firecrawl?.trim();
  if (!apiKey) throw new Error('Firecrawl API Key 未配置');
  const base = normalizeBaseUrl(params.firecrawlBaseUrl || '', 'https://api.firecrawl.dev');
  const maxResults = normalizeMaxResults(params.maxResults);
  const data = await fetchJson(`${base}/v2/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query: withDomainOperators(params.query, params.includeDomains, params.excludeDomains),
      limit: maxResults,
      sources: params.topic === 'news' ? ['news', 'web'] : ['web'],
      scrapeOptions: params.includeRawContent ? { formats: ['markdown'] } : undefined,
    }),
  });
  const items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.results) ? data.results : [];
  const results: AgentWebSearchResult[] = [];
  items.forEach((item: any) => pushUnique(results, {
    title: stripMarkup(item?.title || item?.metadata?.title || item?.url || ''),
    url: String(item?.url || item?.metadata?.sourceURL || '').trim(),
    snippet: stripMarkup(item?.description || item?.markdown || item?.content || ''),
    content: typeof item?.markdown === 'string' ? item.markdown : typeof item?.content === 'string' ? item.content : undefined,
    source: 'firecrawl',
    meta: { provider: 'firecrawl' },
  }, maxResults));
  return { directAnswer: null, results };
};

const runProvider = async (provider: AgentSearchProvider, params: AgentWebSearchParams): Promise<ProviderResult> => {
  switch (provider) {
    case 'duckduckgo-browser': return searchWithDuckDuckGo(params);
    case 'openai-web-search': return searchWithOpenAI(params);
    case 'searxng': return searchWithSearxng(params);
    case 'brave': return searchWithBrave(params);
    case 'tavily': return searchWithTavily(params);
    case 'exa': return searchWithExa(params);
    case 'firecrawl': return searchWithFirecrawl(params);
    case 'bing-web-search': return searchWithBing(params);
    case 'google-cse': return searchWithGoogle(params);
    default: return searchWithDuckDuckGo(params);
  }
};

export const runAgentWebSearch = async (rawParams: AgentWebSearchParams) => {
  const query = typeof rawParams.query === 'string' ? rawParams.query.trim() : '';
  if (!query) return { success: false, error: '搜索词不能为空', results: [], query };
  const primary = normalizeProvider(rawParams.provider);
  const fallbackProviders = Array.isArray(rawParams.fallbackProviders) ? rawParams.fallbackProviders.map(normalizeProvider) : [];
  if (primary !== 'duckduckgo-browser' && !fallbackProviders.includes('duckduckgo-browser')) {
    fallbackProviders.push('duckduckgo-browser');
  }
  const providerOrder = [primary, ...fallbackProviders].filter((provider, index, array) => array.indexOf(provider) === index);
  const params: AgentWebSearchParams = {
    ...rawParams,
    query,
    provider: primary,
    mode: normalizeMode(rawParams.searchMode || rawParams.mode),
    maxResults: normalizeMaxResults(rawParams.maxResults),
  };
  const errors: string[] = [];

  for (const provider of providerOrder) {
    const missing = getProviderMissingConfig(provider, params);
    if (missing) {
      errors.push(`${provider}: ${missing}`);
      continue;
    }
    try {
      const guarded = applyResultGuards(await runProvider(provider, params), params, provider);
      if (guarded.directAnswer || guarded.results.length > 0) {
        return {
          success: true,
          provider,
          engine: provider,
          usedFallback: provider !== primary,
          attemptedProviders: providerOrder.slice(0, providerOrder.indexOf(provider) + 1),
          directAnswer: guarded.directAnswer,
          results: guarded.results,
          query,
        };
      }
      errors.push(`${provider}: 未返回结果`);
    } catch (error) {
      errors.push(`${provider}: ${(error as Error).message}`);
    }
  }

  return {
    success: false,
    provider: primary,
    engine: primary,
    attemptedProviders: providerOrder,
    error: errors.join('；') || '未获得搜索结果，请检查网络、代理或搜索配置',
    results: [],
    query,
  };
};

export const runAgentWebOpen = async (rawParams: AgentWebOpenParams): Promise<AgentWebOpenResult> => {
  const url = typeof rawParams.url === 'string' ? rawParams.url.trim() : '';
  if (!url) return { success: false, url, error: 'URL 不能为空' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, url, error: 'URL 格式无效' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { success: false, url, error: '仅支持打开 http/https URL' };
  }

  const maxChars = Math.min(Math.max(Math.floor(Number(rawParams.maxChars) || 12000), 1000), 50000);
  try {
    const opened = await fetchTextResponse(parsed.href, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) GuyueMaster/1.0 Safari/537.36',
      },
      bypassCustomProtocolHandlers: true,
    });
    const isHtml = /html|xml|xhtml/i.test(opened.contentType) || /<html|<!doctype html/i.test(opened.text.slice(0, 500));
    const title = isHtml ? extractTagContent(opened.text, 'title') : '';
    const description = isHtml ? extractMetaContent(opened.text, ['description', 'og:description', 'twitter:description']) : '';
    const readable = isHtml ? htmlToReadableText(opened.text) : stripMarkup(opened.text);
    const content = readable.slice(0, maxChars);
    const excerpt = buildFocusedExcerpt(readable, rawParams.query, Math.min(2400, maxChars));

    return {
      success: true,
      url: parsed.href,
      finalUrl: opened.finalUrl || parsed.href,
      title,
      description,
      content,
      excerpt,
      html: rawParams.includeHtml ? opened.text.slice(0, maxChars) : undefined,
      contentType: opened.contentType,
    };
  } catch (error) {
    return {
      success: false,
      url: parsed.href,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const normalizeSpecializedMaxResults = (value: unknown, fallback?: unknown) => normalizeMaxResults(value ?? fallback, 8);

const getXmlTag = (xml: string, tagName: string): string => {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? stripMarkup(match[1]) : '';
};

const buildGitHubSearchQuery = (params: AgentSpecializedSearchParams) => {
  const parts = [params.query.trim()];
  const owner = params.owner?.trim();
  const repo = params.repo?.trim();
  if (owner && repo) parts.push(`repo:${owner}/${repo}`);
  else if (owner) parts.push(`user:${owner}`);
  if (params.language?.trim()) parts.push(`language:${params.language.trim()}`);
  if (params.githubType === 'issues') parts.push('is:issue');
  if (params.githubType === 'pull_requests') parts.push('is:pr');
  return parts.join(' ');
};

const searchGitHub = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const githubType = params.githubType || 'repositories';
  const endpointType = githubType === 'pull_requests' ? 'issues' : githubType;
  const url = new URL(`https://api.github.com/search/${endpointType}`);
  url.searchParams.set('q', buildGitHubSearchQuery(params));
  url.searchParams.set('per_page', String(normalizeSpecializedMaxResults(params.maxResults, params.specialized?.maxResults)));
  if (params.sort?.trim()) url.searchParams.set('sort', params.sort.trim());
  if (params.order === 'asc' || params.order === 'desc') url.searchParams.set('order', params.order);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Guyue-Master-Agent',
  };
  const token = params.specialized?.apiKeys?.github?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const data = await fetchJson(url.toString(), { headers });
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item: any): AgentWebSearchResult => {
    if (githubType === 'repositories') {
      return {
        title: String(item.full_name || item.name || '').trim(),
        url: String(item.html_url || '').trim(),
        snippet: [
          stripMarkup(item.description || ''),
          item.language ? `语言: ${item.language}` : '',
          Number.isFinite(item.stargazers_count) ? `Stars: ${item.stargazers_count}` : '',
          item.updated_at ? `更新: ${item.updated_at}` : '',
        ].filter(Boolean).join(' · '),
        source: 'github',
        publishedDate: item.updated_at,
        score: typeof item.score === 'number' ? item.score : undefined,
        meta: { type: githubType, fullName: item.full_name, stars: item.stargazers_count, forks: item.forks_count },
      };
    }
    if (githubType === 'code') {
      return {
        title: `${item.repository?.full_name || 'repository'} / ${item.path || item.name || 'file'}`,
        url: String(item.html_url || '').trim(),
        snippet: [item.name ? `文件: ${item.name}` : '', item.path ? `路径: ${item.path}` : '', item.repository?.description ? stripMarkup(item.repository.description) : ''].filter(Boolean).join(' · '),
        source: 'github',
        score: typeof item.score === 'number' ? item.score : undefined,
        meta: { type: githubType, repository: item.repository?.full_name, path: item.path, sha: item.sha },
      };
    }
    if (githubType === 'users') {
      return {
        title: String(item.login || '').trim(),
        url: String(item.html_url || '').trim(),
        snippet: [item.type ? `类型: ${item.type}` : '', Number.isFinite(item.score) ? `Score: ${item.score}` : ''].filter(Boolean).join(' · '),
        source: 'github',
        score: typeof item.score === 'number' ? item.score : undefined,
        meta: { type: githubType, login: item.login },
      };
    }
    return {
      title: `#${item.number || ''} ${stripMarkup(item.title || '')}`.trim(),
      url: String(item.html_url || '').trim(),
      snippet: [item.state ? `状态: ${item.state}` : '', item.user?.login ? `作者: ${item.user.login}` : '', item.updated_at ? `更新: ${item.updated_at}` : '', stripMarkup(item.body || '').slice(0, 500)].filter(Boolean).join(' · '),
      source: 'github',
      publishedDate: item.updated_at || item.created_at,
      score: typeof item.score === 'number' ? item.score : undefined,
      meta: { type: githubType, number: item.number, repositoryUrl: item.repository_url },
    };
  }).filter((item: AgentWebSearchResult) => item.title && item.url);
};

const searchNpm = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.searchParams.set('text', params.query);
  url.searchParams.set('size', String(normalizeSpecializedMaxResults(params.maxResults, params.specialized?.maxResults)));
  const data = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } });
  return (Array.isArray(data?.objects) ? data.objects : []).map((item: any): AgentWebSearchResult => {
    const pkg = item.package || {};
    return {
      title: String(pkg.name || '').trim(),
      url: String(pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name || ''}`).trim(),
      snippet: [stripMarkup(pkg.description || ''), pkg.version ? `版本: ${pkg.version}` : '', pkg.date ? `更新: ${pkg.date}` : ''].filter(Boolean).join(' · '),
      source: 'npm',
      publishedDate: pkg.date,
      score: typeof item.score?.final === 'number' ? item.score.final : undefined,
      meta: { version: pkg.version, keywords: pkg.keywords, publisher: pkg.publisher?.username },
    };
  }).filter((item: AgentWebSearchResult) => item.title && item.url);
};

const searchStackOverflow = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const url = new URL('https://api.stackexchange.com/2.3/search/advanced');
  url.searchParams.set('order', params.order || 'desc');
  url.searchParams.set('sort', params.sort || 'relevance');
  url.searchParams.set('q', params.query);
  url.searchParams.set('site', 'stackoverflow');
  url.searchParams.set('pagesize', String(normalizeSpecializedMaxResults(params.maxResults, params.specialized?.maxResults)));
  const tags = Array.isArray(params.tags) ? params.tags.map(tag => tag.trim()).filter(Boolean) : [];
  if (tags.length > 0) url.searchParams.set('tagged', tags.join(';'));
  const key = params.specialized?.apiKeys?.stackExchange?.trim();
  if (key) url.searchParams.set('key', key);
  const data = await fetchJson(url.toString(), { headers: { Accept: 'application/json' } });
  return (Array.isArray(data?.items) ? data.items : []).map((item: any): AgentWebSearchResult => ({
    title: stripMarkup(item.title || ''),
    url: String(item.link || '').trim(),
    snippet: [Number.isFinite(item.score) ? `Score: ${item.score}` : '', Number.isFinite(item.answer_count) ? `Answers: ${item.answer_count}` : '', Array.isArray(item.tags) && item.tags.length ? `Tags: ${item.tags.join(', ')}` : '', item.is_answered ? '已回答' : '未标记已回答'].filter(Boolean).join(' · '),
    source: 'stackoverflow',
    publishedDate: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : undefined,
    score: typeof item.score === 'number' ? item.score : undefined,
    meta: { questionId: item.question_id, answerCount: item.answer_count, tags: item.tags, isAnswered: item.is_answered },
  })).filter((item: AgentWebSearchResult) => item.title && item.url);
};

const searchArxiv = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const maxResults = normalizeSpecializedMaxResults(params.maxResults, params.specialized?.maxResults);
  const category = params.arxivCategory?.trim() || params.language?.trim();
  const searchQuery = `${category ? `cat:${category} AND ` : ''}all:${params.query}`;
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', searchQuery);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(maxResults));
  url.searchParams.set('sortBy', params.sort === 'submittedDate' ? 'submittedDate' : 'relevance');
  url.searchParams.set('sortOrder', params.order === 'asc' ? 'ascending' : 'descending');
  const xml = await fetchText(url.toString(), { headers: { Accept: 'application/atom+xml, application/xml, text/xml' } });
  return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).map((match): AgentWebSearchResult => {
    const entry = match[1];
    const id = getXmlTag(entry, 'id');
    const authors = Array.from(entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g))
      .map(authorMatch => stripMarkup(authorMatch[1]))
      .filter(Boolean)
      .slice(0, 5);
    return {
      title: getXmlTag(entry, 'title'),
      url: id,
      snippet: [authors.length ? `作者: ${authors.join(', ')}` : '', getXmlTag(entry, 'summary').slice(0, 900)].filter(Boolean).join(' · '),
      source: 'arxiv',
      publishedDate: getXmlTag(entry, 'published') || undefined,
      meta: { updated: getXmlTag(entry, 'updated') || undefined, authors },
    };
  }).filter(item => item.title && item.url);
};

const runSpecializedProvider = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  switch (params.source) {
    case 'github': return searchGitHub(params);
    case 'npm': return searchNpm(params);
    case 'stackoverflow': return searchStackOverflow(params);
    case 'arxiv': return searchArxiv(params);
    default: throw new Error('不支持的专用搜索源');
  }
};

export const runAgentSpecializedSearch = async (rawParams: AgentSpecializedSearchParams) => {
  const query = typeof rawParams.query === 'string' ? rawParams.query.trim() : '';
  const source = normalizeSpecializedSource(rawParams.source);
  if (!query) return { success: false, error: '搜索词不能为空', results: [], query };
  if (!source) return { success: false, error: '不支持的专用搜索源', results: [], query };
  const params: AgentSpecializedSearchParams = { ...rawParams, source, query };
  try {
    const results = await runSpecializedProvider(params);
    return {
      success: true,
      source,
      provider: source,
      engine: source,
      results: results.slice(0, normalizeSpecializedMaxResults(params.maxResults, params.specialized?.maxResults)),
      query,
    };
  } catch (error) {
    return { success: false, source, provider: source, engine: source, error: (error as Error).message, results: [], query };
  }
};
