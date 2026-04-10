# PDF 文件阅读位置记忆功能说明

## 功能概述

在学习空间中打开 PDF 文件时，系统会自动记住：
- 上次阅读时的缩放比例
- 上次阅读时的滚动位置
- 上次关闭文件的时间

下次打开同一个 PDF 文件时，会自动恢复到上次的阅读位置。

## 实现原理

### 核心组件
- **EnhancedPdfViewer.tsx**: 增强的 PDF 查看器组件，支持位置记忆功能
- **FileRenderer.tsx**: 文件渲染器，集成了 PDF 查看器

### 位置保存机制
1. **数据存储**: 使用浏览器的 `localStorage` 存储 PDF 阅读位置
2. **键生成**: 使用文件路径的哈希值作为存储键，避免特殊字符问题
3. **防抖保存**: 滚动时采用防抖策略（1秒延迟），避免频繁保存
4. **时间戳**: 记录保存时间，支持设置过期时间（默认30天）

### 保存的信息
```typescript
interface PdfPosition {
  scale: number;           // 缩放倍数（如 1.2）
  scrollTop: number;       // 垂直滚动位置
  scrollLeft: number;      // 水平滚动位置
  currentPage?: number;    // 当前页号（备用）
  timestamp: number;       // 保存时间戳
}
```

## 使用方式

### 对用户
1. 在学习空间中打开 PDF 文件
2. 阅读、缩放或滚动到任意位置
3. 关闭文件或主应用
4. 下次打开同一个 PDF 文件，自动回到上次的位置

### 对开发者

#### 基本导入
```tsx
import { EnhancedPdfViewer } from './components/EnhancedPdfViewer';

// 在组件中使用
<EnhancedPdfViewer filePath="/path/to/file.pdf" />
```

#### 手动控制位置记忆 (如需要)
```tsx
import { 
  savePdfPosition, 
  loadPdfPosition, 
  clearPdfPosition 
} from './components/EnhancedPdfViewer';

// 手动保存位置
savePdfPosition(filePath, {
  scale: 1.2,
  scrollTop: 500,
  scrollLeft: 0,
  timestamp: Date.now()
});

// 手动加载位置
const savedPosition = loadPdfPosition(filePath);

// 清除位置记录
clearPdfPosition(filePath);
```

## 功能特性

### ✅ 已实现
- 自动保存和恢复 PDF 阅读位置
- 支持缩放倍数记忆
- 支持滚动位置记忆
- 防抖保存机制，性能优化
- 过期时间管理（30天）
- 完整的错误处理

### 🎯 使用者可见的改进
1. **无缝阅读体验**: 关闭再打开 PDF，立即回到上次位置
2. **缩放记忆**: 珍惜用户的缩放设置
3. **大文件优化**: 使用 pdfjs-dist 替代 iframe，性能更好
4. **完整的 PDF 工具栏**: 包括缩放、下载等功能

## 工具栏功能

- **缩小 (-20%)**: 减小显示比例
- **百分比显示**: 显示当前缩放比例，点击重置为 120%
- **放大 (+20%)**: 增大显示比例
- **页数显示**: 显示 PDF 总页数
- **下载**: 下载 PDF 文件

## localStorage 存储详情

### 存储键格式
```
pdf_position_{filePath_hash}
```

### 存储位置
- 浏览器 localStorage（每个域）
- 存储限制：通常 5-10MB（因浏览器而异）

### 清理政策
- 自动过期：30天（可在 `loadPdfPosition` 中修改）
- 手动删除：调用 `clearPdfPosition(filePath)`

## 技术细节

### 依赖
- `pdfjs-dist`: PDF 渲染引擎
- `lucide-react`: UI 图标
- `React 19.2.0+`: UI 框架

### 性能考虑
1. 所有 PDF 页面预渲染到 canvas
2. 使用防抖保存位置，避免频繁 localStorage 写入
3. 缩放时重新渲染（必要）
4. 滚动时仅更新 localStorage（防抖）

### 浏览器兼容性
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- 任何支持 localStorage 和 Canvas 的现代浏览器

## 故障排除

### PDF 无法加载
- 确保文件路径正确
- 确保 electronAPI.readFileBase64 可用
- 检查浏览器控制台的错误消息

### 位置未救保存
- 检查 localStorage 是否启用
- 检查存储配额是否已满
- 查看浏览器开发者工具的应用 > Storage

### 性能问题
- 对于超大 PDF（>500 页）：考虑虚拟滚动优化
- 减少 PDF 预渲染的页面数量
- 增加防抖延迟时间

## 未来改进方向

1. **虚拟滚动**: 只渲染可见页面，支持超大 PDF
2. **书签支持**: 允许用户创建多个书签
3. **注释功能**: 支持在 PDF 上添加笔记
4. **索引搜索**: 快速搜索 PDF 内容
5. **云端同步**: 跨设备同步阅读位置

## 参考文档

- [pdfjs-dist 官方文档](https://mozilla.github.io/pdf.js/)
- [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
