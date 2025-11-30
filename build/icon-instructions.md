# 应用图标说明

## 图标要求

为了正确打包 macOS 应用，需要准备以下图标：

### macOS 图标 (icon.icns)
- 文件名：`icon.icns`
- 位置：`build/icon.icns`
- 格式：Apple ICNS 格式
- 包含多种尺寸：16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024

## 如何创建 .icns 文件

### 方法 1: 使用在线工具
1. 访问 https://cloudconvert.com/png-to-icns
2. 上传一个 1024x1024 的 PNG 图片
3. 转换为 .icns 格式
4. 下载并放到 `build/icon.icns`

### 方法 2: 使用 macOS 命令行
```bash
# 1. 准备一个 1024x1024 的 PNG 图片 (icon.png)
# 2. 创建临时文件夹
mkdir icon.iconset

# 3. 生成各种尺寸
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# 4. 转换为 .icns
iconutil -c icns icon.iconset -o build/icon.icns

# 5. 清理
rm -rf icon.iconset
```

## 临时解决方案

如果暂时没有图标，electron-builder 会使用默认的 Electron 图标。
应用仍然可以正常打包和运行。

