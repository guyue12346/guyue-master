import type { ComponentType } from 'react';
import {
  Brain,
  BookOpenCheck,
  Code2,
  FileType2,
  Flame,
  FolderOpen,
  GraduationCap,
  GitBranch,
  Image,
  ListTodo,
  Mail,
  Package,
  Pencil,
  PencilRuler,
  Server,
  Sparkles,
  StickyNote,
  Webhook,
} from 'lucide-react';
import type { ChatConfig } from '../chatService';

export interface AgentModule {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  enabled: boolean;
  description: string;
}

export const AGENT_MODULES: AgentModule[] = [
  { id: 'todo',       name: '待办事项', icon: ListTodo,       enabled: true, description: '创建、查询待办事项' },
  { id: 'dc-oj',      name: 'OJ记录',    icon: Flame,          enabled: true, description: '查询 OJ 统计、创建做题记录' },
  { id: 'dc-resources', name: '资源中心', icon: Package,       enabled: true, description: '查询、创建、修改、删除资源记录' },
  { id: 'dc-ssh',     name: 'SSH管理',   icon: Server,         enabled: true, description: '查询、创建、修改、删除 SSH 连接记录' },
  { id: 'dc-api',     name: 'API记录',   icon: Webhook,        enabled: true, description: '查询、创建、修改、删除 API 接口记录' },
  { id: 'learning',   name: '学习',     icon: GraduationCap, enabled: true, description: '创建课程、查询学习分类' },
  { id: 'leetcode',   name: '刷题',     icon: Code2,         enabled: true, description: '创建题单、查询已有题单' },
  { id: 'question-bank', name: '题库', icon: BookOpenCheck,  enabled: true, description: '查询、创建、修改题目、题库分类和解题方法' },
  { id: 'canvas',     name: '画布',     icon: PencilRuler,   enabled: true, description: '查询、创建、修改画布和画布分类' },
  { id: 'git',        name: 'Git管理',  icon: GitBranch,     enabled: true, description: '查询仓库状态、提交记录，执行暂存、提交、拉取和推送' },
  { id: 'files',      name: '文件管理', icon: FolderOpen,    enabled: true, description: '查询、读取文件管理中的文件（需授权分类）' },
  { id: 'knowledge',  name: '知识库',   icon: Brain,         enabled: true, description: '构建本地文件知识库并进行语义检索' },
  { id: 'prompts',    name: 'Skills',   icon: Sparkles,      enabled: true, description: '创建 Prompt 技能卡' },
  { id: 'notes',      name: '笔记备忘', icon: StickyNote,    enabled: true, description: '创建便签笔记' },
  { id: 'image',      name: '图床',     icon: Image,         enabled: true, description: '查询图片链接、上传图片到图床' },
  { id: 'markdown',   name: 'Markdown', icon: Pencil,        enabled: true, description: '创建 Markdown 笔记' },
  { id: 'latex',      name: 'LaTeX',    icon: FileType2,     enabled: true, description: '查询、读取、编辑 LaTeX 文件和模板（需授权分类）' },
  { id: 'email',      name: '邮件',     icon: Mail,          enabled: true, description: '发送邮件' },
];

export const ENABLED_AGENT_MODULES = AGENT_MODULES.filter(module => module.enabled);

export const getModuleById = (moduleId?: string | null) =>
  AGENT_MODULES.find(module => module.id === moduleId) || null;

export const isNativeProvider = (provider: ChatConfig['provider']) =>
  ['openai', 'anthropic', 'gemini', 'zenmux', 'moonshot', 'deepseek'].includes(provider);

export const isStepwiseNativeProvider = (provider: ChatConfig['provider']) =>
  ['openai', 'zenmux', 'moonshot', 'deepseek'].includes(provider);
