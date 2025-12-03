# 🧩 插件开发指南

Guyue Master 支持通过插件扩展功能。插件本质上是一个运行在安全沙箱中的 Web 应用。

## 📂 插件结构

一个标准的插件是一个包含以下文件的文件夹：

```text
my-plugin/
├── manifest.json  (必须) - 插件配置文件
├── index.html     (必须) - 插件入口文件
├── style.css      (可选) - 样式文件
└── script.js      (可选) - 脚本文件
```

## 📄 manifest.json 规范

`manifest.json` 是插件的身份证，必须包含以下字段：

```json
{
  "id": "com.example.calculator",  // 唯一标识符 (建议使用反向域名格式)
  "name": "简易计算器",             // 插件显示名称
  "version": "1.0.0",              // 版本号
  "description": "一个简单的计算器插件", // 描述
  "icon": "Calculator",            // 图标名称 (使用 Lucide React 图标名)
  "entry": "index.html",           // 入口文件路径 (相对于插件根目录)
  "author": "Your Name"            // 作者
}
```

### 图标说明
`icon` 字段支持所有 [Lucide React](https://lucide.dev/icons) 图标名称（PascalCase 格式），例如：
- `Calculator`
- `Calendar`
- `Gamepad2`
- `Terminal`

## 💻 开发流程

### 1. 创建插件文件夹
创建一个文件夹，例如 `hello-world-plugin`。

### 2. 创建 manifest.json
在文件夹中创建 `manifest.json`：
```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "我的第一个插件",
  "icon": "Smile",
  "entry": "index.html",
  "author": "Me"
}
```

### 3. 创建入口文件
创建 `index.html`：
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Hello World</title>
    <style>
        body { font-family: system-ui; padding: 20px; text-align: center; }
        h1 { color: #2563eb; }
    </style>
</head>
<body>
    <h1>👋 Hello World!</h1>
    <p>这是我的第一个 Guyue Master 插件。</p>
</body>
</html>
```

### 4. 安装与测试
1. 打开 Guyue Master 应用。
2. 点击左下角的 **设置** 图标。
3. 找到 **插件扩展** 部分，点击 **安装插件** 按钮。
4. 选择包含 `manifest.json` 的插件文件夹。
5. 安装成功后，插件将出现在侧边栏中。

## 🔒 权限与能力

插件运行在 `<webview>` 标签中，具有以下特性：
- **独立环境**：插件拥有独立的 DOM 和 Window 对象。
- **Node.js 集成**：目前开启了 `nodeIntegration: true`，这意味着插件可以直接使用 Node.js API (如 `fs`, `path`)。
  * ⚠️ **注意**：这赋予了插件极高的权限，请确保只安装可信来源的插件。
- **Electron API**：可以通过 `window.electronAPI` 访问宿主提供的能力 (如果宿主注入了 preload 脚本)。

## 📦 打包与分发

目前插件分发方式为直接分发**文件夹**或**压缩包**。用户解压后通过应用导入即可。

## 示例

请参考项目中的 `example_plugins/calculator` 目录，这是一个完整的计算器插件示例。
