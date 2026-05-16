import type { ToolRegistration } from '../toolRegistry';
import { CANVAS_TOOL_REGISTRATIONS } from './canvasTools';
import { CAPABILITY_TOOL_REGISTRATIONS } from './capabilityTools';
import { CODE_TOOL_REGISTRATIONS } from './codeTools';
import { DATA_CENTER_TOOL_REGISTRATIONS } from './dataCenterTools';
import { EMAIL_TOOL_REGISTRATIONS } from './emailTools';
import { FILE_TOOL_REGISTRATIONS } from './fileTools';
import { GIT_TOOL_REGISTRATIONS } from './gitTools';
import { IMAGE_TOOL_REGISTRATIONS } from './imageTools';
import { KNOWLEDGE_TOOL_REGISTRATIONS } from './knowledgeTools';
import { LATEX_TOOL_REGISTRATIONS } from './latexTools';
import { LEARNING_TOOL_REGISTRATIONS } from './learningTools';
import { MCP_TOOL_REGISTRATIONS } from './mcpTools';
import { NOTE_TOOL_REGISTRATIONS } from './noteTools';
import { QUESTION_BANK_TOOL_REGISTRATIONS } from './questionBankTools';
import { SKILL_TOOL_REGISTRATIONS } from './skillTools';
import { SYSTEM_TOOL_REGISTRATIONS } from './systemTools';
import { TODO_TOOL_REGISTRATIONS } from './todoTools';
import { createDynamicAgentToolRegistry } from '../dynamicToolRegistry';
import {
  createToolRegistryCapabilityProvider,
  registerAgentCapabilityProvider,
} from '../capabilityProviders';

export const BUILTIN_TOOL_REGISTRATIONS: ToolRegistration[] = [
  ...SYSTEM_TOOL_REGISTRATIONS,
  ...CAPABILITY_TOOL_REGISTRATIONS,
  ...SKILL_TOOL_REGISTRATIONS,
  ...MCP_TOOL_REGISTRATIONS,
  ...TODO_TOOL_REGISTRATIONS,
  ...NOTE_TOOL_REGISTRATIONS,
  ...DATA_CENTER_TOOL_REGISTRATIONS,
  ...LEARNING_TOOL_REGISTRATIONS,
  ...FILE_TOOL_REGISTRATIONS,
  ...QUESTION_BANK_TOOL_REGISTRATIONS,
  ...CODE_TOOL_REGISTRATIONS,
  ...CANVAS_TOOL_REGISTRATIONS,
  ...GIT_TOOL_REGISTRATIONS,
  ...IMAGE_TOOL_REGISTRATIONS,
  ...EMAIL_TOOL_REGISTRATIONS,
  ...KNOWLEDGE_TOOL_REGISTRATIONS,
  ...LATEX_TOOL_REGISTRATIONS,
];

const mutableToolRegistry: ToolRegistration[] = [];

export const AGENT_TOOL_REGISTRY = createDynamicAgentToolRegistry(mutableToolRegistry);

AGENT_TOOL_REGISTRY.registerMany(BUILTIN_TOOL_REGISTRATIONS, {
  kind: 'builtin',
  ownerId: 'guyue-core',
});

registerAgentCapabilityProvider(createToolRegistryCapabilityProvider(() => AGENT_TOOL_REGISTRY.list()));

export const TOOL_REGISTRY = AGENT_TOOL_REGISTRY.mutableList();
export const getToolRegistry = () => AGENT_TOOL_REGISTRY.list();
export const getToolRegistryOwner = AGENT_TOOL_REGISTRY.getOwner.bind(AGENT_TOOL_REGISTRY);
export const registerAgentTool = AGENT_TOOL_REGISTRY.register.bind(AGENT_TOOL_REGISTRY);
export const unregisterAgentTool = AGENT_TOOL_REGISTRY.unregister.bind(AGENT_TOOL_REGISTRY);
export const unregisterAgentToolsByOwner = AGENT_TOOL_REGISTRY.unregisterByOwner.bind(AGENT_TOOL_REGISTRY);
