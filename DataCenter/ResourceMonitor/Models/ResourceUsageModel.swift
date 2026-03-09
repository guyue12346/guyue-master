import Foundation

// MARK: - 资源分类
enum ResourceCategory: String, Codable, CaseIterable {
    case codex = "Codex"
    // 后续可扩展更多资源类型
}

// MARK: - Codex 额度模型
struct CodexUsage: Codable, Identifiable {
    var id: String { category }
    let category: String
    let totalQuota: Int        // 总额度
    let usedQuota: Int         // 已使用额度
    let remainingQuota: Int    // 剩余额度
    let resetDate: Date?       // 额度重置日期
    let lastUpdated: Date      // 最后更新时间
    
    var usagePercentage: Double {
        guard totalQuota > 0 else { return 0 }
        return Double(usedQuota) / Double(totalQuota) * 100.0
    }
    
    var isNearLimit: Bool {
        usagePercentage >= 80.0
    }
}

// MARK: - API 响应模型
struct CodexUsageResponse: Codable {
    let object: String?
    let totalGranted: Double?
    let totalUsed: Double?
    let totalAvailable: Double?
    
    enum CodingKeys: String, CodingKey {
        case object
        case totalGranted = "total_granted"
        case totalUsed = "total_used"
        case totalAvailable = "total_available"
    }
    
    func toCodexUsage() -> CodexUsage {
        CodexUsage(
            category: ResourceCategory.codex.rawValue,
            totalQuota: Int(totalGranted ?? 0),
            usedQuota: Int(totalUsed ?? 0),
            remainingQuota: Int(totalAvailable ?? 0),
            resetDate: nil,
            lastUpdated: Date()
        )
    }
}

// MARK: - ChatGPT Session 响应
struct ChatGPTSessionResponse: Codable {
    let accessToken: String?
    let user: ChatGPTUser?
    
    enum CodingKeys: String, CodingKey {
        case accessToken = "accessToken"
        case user
    }
}

struct ChatGPTUser: Codable {
    let id: String?
    let name: String?
    let email: String?
}

// MARK: - Token 配置
struct ResourceTokenConfig: Codable {
    var chatgptSessionToken: String
    var lastValidated: Date?
    var isValid: Bool
    
    static var empty: ResourceTokenConfig {
        ResourceTokenConfig(chatgptSessionToken: "", lastValidated: nil, isValid: false)
    }
}
