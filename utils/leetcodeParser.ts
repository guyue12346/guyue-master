export interface LeetCodeProblem {
  title: string;
  url: string;
  codeUrl?: string;
  codeText?: string; // 新增字段：用于存储链接文字（如"代码"、"笔记"）
  note?: string;
}

export interface LeetCodeCategory {
  title: string;
  problems: LeetCodeProblem[];
}

export interface LeetCodeList {
  id: string;
  title: string;
  description?: string;
  categories: LeetCodeCategory[];
  createdAt: number;
  rawMarkdown?: string; // Store raw content for editing
  priority?: number; // 排序优先级，越小越靠前
}

export const parseLeetCodeMarkdown = (markdown: string): LeetCodeCategory[] => {
  const lines = markdown.split('\n');
  const result: LeetCodeCategory[] = [];
  let currentCategory: LeetCodeCategory | null = null;

  // Helper to extract markdown link [text](url)
  const extractLink = (text: string) => {
    const match = text.match(/\[(.*?)\]\((.*?)\)/);
    return match ? { text: match[1], url: match[2] } : null;
  };

  const ensureCategory = (title: string = '默认分类') => {
    if (!currentCategory || currentCategory.title !== title) {
      // Check if category already exists to avoid duplicates if headers are repeated (unlikely but safe)
      const existing = result.find(c => c.title === title);
      if (existing) {
        currentCategory = existing;
      } else {
        currentCategory = {
          title: title,
          problems: []
        };
        result.push(currentCategory);
      }
    }
    return currentCategory;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Handle Headers as Categories (### Category Name)
    if (trimmedLine.startsWith('###')) {
      const title = trimmedLine.replace(/^#+\s*/, '').trim();
      ensureCategory(title);
      continue;
    }

    // Skip table separators and headers
    if (trimmedLine.startsWith('|---') || trimmedLine.startsWith('|视频精讲') || trimmedLine.startsWith('|题目')) continue;
    
    // Handle Table Rows
    if (trimmedLine.startsWith('|')) {
      const parts = trimmedLine.split('|').map(p => p.trim());
      // Expected format: | Title | Code | Note | (parts length >= 5 because of leading/trailing |)
      // parts[0] is empty
      // parts[1] is Title
      // parts[2] is Code
      // parts[3] is Note
      
      if (parts.length < 4) continue;

      // Legacy support: If 4 columns (Category | Title | Code | Note), parts length >= 6
      // But user wants to remove the first column.
      // Let's try to detect.
      
      let problemCol = '';
      let codeCol = '';
      let noteCol = '';

      // Heuristic: Check if parts[1] looks like a problem link
      const isPart1Problem = parts[1].includes('leetcode.cn/problems') || parts[1].includes('leetcode.com/problems');
      
      if (isPart1Problem) {
        // New format: | Title | Code | Note |
        problemCol = parts[1];
        codeCol = parts[2];
        noteCol = parts[3];
      } else {
        // Old format: | Category | Title | Code | Note |
        // Or maybe parts[1] is just text but it's the problem title?
        // If parts[2] is the problem, then parts[1] is category.
        const isPart2Problem = parts[2].includes('leetcode.cn/problems') || parts[2].includes('leetcode.com/problems');
        
        if (isPart2Problem) {
           // Old format, ignore category column (parts[1]) as we use headers now, or if header not present, maybe use it?
           // But user said "remove it". Let's just take the problem.
           problemCol = parts[2];
           codeCol = parts[3];
           noteCol = parts[4];
           
           // If we haven't seen a header yet, and this row has a category column, maybe we should use it?
           // But for consistency with "remove it", let's rely on headers or default.
           // Actually, if the user pastes the old table, we might want to capture the category if we can.
           // But let's stick to the requested "Header + 3 cols" format for new data.
           // For legacy data (if any left), this logic handles extracting the problem.
        } else {
           // Fallback: assume 3 cols
           problemCol = parts[1];
           codeCol = parts[2];
           noteCol = parts[3];
        }
      }

      if (problemCol) {
        const probLink = extractLink(problemCol);
        const codeLink = extractLink(codeCol);
        
        if (probLink) {
          if (!currentCategory) ensureCategory('默认分类');
          
          currentCategory!.problems.push({
            title: probLink.text,
            url: probLink.url,
            codeUrl: codeLink?.url,
            codeText: codeLink?.text, // 保存链接文字
            note: noteCol
          });
        }
      }
    }
  }
  return result;
};
