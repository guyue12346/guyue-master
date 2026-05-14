import type { ToolRegistration } from '../toolRegistry';
import { CANVAS_TOOL_REGISTRATIONS } from './canvasTools';
import { DATA_CENTER_TOOL_REGISTRATIONS } from './dataCenterTools';
import { EMAIL_TOOL_REGISTRATIONS } from './emailTools';
import { FILE_TOOL_REGISTRATIONS } from './fileTools';
import { GIT_TOOL_REGISTRATIONS } from './gitTools';
import { IMAGE_TOOL_REGISTRATIONS } from './imageTools';
import { KNOWLEDGE_TOOL_REGISTRATIONS } from './knowledgeTools';
import { LATEX_TOOL_REGISTRATIONS } from './latexTools';
import { LEARNING_TOOL_REGISTRATIONS } from './learningTools';
import { NOTE_TOOL_REGISTRATIONS } from './noteTools';
import { QUESTION_BANK_TOOL_REGISTRATIONS } from './questionBankTools';
import { TODO_TOOL_REGISTRATIONS } from './todoTools';

export const TOOL_REGISTRY: ToolRegistration[] = [
  ...TODO_TOOL_REGISTRATIONS,
  ...NOTE_TOOL_REGISTRATIONS,
  ...DATA_CENTER_TOOL_REGISTRATIONS,
  ...LEARNING_TOOL_REGISTRATIONS,
  ...FILE_TOOL_REGISTRATIONS,
  ...QUESTION_BANK_TOOL_REGISTRATIONS,
  ...CANVAS_TOOL_REGISTRATIONS,
  ...GIT_TOOL_REGISTRATIONS,
  ...IMAGE_TOOL_REGISTRATIONS,
  ...EMAIL_TOOL_REGISTRATIONS,
  ...KNOWLEDGE_TOOL_REGISTRATIONS,
  ...LATEX_TOOL_REGISTRATIONS,
];
