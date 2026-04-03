/**
 * Langflow Service — API 调用 + JSON 解析
 */

// ── Langflow JSON 格式类型 ──

export interface LangflowField {
  type: string;
  required: boolean;
  value: any;
  display_name: string;
  advanced: boolean;
  input_types?: string[];
  options?: string[];
  multiline?: boolean;
  info?: string;
  name?: string;
  show?: boolean;
}

export interface LangflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    type: string;
    node?: {
      display_name?: string;
      description?: string;
      template?: Record<string, LangflowField>;
      base_classes?: string[];
      output_types?: string[];
    };
    id?: string;
    display_name?: string;
    description?: string;
  };
}

export interface LangflowEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Record<string, any>;
}

export interface LangflowExport {
  id?: string;
  name?: string;
  description?: string;
  data: {
    nodes: LangflowNode[];
    edges: LangflowEdge[];
    viewport?: { x: number; y: number; zoom: number };
  };
  is_component?: boolean;
  endpoint_name?: string;
}

// ── App 内部数据模型 ──

export interface WorkflowInputField {
  key: string;
  nodeId: string;
  displayName: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'textarea';
  defaultValue: any;
  required: boolean;
  options?: string[];
  description?: string;
}

export interface TweakField {
  nodeId: string;
  nodeName: string;
  fieldKey: string;
  fieldName: string;
  type: string;
  currentValue: any;
}

export interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  langflowFlowId?: string;
  rawJson: LangflowExport;
  inputFields: WorkflowInputField[];
  tweakableFields: TweakField[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
  runCount: number;
  lastRunAt?: number;
}

export interface LangflowConnection {
  baseUrl: string;
  apiKey: string;
  verified: boolean;
  lastTestedAt?: number;
}

export interface WorkflowRunRecord {
  id: string;
  workflowId: string;
  input: Record<string, any>;
  tweaks: Record<string, any>;
  output: any;
  status: 'running' | 'success' | 'error';
  error?: string;
  duration?: number;
  timestamp: number;
}

// ── 节点类型颜色映射 ──

const NODE_TYPE_PATTERNS: [RegExp, { color: string; label: string }][] = [
  [/input|chatinput/i, { color: '#10B981', label: '输入' }],
  [/output|chatoutput/i, { color: '#F59E0B', label: '输出' }],
  [/openai|anthropic|llm|model|groq|ollama|huggingface|vertexai|gemini/i, { color: '#8B5CF6', label: '模型' }],
  [/prompt|template/i, { color: '#3B82F6', label: '提示词' }],
  [/tool|agent|crew/i, { color: '#EF4444', label: '工具' }],
  [/retriever|vectorstore|memory|store|chroma|pinecone|qdrant|weaviate|astra/i, { color: '#06B6D4', label: '检索' }],
  [/text.*splitter|chunk|parser|loader|document/i, { color: '#14B8A6', label: '处理' }],
  [/embedding/i, { color: '#A78BFA', label: '嵌入' }],
  [/chain|conditional|router|flow/i, { color: '#F472B6', label: '流程' }],
];

export function getNodeStyle(nodeType: string): { color: string; label: string } {
  for (const [pattern, style] of NODE_TYPE_PATTERNS) {
    if (pattern.test(nodeType)) return style;
  }
  return { color: '#6B7280', label: '通用' };
}

// ── JSON 解析 ──

export function validateLangflowJson(json: any): json is LangflowExport {
  if (!json || typeof json !== 'object') return false;
  if (!json.data || !Array.isArray(json.data.nodes) || !Array.isArray(json.data.edges)) return false;
  return true;
}

function getNodeDisplayName(node: LangflowNode): string {
  return node.data?.node?.display_name
    || node.data?.display_name
    || node.data?.type
    || node.type
    || 'Unknown';
}

function getNodeDescription(node: LangflowNode): string {
  return node.data?.node?.description
    || node.data?.description
    || '';
}

function getNodeType(node: LangflowNode): string {
  return node.data?.type || node.type || 'unknown';
}

/** 自动检测工作流的输入参数 */
export function extractInputFields(json: LangflowExport): WorkflowInputField[] {
  const fields: WorkflowInputField[] = [];
  for (const node of json.data.nodes) {
    const nodeType = getNodeType(node).toLowerCase();
    // ChatInput, TextInput 等输入节点
    if (nodeType.includes('input')) {
      const template = node.data?.node?.template;
      if (template) {
        for (const [key, field] of Object.entries(template)) {
          if (key.startsWith('_') || field.show === false) continue;
          if (['input_value', 'message', 'text', 'query', 'input'].includes(key)) {
            fields.push({
              key,
              nodeId: node.id,
              displayName: field.display_name || key,
              type: field.multiline ? 'textarea' : 'text',
              defaultValue: field.value ?? '',
              required: field.required || false,
              description: field.info,
            });
          }
        }
      }
      // Fallback: if no specific field found, add a generic input_value
      if (fields.filter(f => f.nodeId === node.id).length === 0) {
        fields.push({
          key: 'input_value',
          nodeId: node.id,
          displayName: getNodeDisplayName(node),
          type: 'textarea',
          defaultValue: '',
          required: true,
          description: `${getNodeDisplayName(node)} 的输入`,
        });
      }
    }
  }
  // If no input nodes found at all, add a default input
  if (fields.length === 0) {
    fields.push({
      key: 'input_value',
      nodeId: '__default__',
      displayName: '输入',
      type: 'textarea',
      defaultValue: '',
      required: true,
      description: '工作流输入值',
    });
  }
  return fields;
}

