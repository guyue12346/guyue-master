import Foundation
import Combine
import SwiftUI

@MainActor
class ResourceMonitorManager: ObservableObject {
    
    static let shared = ResourceMonitorManager()
    
    // MARK: - Published 属性
    @Published var codexUsage: CodexUsage?
    @Published var isLoading = false
    @Published var lastError: String?
    @Published var tokenConfig: ResourceTokenConfig = .empty
    @Published var autoRefreshEnabled = true
    @Published var refreshInterval: TimeInterval = 300 // 默认5分钟
    
    // MARK: - 私有属性
    private let apiService = CodexAPIService()
    private var refreshTask: Task<Void, Never>?
    private let configKey = "ResourceTokenConfig"
    
    private init() {
        loadConfig()
        if autoRefreshEnabled && tokenConfig.isValid {
            startAutoRefresh()
        }
    }
    
    // MARK: - Token 配置
    func updateToken(_ token: String) {
        tokenConfig = ResourceTokenConfig(
            chatgptSessionToken: token,
            lastValidated: nil,
            isValid: !token.isEmpty
        )
        saveConfig()
        
        if !token.isEmpty {
            Task {
                await refreshCodexUsage()
            }
        }
    }
    
    // MARK: - 手动刷新
    func refreshCodexUsage() async {
        guard !tokenConfig.chatgptSessionToken.isEmpty else {
            lastError = "请先配置 ChatGPT Session Token"
            return
        }
        
        isLoading = true
        lastError = nil
        
        do {
            let usage = try await apiService.fetchCodexUsage(
                sessionToken: tokenConfig.chatgptSessionToken
            )
            codexUsage = usage
            tokenConfig.lastValidated = Date()
            tokenConfig.isValid = true
            saveConfig()
        } catch {
            lastError = error.localizedDescription
            if let apiError = error as? CodexAPIError {
                switch apiError {
                case .unauthorized, .invalidToken:
                    tokenConfig.isValid = false
                    saveConfig()
                default:
                    break
                }
            }
        }
        
        isLoading = false
    }
    
    // MARK: - 自动刷新
    func startAutoRefresh() {
        stopAutoRefresh()
        autoRefreshEnabled = true
        
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refreshCodexUsage()
                try? await Task.sleep(nanoseconds: UInt64((self?.refreshInterval ?? 300) * 1_000_000_000))
            }
        }
    }
    
    func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
        autoRefreshEnabled = false
    }
    
    // MARK: - 持久化
    private func saveConfig() {
        if let data = try? JSONEncoder().encode(tokenConfig) {
            UserDefaults.standard.set(data, forKey: configKey)
        }
    }
    
    private func loadConfig() {
        if let data = UserDefaults.standard.data(forKey: configKey),
           let config = try? JSONDecoder().decode(ResourceTokenConfig.self, from: data) {
            tokenConfig = config
        }
    }
}
