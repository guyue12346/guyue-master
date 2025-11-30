# Electron 打包说明

## 📦 打包流程

```
写代码 (React/Electron) 
  ↓
Vite 编译 (转成 JS/HTML) 
  ↓
Electron-Builder 收集文件 
  ↓
套上 Electron 的壳 (生成 .app) 
  ↓
压缩成安装包 (生成 .dmg)
```

## 🚀 快速开始

### 1. 开发模式运行

```bash
npm run electron:dev
```

这个命令会：
- 启动 Vite 开发服务器 (http://localhost:3000)
- 等待服务器就绪
- 启动 Electron 窗口加载应用
- 自动打开开发者工具

### 2. 打包成 macOS 应用

#### 打包成 .app 和 .dmg (推荐)
```bash
npm run electron:build:dmg
```

#### 打包所有格式 (.app, .dmg, .zip)
```bash
npm run electron:build
```

#### 只打包 .app
```bash
npm run electron:build:mac
```

## 📁 项目结构

```
guyue-master/
├── electron/              # Electron 主进程代码
│   ├── main.ts           # 主进程入口
│   ├── preload.ts        # 预加载脚本
│   └── tsconfig.json     # Electron TypeScript 配置
├── components/           # React 组件
├── services/            # 服务层
├── dist/                # Vite 构建输出 (React 应用)
├── dist-electron/       # Electron 编译输出
├── release/             # 最终打包输出
│   ├── Guyue Master-1.0.0-arm64.dmg
│   ├── Guyue Master-1.0.0-x64.dmg
│   └── ...
└── build/               # 构建资源 (图标等)
    └── icon.icns        # macOS 应用图标
```

## 🔧 配置说明

### package.json 关键配置

```json
{
  "main": "dist-electron/main.js",  // Electron 入口
  "build": {
    "appId": "com.guyue.master",
    "productName": "Guyue Master",
    "mac": {
      "target": ["dmg", "zip"],
      "arch": ["x64", "arm64"]  // 支持 Intel 和 Apple Silicon
    }
  }
}
```

### vite.config.ts 关键配置

```typescript
{
  base: './',  // 使用相对路径，Electron 必需
  build: {
    outDir: 'dist'
  }
}
```

## 🎨 应用图标

### 准备图标
1. 准备一个 1024x1024 的 PNG 图片
2. 转换为 .icns 格式
3. 放到 `build/icon.icns`

详细说明见：`build/icon-instructions.md`

### 临时方案
如果没有图标，electron-builder 会使用默认 Electron 图标，不影响打包。

## 📝 构建脚本详解

### electron:dev
```bash
concurrently \
  "cross-env NODE_ENV=development npm run dev" \
  "wait-on http://localhost:3000 && cross-env NODE_ENV=development electron ."
```
- 并行运行 Vite 开发服务器和 Electron
- 等待 Vite 服务器启动后再启动 Electron

### electron:build
```bash
npm run build && \
tsc -p electron/tsconfig.json && \
electron-builder
```
1. `npm run build` - Vite 构建 React 应用到 `dist/`
2. `tsc -p electron/tsconfig.json` - 编译 Electron TypeScript 到 `dist-electron/`
3. `electron-builder` - 打包成 macOS 应用

## 🔍 常见问题

### Q: 打包后应用在哪里？
A: 在 `release/` 目录下，包含 .dmg 和 .zip 文件

### Q: 如何支持 Apple Silicon (M1/M2)?
A: 已配置支持，会生成 arm64 和 x64 两个版本

### Q: 如何修改应用名称？
A: 修改 `package.json` 中的 `productName` 字段

### Q: 如何修改应用版本？
A: 修改 `package.json` 中的 `version` 字段

### Q: 打包很慢怎么办？
A: 第一次打包会下载依赖，后续会快很多

### Q: 如何调试 Electron 主进程？
A: 在 `electron/main.ts` 中使用 `console.log()`，输出会显示在终端

## 🎯 发布流程

1. 更新版本号
```bash
# 修改 package.json 中的 version
```

2. 构建应用
```bash
npm run electron:build:dmg
```

3. 测试安装包
```bash
open release/Guyue\ Master-1.0.0-arm64.dmg
```

4. 分发
- 上传到 GitHub Releases
- 或通过其他方式分发 .dmg 文件

## 📚 相关文档

- [Electron 官方文档](https://www.electronjs.org/docs)
- [Electron Builder 文档](https://www.electron.build/)
- [Vite 官方文档](https://vitejs.dev/)