/** 自动检测可 Tweak 的参数 */
export function extractTweakFields(json: LangflowExport): TweakField[] {
  const fields: TweakField[] = [];
  const interestingKeys = new Set([
    'model_name', 'model', 'temperature', 'max_tokens', 'top_p', 'top_k',
    'api_key', 'base_url', 'chunk_size', 'chunk_overlap', 'k', 'num_results',
    'system_message', 'system_prompt',
  ]);

  for (const node of json.data.nodes) {
    const template = node.data?.node?.template;
    if (!template) continue;
    const nodeName = getNodeDisplayName(node);
    for (const [key, field] of Object.entries(template)) {
      if (key.startsWith('_') || field.show === false) continue;
      if (interestingKeys.has(key) || (!field.advanced && field.type === 'str' && key.includes('model'))) {
        fields.push({
          nodeId: node.id,
          nodeName,
          fieldKey: key,
          fieldName: field.display_name || key,
          type: field.type,
          currentValue: field.value,
        });
      }
    }
  }
  return fields;
}

/** 解析 Langflow JSON 为 WorkflowItem */
export function parseLangflowJson(json: LangflowExport): Omit<WorkflowItem, 'id' | 'createdAt' | 'updatedAt' | 'runCount' | 'lastRunAt'> {
  return {
    name: json.name || json.endpoint_name || '未命名工作流',
    description: json.description || `${json.data.nodes.length} 个节点, ${json.data.edges.length} 条连线`,
    langflowFlowId: json.id,
    rawJson: json,
    inputFields: extractInputFields(json),
    tweakableFields: extractTweakFields(json),
    tags: [],
  };
}

/** 获取节点统计 */
export function getNodeStats(json: LangflowExport): { type: string; color: string; count: number }[] {
  const counts = new Map<string, { color: string; count: number }>();
  for (const node of json.data.nodes) {
    const nodeType = getNodeType(node);
    const style = getNodeStyle(nodeType);
    const existing = counts.get(style.label);
    if (existing) {
      existing.count++;
    } else {
      counts.set(style.label, { color: style.color, count: 1 });
    }
  }
  return Array.from(counts.entries()).map(([type, v]) => ({ type, ...v }));
}

// ── Langflow API 调用 ──

export async function testConnection(conn: LangflowConnection): Promise<{ ok: boolean; error?: string; flowCount?: number }> {
  try {
    const url = `${conn.baseUrl.replace(/\/+$/, '')}/api/v1/flows/`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(conn.apiKey ? { 'x-api-key': conn.apiKey } : {}),
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data = await res.json();
    const flowCount = Array.isArray(data) ? data.length : (data?.flows?.length ?? 0);
    return { ok: true, flowCount };
  } catch (e: any) {
    return { ok: false, error: e.message || '连接失败' };
  }
}

export interface RunFlowOptions {
  connection: LangflowConnection;
  flowId: string;
  inputValue: string;
  tweaks?: Record<string, Record<string, any>>;
  inputType?: string;
  outputType?: string;
}

export interface RunFlowResult {
  success: boolean;
  output?: string;
  rawResponse?: any;
  error?: string;
  duration: number;
  sessionId?: string;
}

export async function runFlow(options: RunFlowOptions): Promise<RunFlowResult> {
  const start = Date.now();
  try {
    const { connection, flowId, inputValue, tweaks, inputType = 'chat', outputType = 'chat' } = options;
    const url = `${connection.baseUrl.replace(/\/+$/, '')}/api/v1/run/${flowId}`;

    const body: any = {
      input_value: inputValue,
      input_type: inputType,
      output_type: outputType,
    };
    if (tweaks && Object.keys(tweaks).length > 0) {
      body.tweaks = tweaks;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(connection.apiKey ? { 'x-api-key': connection.apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    const duration = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 500)}`, duration };
    }

    const data = await res.json();

    // Extract output — Langflow response format varies
    let output = '';
    if (data?.outputs) {
      // v1 format: outputs[0].outputs[0].results.message.text or .data.text
      try {
        const firstOutput = data.outputs[0]?.outputs?.[0];
        output = firstOutput?.results?.message?.text
          || firstOutput?.results?.message?.data?.text
          || firstOutput?.results?.text?.text
          || firstOutput?.artifacts?.message
          || JSON.stringify(firstOutput?.results || firstOutput, null, 2);
      } catch {
        output = JSON.stringify(data.outputs, null, 2);
      }
    } else if (data?.result) {
      output = typeof data.result === 'string' ? data.result : (data.result.output || JSON.stringify(data.result, null, 2));
    } else {
      output = JSON.stringify(data, null, 2);
    }

    return {
      success: true,
      output,
      rawResponse: data,
      duration,
      sessionId: data.session_id,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || '运行失败',
      duration: Date.now() - start,
    };
  }
}

// ── 工具函数 ──

export function generateId(): string {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export { getNodeDisplayName, getNodeType, getNodeDescription };
