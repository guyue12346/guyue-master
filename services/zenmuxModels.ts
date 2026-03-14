// Zenmux 支持的所有模型列表
// 更新时间: 2026-03-02

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  category: string;
  description?: string;
}

export const ZENMUX_MODELS: ModelInfo[] = [
  // === Anthropic Claude 系列 ===
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'zenmux', category: 'Claude', description: '最强推理能力' },
  { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5', provider: 'zenmux', category: 'Claude', description: '顶级智能' },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'zenmux', category: 'Claude', description: '平衡性能与成本' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'zenmux', category: 'Claude', description: '快速响应' },
  { id: 'anthropic/claude-opus-4.1', name: 'Claude Opus 4.1', provider: 'zenmux', category: 'Claude' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', provider: 'zenmux', category: 'Claude' },
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'zenmux', category: 'Claude' },
  { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'zenmux', category: 'Claude' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'zenmux', category: 'Claude' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'zenmux', category: 'Claude' },
  
  // === OpenAI GPT 系列 ===
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', provider: 'zenmux', category: 'GPT', description: '最新旗舰模型' },
  { id: 'openai/gpt-5.2-chat', name: 'GPT-5.2 Chat', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'zenmux', category: 'GPT', description: '编程专用' },
  { id: 'openai/gpt-5', name: 'GPT-5', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-5-chat', name: 'GPT-5 Chat', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-5-codex', name: 'GPT-5 Codex', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'zenmux', category: 'GPT', description: '轻量高效' },
  { id: 'openai/gpt-5-nano', name: 'GPT-5 Nano', provider: 'zenmux', category: 'GPT', description: '超快响应' },
  { id: 'openai/gpt-5.1', name: 'GPT-5.1', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-5.1-chat', name: 'GPT-5.1 Chat', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', provider: 'zenmux', category: 'GPT' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'zenmux', category: 'GPT', description: '全能模型' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'zenmux', category: 'GPT', description: '经济实惠' },
  { id: 'openai/o4-mini', name: 'o4 Mini', provider: 'zenmux', category: 'GPT' },
  
  // === Google Gemini/Gemma 系列 ===
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'zenmux', category: 'Gemini', description: '快速响应' },
  { id: 'google/gemini-2.0-flash-lite-001', name: 'Gemini 2.0 Flash Lite', provider: 'zenmux', category: 'Gemini' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'zenmux', category: 'Gemini' },
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'zenmux', category: 'Gemini' },
  { id: 'google/gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', provider: 'zenmux', category: 'Gemini', description: '图像理解' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'zenmux', category: 'Gemini', description: '专业级' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'zenmux', category: 'Gemini', description: '预览版' },
  { id: 'google/gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', provider: 'zenmux', category: 'Gemini' },
  { id: 'google/gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image Preview', provider: 'zenmux', category: 'Gemini' },
  { id: 'google/gemma-3-12b-it', name: 'Gemma 3 12B IT', provider: 'zenmux', category: 'Gemini' },
  
  // === xAI Grok 系列 ===
  { id: 'x-ai/grok-4', name: 'Grok 4', provider: 'zenmux', category: 'Grok', description: 'xAI最新模型' },
  { id: 'x-ai/grok-4-fast', name: 'Grok 4 Fast', provider: 'zenmux', category: 'Grok', description: '快速版本' },
  { id: 'x-ai/grok-4-fast-non-reasoning', name: 'Grok 4 Fast (Non-Reasoning)', provider: 'zenmux', category: 'Grok' },
  { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', provider: 'zenmux', category: 'Grok' },
  { id: 'x-ai/grok-4.1-fast-non-reasoning', name: 'Grok 4.1 Fast (Non-Reasoning)', provider: 'zenmux', category: 'Grok' },
  { id: 'x-ai/grok-code-fast-1', name: 'Grok Code Fast 1', provider: 'zenmux', category: 'Grok', description: '代码专用' },
  
  // === Z.AI GLM 智谱系列 ===
  { id: 'z-ai/glm-4.7', name: 'GLM 4.7', provider: 'zenmux', category: 'GLM', description: '最新版本' },
  { id: 'z-ai/glm-4.6v', name: 'GLM 4.6V', provider: 'zenmux', category: 'GLM', description: '多模态' },
  { id: 'z-ai/glm-4.6v-flash', name: 'GLM 4.6V Flash', provider: 'zenmux', category: 'GLM' },
  { id: 'z-ai/glm-4.6', name: 'GLM 4.6', provider: 'zenmux', category: 'GLM' },
  { id: 'z-ai/glm-4.5', name: 'GLM 4.5', provider: 'zenmux', category: 'GLM' },
  { id: 'z-ai/glm-4.5-air', name: 'GLM 4.5 Air', provider: 'zenmux', category: 'GLM', description: '轻量版' },
  
  // === DeepSeek 系列 ===
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'zenmux', category: 'DeepSeek', description: '对话模型' },
  { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek Chat V3.1', provider: 'zenmux', category: 'DeepSeek' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', provider: 'zenmux', category: 'DeepSeek' },
  { id: 'deepseek/deepseek-v3.2-exp', name: 'DeepSeek V3.2 Exp', provider: 'zenmux', category: 'DeepSeek' },
  { id: 'deepseek/deepseek-r1-0528', name: 'DeepSeek R1-0528', provider: 'zenmux', category: 'DeepSeek' },
  { id: 'deepseek/deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'zenmux', category: 'DeepSeek', description: '推理模型' },
  
  // === Qwen 通义千问系列 ===
  { id: 'qwen/qwen3-coder', name: 'Qwen3 Coder', provider: 'zenmux', category: 'Qwen', description: '编程助手' },
  { id: 'qwen/qwen3-coder-plus', name: 'Qwen3 Coder Plus', provider: 'zenmux', category: 'Qwen' },
  { id: 'qwen/qwen3-max', name: 'Qwen3 Max', provider: 'zenmux', category: 'Qwen', description: '最强版本' },
  { id: 'qwen/qwen3-max-preview', name: 'Qwen3 Max Preview', provider: 'zenmux', category: 'Qwen' },
  { id: 'qwen/qwen3-vl-plus', name: 'Qwen3 VL Plus', provider: 'zenmux', category: 'Qwen', description: '视觉语言' },
  { id: 'qwen/qwen3-14b', name: 'Qwen3 14B', provider: 'zenmux', category: 'Qwen' },
  { id: 'qwen/qwen3-235b-a22b-2507', name: 'Qwen3 235B A22B', provider: 'zenmux', category: 'Qwen' },
  { id: 'qwen/qwen3-235b-a22b-thinking-2507', name: 'Qwen3 235B Thinking', provider: 'zenmux', category: 'Qwen' },
  
  // === Moonshot Kimi 系列 ===
  { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', provider: 'zenmux', category: 'Kimi', description: '最新版本' },
  { id: 'moonshotai/kimi-k2-thinking', name: 'Kimi K2 Thinking', provider: 'zenmux', category: 'Kimi', description: '思维链' },
  { id: 'moonshotai/kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo', provider: 'zenmux', category: 'Kimi' },
  { id: 'moonshotai/kimi-k2-0711', name: 'Kimi K2-0711', provider: 'zenmux', category: 'Kimi' },
  { id: 'moonshotai/kimi-k2-0905', name: 'Kimi K2-0905', provider: 'zenmux', category: 'Kimi' },
  
  // === 百度 ERNIE 文心系列 ===
  { id: 'baidu/ernie-5.0-thinking-preview', name: 'ERNIE 5.0 Thinking Preview', provider: 'zenmux', category: 'ERNIE', description: '思维预览' },
  { id: 'baidu/ernie-x1.1-preview', name: 'ERNIE X1.1 Preview', provider: 'zenmux', category: 'ERNIE' },
  
  // === InclusionAI 系列 ===
  { id: 'inclusionai/ling-1t', name: 'Ling-1T', provider: 'zenmux', category: 'InclusionAI' },
  { id: 'inclusionai/ling-flash-2.0', name: 'Ling Flash 2.0', provider: 'zenmux', category: 'InclusionAI' },
  { id: 'inclusionai/ling-mini-2.0', name: 'Ling Mini 2.0', provider: 'zenmux', category: 'InclusionAI' },
  { id: 'inclusionai/llada2.0-flash-cap', name: 'LLADA 2.0 Flash Cap', provider: 'zenmux', category: 'InclusionAI' },
  { id: 'inclusionai/ming-flash-omni-preview', name: 'Ming Flash Omni Preview', provider: 'zenmux', category: 'InclusionAI' },
  { id: 'inclusionai/ring-1t', name: 'Ring-1T', provider: 'zenmux', category: 'InclusionAI' },
  { id: 'inclusionai/ring-flash-2.0', name: 'Ring Flash 2.0', provider: 'zenmux', category: 'InclusionAI' },
  { id: 'inclusionai/ring-mini-2.0', name: 'Ring Mini 2.0', provider: 'zenmux', category: 'InclusionAI' },
  
  // === Meta Llama 系列 ===
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'zenmux', category: 'Llama' },
  { id: 'meta/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', provider: 'zenmux', category: 'Llama' },
  
  // === Mistral 系列 ===
  { id: 'mistralai/mistral-large-2512', name: 'Mistral Large 2512', provider: 'zenmux', category: 'Mistral' },
  
  // === MiniMax 系列 ===
  { id: 'minimax/minimax-m2.1', name: 'MiniMax M2.1', provider: 'zenmux', category: 'MiniMax', description: '最新版本' },
  { id: 'minimax/minimax-m2-her', name: 'MiniMax M2 Her', provider: 'zenmux', category: 'MiniMax' },
  { id: 'minimax/minimax-m2', name: 'MiniMax M2', provider: 'zenmux', category: 'MiniMax' },
  
  // === 快手 KAT 系列 ===
  { id: 'kuaishou/kat-coder-pro-v1', name: 'KAT-Coder-Pro-V1', provider: 'zenmux', category: 'KAT', description: '编程助手' },
  
  // === StepFun 阶跃星辰 ===
  { id: 'stepfun/step-3', name: 'Step-3', provider: 'zenmux', category: 'StepFun' },
  
  // === 火山引擎 豆包系列 ===
  { id: 'volcengine/doubao-seed-1-6-vision', name: 'Doubao Seed 1.6 Vision', provider: 'zenmux', category: 'Doubao', description: '视觉理解' },
  { id: 'volcengine/doubao-seed-1.8', name: 'Doubao Seed 1.8', provider: 'zenmux', category: 'Doubao' },
  { id: 'volcengine/doubao-seed-code', name: 'Doubao Seed Code', provider: 'zenmux', category: 'Doubao', description: '代码生成' },
  
  // === 小米 MiMo 系列 ===
  { id: 'xiaomi/mimo-v2-flash', name: 'MiMo V2 Flash', provider: 'zenmux', category: 'MiMo' },
];

