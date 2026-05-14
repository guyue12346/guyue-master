import type { EmailConfig } from '../../../types';
import { loadContacts } from '../agentStorage';
import type { ToolRegistration } from '../toolRegistry';

export const EMAIL_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
      name: 'query_contacts',
      module: 'email',
      tool: {
        name: 'query_contacts',
        description: '查询通讯录联系人，可按关键词搜索简称、邮箱或备注。用户提到联系人名字时，先用此工具查找对应的邮箱地址。',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词，匹配简称、邮箱或备注' },
          },
          required: [],
        },
      },
      execute: async (args) => {
        const contacts = loadContacts();
        if (contacts.length === 0) return { success: true, total: 0, contacts: [], hint: '通讯录为空，请让用户在邮件设置面板中添加联系人。' };
        const kw = (typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '');
        const matched = kw ? contacts.filter(c =>
          c.nickname.toLowerCase().includes(kw) || c.email.toLowerCase().includes(kw) || c.note.toLowerCase().includes(kw)
        ) : contacts;
        return {
          success: true,
          total: matched.length,
          contacts: matched.map(c => ({ id: c.id, nickname: c.nickname, email: c.email, note: c.note || null })),
        };
      },
    },
  {
      name: 'send_email',
      module: 'email',
      tool: {
        name: 'send_email',
        description: '发送一封邮件。调用后不会立即发送，系统将生成一张确认卡片展示给用户，用户手动确认后才真正发出。你只需提供主题、正文和收件人即可。',
        inputSchema: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: '邮件主题' },
            content: { type: 'string', description: '邮件正文，支持 HTML 标签（如 <h1>、<p>、<ul> 等）' },
            recipient: { type: 'string', description: '收件人邮箱地址（可选，不传则使用系统设置中的默认收件人）' },
          },
          required: ['subject', 'content'],
        },
      },
      execute: async (args) => {
        const configStr = localStorage.getItem('linkmaster_email_config');
        if (!configStr) return { success: false, error: '邮箱未配置。请在「Agent 设置 → 邮件」中完成 SMTP 设置。' };
        let config: EmailConfig;
        try { config = JSON.parse(configStr); } catch { return { success: false, error: '邮箱配置格式错误，请重新设置。' }; }
        if (!config.smtp?.host || !config.smtp?.user || !config.smtp?.pass) return { success: false, error: '邮箱 SMTP 配置不完整，请检查设置。' };

        const recipient = (typeof args.recipient === 'string' && args.recipient.trim()) ? args.recipient.trim() : config.recipient;
        if (!recipient) return { success: false, error: '收件人地址为空，请指定收件人或在设置中配置默认收件人。' };

        // 查找通讯录匹配的简称（用于显示）
        const contacts = loadContacts();
        const contactMatch = contacts.find(c => c.email === recipient);
        const displayName = contactMatch ? `${contactMatch.nickname} <${recipient}>` : recipient;

        // 不立即发送，返回待确认状态
        const confirmationId = crypto.randomUUID();
        return {
          success: true,
          pendingConfirmation: true,
          confirmationId,
          confirmationType: 'send_email',
          recipient,
          recipientDisplay: displayName,
          subject: String(args.subject || '').trim(),
          contentPreview: String(args.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
          fullContent: String(args.content || ''),
          message: `邮件已准备好，等待用户确认发送。收件人：${displayName}，主题：${args.subject}`,
        };
      },
    },
];
