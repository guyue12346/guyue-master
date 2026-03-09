import Foundation

enum CodexAPIError: LocalizedError {
    case invalidToken
    case networkError(Error)
    case decodingError(Error)
    case unauthorized
    case rateLimited
    case unknown(Int)
    
    var errorDescription: String? {
        switch self {
        case .invalidToken: return "Token 无效，请重新配置"
        case .networkError(let e): return "网络错误: \(e.localizedDescription)"
        case .decodingError(let e): return "数据解析错误: \(e.localizedDescription)"
        case .unauthorized: return "认证失败，Token 可能已过期"
        case .rateLimited: return "请求过于频繁，请稍后再试"
        case .unknown(let code): return "未知错误，状态码: \(code)"
        }
    }
}

actor CodexAPIService {
    
    // ChatGPT 内部 API 端点
    private let sessionURL = "https://chat.openai.com/api/auth/session"
    private let codexUsageURL = "https://chat.openai.com/backend-api/codex/usage"
    // 备用：OpenAI 平台 API
    private let openAIUsageURL = "https://api.openai.com/v1/dashboard/billing/usage"
    
    private var cachedAccessToken: String?
    private var tokenExpiry: Date?
    
    // MARK: - 通过 session token 获取 access token
    func getAccessToken(sessionToken: String) async throws -> String {
        // 如果缓存的 token 还有效
        if let cached = cachedAccessToken,
           let expiry = tokenExpiry,
           Date() < expiry {
            return cached
        }
        
        guard !sessionToken.isEmpty else {
            throw CodexAPIError.invalidToken
        }
        
        var request = URLRequest(url: URL(string: sessionURL)!)
        request.httpMethod = "GET"
        request.setValue("__Secure-next-auth.session-token=\(sessionToken)", forHTTPHeaderField: "Cookie")
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 15
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw CodexAPIError.networkError(URLError(.badServerResponse))
        }
        
        switch httpResponse.statusCode {
        case 200:
            let session = try JSONDecoder().decode(ChatGPTSessionResponse.self, from: data)
            guard let token = session.accessToken else {
                throw CodexAPIError.invalidToken
            }
            cachedAccessToken = token
            tokenExpiry = Date().addingTimeInterval(3600) // 1小时后过期
            return token
        case 401, 403:
            throw CodexAPIError.unauthorized
        case 429:
            throw CodexAPIError.rateLimited
        default:
            throw CodexAPIError.unknown(httpResponse.statusCode)
        }
    }
    
    // MARK: - 获取 Codex 使用额度
    func fetchCodexUsage(sessionToken: String) async throws -> CodexUsage {
        let accessToken = try await getAccessToken(sessionToken: sessionToken)
        
        var request = URLRequest(url: URL(string: codexUsageURL)!)
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 15
        
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw CodexAPIError.networkError(URLError(.badServerResponse))
            }
            
            switch httpResponse.statusCode {
            case 200:
                let decoder = JSONDecoder()
                // 尝试直接解析
                if let usageResponse = try? decoder.decode(CodexUsageResponse.self, from: data) {
                    return usageResponse.toCodexUsage()
                }
                // 尝试解析为通用 JSON
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    return CodexUsage(
                        category: ResourceCategory.codex.rawValue,
                        totalQuota: json["total_granted"] as? Int ?? json["limit"] as? Int ?? 0,
                        usedQuota: json["total_used"] as? Int ?? json["used"] as? Int ?? 0,
                        remainingQuota: json["total_available"] as? Int ?? json["remaining"] as? Int ?? 0,
                        resetDate: nil,
                        lastUpdated: Date()
                    )
                }
                throw CodexAPIError.decodingError(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "无法解析响应数据"]))
            case 401, 403:
                cachedAccessToken = nil
                throw CodexAPIError.unauthorized
            case 429:
                throw CodexAPIError.rateLimited
            default:
                throw CodexAPIError.unknown(httpResponse.statusCode)
            }
        } catch let error as CodexAPIError {
            throw error
        } catch {
            throw CodexAPIError.networkError(error)
        }
    }
    
    // MARK: - 清除缓存
    func clearCache() {
        cachedAccessToken = nil
        tokenExpiry = nil
    }
}
