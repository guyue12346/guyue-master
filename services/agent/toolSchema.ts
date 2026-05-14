import type { ChatTool } from '../chatService';

type JsonSchema = Record<string, any>;

export interface ToolArgumentValidationResult {
  ok: boolean;
  errors: string[];
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const toStrictJsonSchema = (schema: JsonSchema): JsonSchema => {
  if (!schema || typeof schema !== 'object') return schema;

  const next: JsonSchema = Array.isArray(schema) ? [...schema] : { ...schema };
  if (next.type === 'object') {
    next.additionalProperties = false;
    const properties = isPlainObject(next.properties) ? next.properties : {};
    next.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, toStrictJsonSchema(value as JsonSchema)]),
    );
  }
  if (next.type === 'array' && next.items) {
    next.items = toStrictJsonSchema(next.items);
  }
  if (Array.isArray(next.anyOf)) next.anyOf = next.anyOf.map(toStrictJsonSchema);
  if (Array.isArray(next.oneOf)) next.oneOf = next.oneOf.map(toStrictJsonSchema);
  if (Array.isArray(next.allOf)) next.allOf = next.allOf.map(toStrictJsonSchema);
  return next;
};

export const toStrictTool = (tool: ChatTool): ChatTool => ({
  ...tool,
  inputSchema: toStrictJsonSchema(tool.inputSchema || { type: 'object', properties: {} }),
});

const validateValue = (schema: JsonSchema, value: unknown, path: string, errors: string[]) => {
  if (!schema || typeof schema !== 'object') return;

  if (Array.isArray(schema.enum) && value !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path} 必须是 ${schema.enum.join(' / ')} 之一`);
    return;
  }

  if (value === undefined || value === null) return;

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') errors.push(`${path} 必须是字符串`);
      break;
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(`${path} 必须是数字`);
      } else if (schema.type === 'integer' && !Number.isInteger(value)) {
        errors.push(`${path} 必须是整数`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path} 必须是布尔值`);
      break;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path} 必须是数组`);
      } else if (schema.items) {
        value.forEach((item, index) => validateValue(schema.items, item, `${path}[${index}]`, errors));
      }
      break;
    case 'object': {
      if (!isPlainObject(value)) {
        errors.push(`${path} 必须是对象`);
        return;
      }
      const properties = isPlainObject(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      required.forEach((key: string) => {
        if (value[key] === undefined || value[key] === null || value[key] === '') {
          errors.push(`${path}.${key} 是必填参数`);
        }
      });
      Object.keys(value).forEach(key => {
        if (!properties[key]) {
          errors.push(`${path}.${key} 不是支持的参数`);
          return;
        }
        validateValue(properties[key], value[key], `${path}.${key}`, errors);
      });
      break;
    }
    default:
      break;
  }
};

export const validateToolArguments = (
  tool: ChatTool,
  args: Record<string, any>,
): ToolArgumentValidationResult => {
  const errors: string[] = [];
  const schema = tool.inputSchema || { type: 'object', properties: {} };
  validateValue(schema, args, tool.name, errors);
  return { ok: errors.length === 0, errors };
};
