import SwiftUI

struct ResourceMonitorView: View {
    @StateObject private var manager = ResourceMonitorManager.shared
    @State private var showTokenInput = false
    @State private var tokenInput = ""
    
    var body: some View {
        NavigationView {
            List {
                // MARK: - Token 配置区
                Section {
                    HStack {
                        Image(systemName: manager.tokenConfig.isValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundColor(manager.tokenConfig.isValid ? .green : .red)
                        Text("ChatGPT Session Token")
                        Spacer()
                        Button(manager.tokenConfig.chatgptSessionToken.isEmpty ? "配置" : "修改") {
                            tokenInput = manager.tokenConfig.chatgptSessionToken
                            showTokenInput = true
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                    }
                    
                    if let lastValidated = manager.tokenConfig.lastValidated {
                        HStack {
                            Text("上次验证")
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(lastValidated, style: .relative)
                                .foregroundColor(.secondary)
                                .font(.caption)
                        }
                    }
                } header: {
                    Label("认证配置", systemImage: "key.fill")
                }
                
                // MARK: - Codex 额度区
                Section {
                    if manager.isLoading {
                        HStack {
                            Spacer()
                            ProgressView("正在获取额度信息...")
                            Spacer()
                        }
                    } else if let usage = manager.codexUsage {
                        CodexUsageCardView(usage: usage)
                    } else if let error = manager.lastError {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("获取失败", systemImage: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } else {
                        Text("暂无数据，请先配置 Token 并刷新")
                            .foregroundColor(.secondary)
                    }
                } header: {
                    HStack {
                        Label("Codex 额度", systemImage: "cpu")
                        Spacer()
                        Button {
                            Task { await manager.refreshCodexUsage() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .disabled(manager.isLoading)
                    }
                } footer: {
                    Text("数据来源: chatgpt.com/codex/settings/usage")
                }
                
                // MARK: - 自动刷新设置
                Section {
                    Toggle("自动刷新", isOn: Binding(
                        get: { manager.autoRefreshEnabled },
                        set: { enabled in
                            if enabled {
                                manager.startAutoRefresh()
                            } else {
                                manager.stopAutoRefresh()
                            }
                        }
                    ))
                    
                    if manager.autoRefreshEnabled {
                        Picker("刷新间隔", selection: $manager.refreshInterval) {
                            Text("1 分钟").tag(TimeInterval(60))
                            Text("5 分钟").tag(TimeInterval(300))
                            Text("15 分钟").tag(TimeInterval(900))
                            Text("30 分钟").tag(TimeInterval(1800))
                        }
                    }
                } header: {
                    Label("刷新设置", systemImage: "timer")
                }
            }
            .navigationTitle("资源实时数据")
            .sheet(isPresented: $showTokenInput) {
                TokenInputSheet(
                    tokenInput: $tokenInput,
                    onSave: { token in
                        manager.updateToken(token)
                        showTokenInput = false
                    },
                    onCancel: { showTokenInput = false }
                )
            }
        }
    }
}

// MARK: - Codex 使用量卡片
struct CodexUsageCardView: View {
    let usage: CodexUsage
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // 使用量进度条
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("已使用")
                    Spacer()
                    Text("\(usage.usedQuota) / \(usage.totalQuota)")
                        .font(.headline)
                        .foregroundColor(usage.isNearLimit ? .red : .primary)
                }
                
                ProgressView(value: min(usage.usagePercentage, 100), total: 100)
                    .tint(progressColor)
                
                Text(String(format: "%.1f%%", usage.usagePercentage))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Divider()
            
            // 详细数据
            HStack {
                StatItem(title: "总额度", value: "\(usage.totalQuota)", icon: "square.stack.3d.up")
                Spacer()
                StatItem(title: "已使用", value: "\(usage.usedQuota)", icon: "flame")
                Spacer()
                StatItem(title: "剩余", value: "\(usage.remainingQuota)", icon: "battery.75percent")
            }
            
            // 更新时间
            HStack {
                Image(systemName: "clock")
                    .font(.caption2)
                Text("更新于 \(usage.lastUpdated.formatted(.dateTime.hour().minute().second()))")
                    .font(.caption2)
            }
            .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
    
    private var progressColor: Color {
        if usage.usagePercentage >= 90 { return .red }
        if usage.usagePercentage >= 70 { return .orange }
        return .green
    }
}

struct StatItem: View {
    let title: String
    let value: String
    let icon: String
    
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.accentColor)
            Text(value)
                .font(.headline)
            Text(title)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - Token 输入弹窗
struct TokenInputSheet: View {
    @Binding var tokenInput: String
    let onSave: (String) -> Void
    let onCancel: () -> Void
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextEditor(text: $tokenInput)
                        .frame(minHeight: 100)
                        .font(.system(.caption, design: .monospaced))
                } header: {
                    Text("ChatGPT Session Token")
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("获取方式:")
                        Text("1. 登录 chatgpt.com")
                        Text("2. 打开浏览器开发者工具 (F12)")
                        Text("3. Application → Cookies → __Secure-next-auth.session-token")
                        Text("4. 复制该值粘贴到此处")
                    }
                    .font(.caption)
                }
            }
            .navigationTitle("配置 Token")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { onSave(tokenInput.trimmingCharacters(in: .whitespacesAndNewlines)) }
                        .disabled(tokenInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

#Preview {
    ResourceMonitorView()
}
