# Latest Installers

> 此目录只保存最新版本的元数据（说明、校验信息等），真正的 `.dmg/.zip/.blockmap` 等产物请上传到 **GitHub Releases**，避免触发 100 MB 的仓库限制。

## 推荐发布流程

1. 构建安装包
	```bash
	npm run electron:build:dmg
	```
2. 在 `release/` 目录中找到生成的 `.dmg`、`.blockmap`、`latest-mac.yml` 等文件，核对版本号与哈希值。
3. 在 GitHub 仓库的 **Releases** 页面创建（或编辑）对应版本的 release：
	- 选择/创建 tag（如 `v1.0.9`）
	- 填写更新说明
	- 将上述产物拖入 “Assets”
4. （可选）在本目录内记录元信息，例如：
	- `latest.txt`：列出最新版本号、发布日期、下载链接
	- `checksums.sha256`：保存安装包的校验和
5. 提交并推送这些文本文件：
	```bash
	git add latest-installers/*.txt latest-installers/*.sha256
	git commit -m "docs: update latest release info"
	git push origin main
	```

> 若仍需要本地保存安装包，可放在 `release/`（已在 `.gitignore` 中），或上传到 OSS/网盘。切勿直接把 >100 MB 的二进制放入仓库，否则 push 会被拒绝。
