# 🚀 快速开始

## 一键命令

### 开发模式（推荐先用这个测试）
```bash
npm run electron:dev
```
这会启动开发服务器并打开 Electron 窗口，支持热重载。

### 打包成 macOS 应用
```bash
npm run electron:build:dmg
```
这会生成 `.app` 和 `.dmg` 文件在 `release/` 目录。

## 打包流程图

```
React 代码 → Vite 编译 → Electron 包装 → 生成 .app → 压缩成 .dmg
   ↓            ↓              ↓              ↓            ↓
 源码         dist/      dist-electron/    .app 文件    .dmg 安装包
```

## 生成的文件位置

```
release/
├── Guyue Master-1.0.0-arm64.dmg    ← 这个可以分发给用户
└── mac-arm64/
    └── Guyue Master.app             ← 这个可以直接运行
```

## 测试应用

### 方法 1: 运行 .app
```bash
open "release/mac-arm64/Guyue Master.app"
```

### 方法 2: 安装 DMG
```bash
open "release/Guyue Master-1.0.0-arm64.dmg"
```

## 所有可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 只启动 Vite 开发服务器 |
| `npm run build` | 只构建 React 应用 |
| `npm run electron:dev` | 开发模式运行 Electron |
| `npm run electron:build` | 打包所有格式 (dmg + zip) |
| `npm run electron:build:mac` | 只打包 .app |
| `npm run electron:build:dmg` | 打包 .app + .dmg |

## 详细文档

- 📖 [完整打包说明](ELECTRON_BUILD.md)
- ✅ [打包成功说明](BUILD_SUCCESS.md)
- 🎨 [图标制作指南](build/icon-instructions.md)

## 常见问题

**Q: 第一次打包很慢？**  
A: 正常，需要下载 Electron 二进制文件（~113MB），后续会快很多。

**Q: 应用无法打开？**  
A: 右键点击 → 打开，或在系统偏好设置中允许。

**Q: 如何修改应用名称？**  
A: 编辑 `package.json` 中的 `productName` 字段。

**Q: 如何添加应用图标？**  
A: 将 `.icns` 文件放到 `build/icon.icns`，详见 `build/icon-instructions.md`。

## 项目结构

```
guyue-master/
├── electron/              # Electron 主进程代码
│   ├── main.ts           # 窗口管理、IPC 通信
│   └── preload.ts        # 安全的 API 暴露
├── components/           # React 组件
├── services/            # 业务逻辑
├── dist/                # Vite 构建输出
├── dist-electron/       # Electron 编译输出
└── release/             # 最终打包输出
```

## 下一步

1. ✅ 运行 `npm run electron:dev` 测试开发模式
2. ✅ 运行 `npm run electron:build:dmg` 生成安装包
3. ✅ 测试 `release/Guyue Master.app`
4. 🎨 （可选）添加自定义图标
5. 📦 分发 `.dmg` 文件

Happy Coding! 🎉