// 按类别分组模型
export const GROUPED_ZENMUX_MODELS = ZENMUX_MODELS.reduce((acc, model) => {
  if (!acc[model.category]) {
    acc[model.category] = [];
  }
  acc[model.category].push(model);
  return acc;
}, {} as Record<string, ModelInfo[]>);

// 获取推荐模型
export const RECOMMENDED_MODELS = [
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-4o',
  'google/gemini-2.5-pro',
  'deepseek/deepseek-reasoner',
  'qwen/qwen3-max',
];

// 支持 Tool Calling 的 Zenmux 模型（Agent 专用）
// 排除：纯推理模型(R1)、图像专用模型、小参数开源模型(Gemma/Llama/MiMo)、InclusionAI
const TOOL_CALLING_CATEGORIES = new Set(['Claude', 'GPT', 'Gemini', 'Grok', 'GLM', 'DeepSeek', 'Qwen', 'Kimi', 'MiniMax', 'Mistral', 'Doubao', 'ERNIE', 'StepFun', 'KAT']);
const TOOL_CALLING_EXCLUDE_IDS = new Set([
  'deepseek/deepseek-r1-0528',
  'deepseek/deepseek-reasoner',
  'google/gemma-3-12b-it',
  'google/gemini-2.5-flash-image',
  'google/gemini-3-pro-image-preview',
]);

export const ZENMUX_AGENT_MODELS = ZENMUX_MODELS.filter(
  m => TOOL_CALLING_CATEGORIES.has(m.category) && !TOOL_CALLING_EXCLUDE_IDS.has(m.id)
);
