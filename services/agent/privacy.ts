export interface SensitiveInputDetection {
  matched: boolean;
  kinds: string[];
  redactedText: string;
}

const PASSWORD_LABEL_PATTERN = /(^|[\s"'`，。；;,\n\r])((?:登录|账户|账号|网站|本地)?\s*(?:密码|口令)|password|passwd|pwd)(?:\s*(?:是|为|叫|设为|设置为|填为|填成|[:=：])\s*|\s+)([^\s"'`，。；;,\n\r]{3,})/gi;
const SECRET_LABEL_PATTERN = /(^|[\s"'`，。；;,\n\r])((?:api\s*key|apikey|access[_\-\s]?token|token|secret|bearer|authorization|client[_\-\s]?secret|private[_\-\s]?key|密钥|令牌|访问令牌|私钥))(?:\s*(?:是|为|叫|设为|设置为|填为|填成|[:=：])\s*|\s+)([^\s"'`，。；;,\n\r]{6,})/gi;
const URL_PASSWORD_PARAM_PATTERN = /([?&](?:password|passwd|pwd)=)([^&#\s]{3,})/gi;
const URL_SECRET_PARAM_PATTERN = /([?&](?:api[_-]?key|token|access_token|secret|client_secret)=)([^&#\s]{6,})/gi;
const OPENAI_STYLE_KEY_PATTERN = /\b(sk-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,})\b/g;
const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g;
const PEM_PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g;

const addKind = (kinds: Set<string>, kind: string) => kinds.add(kind);

export const detectSensitiveInput = (text: string): SensitiveInputDetection => {
  const source = text || '';
  const kinds = new Set<string>();
  let redactedText = source;

  redactedText = redactedText.replace(PEM_PRIVATE_KEY_PATTERN, () => {
    addKind(kinds, '私钥');
    return '-----BEGIN PRIVATE KEY-----[已拦截]-----END PRIVATE KEY-----';
  });
  redactedText = redactedText.replace(PASSWORD_LABEL_PATTERN, (_match, prefix, label) => {
    addKind(kinds, '密码');
    return `${prefix}${String(label).trim()}: [已拦截]`;
  });
  redactedText = redactedText.replace(SECRET_LABEL_PATTERN, (_match, prefix, label) => {
    addKind(kinds, '密钥/令牌');
    return `${prefix}${label}: [已拦截]`;
  });
  redactedText = redactedText.replace(URL_PASSWORD_PARAM_PATTERN, (_match, prefix) => {
    addKind(kinds, 'URL 密码参数');
    return `${prefix}[已拦截]`;
  });
  redactedText = redactedText.replace(URL_SECRET_PARAM_PATTERN, (_match, prefix) => {
    addKind(kinds, 'URL 密钥参数');
    return `${prefix}[已拦截]`;
  });
  redactedText = redactedText.replace(OPENAI_STYLE_KEY_PATTERN, () => {
    addKind(kinds, 'API Key');
    return '[已拦截的 API Key]';
  });
  redactedText = redactedText.replace(AWS_ACCESS_KEY_PATTERN, () => {
    addKind(kinds, 'Access Key');
    return '[已拦截的 Access Key]';
  });
  redactedText = redactedText.replace(JWT_PATTERN, () => {
    addKind(kinds, 'JWT Token');
    return '[已拦截的 JWT Token]';
  });

  return {
    matched: kinds.size > 0,
    kinds: Array.from(kinds),
    redactedText,
  };
};

export const redactSensitiveText = (text: string) => detectSensitiveInput(text).redactedText;
