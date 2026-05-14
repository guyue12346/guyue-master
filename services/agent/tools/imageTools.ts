import type { ToolRegistration } from '../toolRegistry';
import { normalizeLimit } from './toolUtils';

export const IMAGE_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
      name: 'query_images',
      module: 'image',
      tool: {
        name: 'query_images',
        description: '查询图床中已有的图片。可按名称或分类搜索，返回图片的 URL 和 Markdown 链接。',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '搜索关键词，匹配图片文件名或显示名称（可选，不传则返回全部）' },
            category: { type: 'string', description: '按分类筛选（可选）' },
            limit: { type: 'number', description: '最多返回条数，默认 20' },
          },
          required: [],
        },
      },
      execute: async (args) => {
        let records: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
        if (typeof args.category === 'string' && args.category.trim()) {
          const cat = args.category.trim();
          records = records.filter((r: any) => r.category === cat || (!r.category && cat === '未分类'));
        }
        if (typeof args.keyword === 'string' && args.keyword.trim()) {
          const kw = args.keyword.trim().toLowerCase();
          records = records.filter((r: any) =>
            (r.filename || '').toLowerCase().includes(kw) || (r.name || '').toLowerCase().includes(kw)
          );
        }
        records.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
        const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 20;
        const sliced = records.slice(0, limit);
        // 收集所有可用分类
        const allRecords: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
        const categories = [...new Set(allRecords.map((r: any) => r.category || '未分类'))];
        return {
          success: true,
          total: records.length,
          returned: sliced.length,
          categories,
          images: sliced.map((r: any) => ({
            name: r.name || r.filename,
            filename: r.filename,
            url: r.url,
            markdown: `![${r.name || r.filename}](${r.url})`,
            category: r.category || '未分类',
            createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') : null,
          })),
        };
      },
    },
  {
      name: 'upload_image',
      module: 'image',
      tool: {
        name: 'upload_image',
        description: '将用户发送的图片附件上传到图床（Gitee 仓库），并返回访问链接。用户必须在消息中附带图片。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '图片显示名称（可选，不传则使用文件名）' },
            category: { type: 'string', description: '图床分类名称（可选，默认"未分类"）' },
            attachmentIndex: { type: 'number', description: '上传第几个图片附件（从 0 开始，默认 0 即第一个图片）' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        // 1. 获取图床配置
        const configStr = localStorage.getItem('linkmaster_image_config_v1');
        if (!configStr) return { success: false, error: '图床未配置。请在「图床管理」中设置 Gitee 配置。' };
        let imgConfig: any;
        try { imgConfig = JSON.parse(configStr); } catch { return { success: false, error: '图床配置格式错误。' }; }
        if (!imgConfig.accessToken || !imgConfig.owner || !imgConfig.repo) return { success: false, error: '图床配置不完整（缺少 accessToken / owner / repo）。' };

        // 2. 获取用户附件中的图片
        const attachments = ctx.lastUserAttachments || [];
        const imageAttachments = attachments.filter(a => a.type === 'image' && a.base64);
        if (imageAttachments.length === 0) return { success: false, error: '未找到图片附件。请在消息中附带图片后再调用此工具。' };
        const idx = typeof args.attachmentIndex === 'number' ? args.attachmentIndex : 0;
        if (idx < 0 || idx >= imageAttachments.length) return { success: false, error: `图片索引 ${idx} 超出范围，当前共 ${imageAttachments.length} 个图片附件。` };
        const attachment = imageAttachments[idx];

        // 3. 生成唯一文件名并上传
        const ext = (attachment.name || 'image.png').split('.').pop()?.toLowerCase() || 'png';
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).slice(2, 9);
        const filename = `${timestamp}_${randomStr}.${ext}`;
        const uploadPath = imgConfig.path ? `${imgConfig.path}/${filename}` : filename;

        const electronAPI = (window as any).electronAPI;
        if (!electronAPI?.uploadImage) return { success: false, error: '上传功能不可用（非桌面端）。' };

        const result = await electronAPI.uploadImage({
          accessToken: imgConfig.accessToken,
          owner: imgConfig.owner,
          repo: imgConfig.repo,
          path: uploadPath,
          content: attachment.base64,
          message: `Upload ${filename} via Agent`,
        });

        if (!result || !result.content) return { success: false, error: `上传失败：${result?.message || '未知错误'}` };

        // 4. 创建图片记录并保存
        const displayName = (typeof args.name === 'string' && args.name.trim()) ? args.name.trim() : (attachment.name || filename);
        const category = (typeof args.category === 'string' && args.category.trim()) ? args.category.trim() : '未分类';
        const newRecord = {
          id: timestamp.toString(),
          filename,
          name: displayName,
          url: result.content.download_url,
          sha: result.content.sha,
          path: result.content.path,
          category,
          createdAt: Date.now(),
        };
        // 保存到 localStorage 并触发事件通知 App
        const existing: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
        existing.unshift(newRecord);
        localStorage.setItem('linkmaster_image_records_v1', JSON.stringify(existing));
        // 通过自定义事件通知 App 更新状态
        window.dispatchEvent(new CustomEvent('guyue:image-record-added', { detail: newRecord }));

        return {
          success: true,
          message: `图片已上传至图床：${displayName}`,
          url: result.content.download_url,
          markdown: `![${displayName}](${result.content.download_url})`,
          name: displayName,
          category,
        };
      },
    },
];
