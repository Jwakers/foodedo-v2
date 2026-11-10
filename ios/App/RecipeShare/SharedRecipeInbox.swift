import Foundation

struct SharedRecipeCapture: Codable {
    let schemaVersion: Int
    let id: String
    let url: String
    let sharedText: String?
    let createdAt: Double
    var claimedBy: String?
}

enum SharedRecipeInboxError: LocalizedError {
    case unavailable, full, invalid, corrupt, wrongAccount
    var errorDescription: String? {
        switch self {
        case .unavailable: return "We couldn’t save your link. Open Foodedo, then try sharing it again."
        case .full: return "You have too many links waiting to be imported. Open Foodedo to add them to your recipes first."
        case .invalid: return "Share one public recipe link at a time."
        case .corrupt: return "We couldn’t open your saved links. They haven’t been deleted. Open Foodedo and try again."
        case .wrongAccount: return "Sign in to the Foodedo account you used when you first shared this link."
        }
    }
}

/** Both targets coordinate the same file; read/modify/write is one transaction. */
final class SharedRecipeInbox {
    static let group = "group.com.foodedo.app.imports"
    private let file: URL
    private let now: () -> Double
    init(directory: URL? = nil, now: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 }) throws {
        guard let container = directory ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) else { throw SharedRecipeInboxError.unavailable }
        try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
        file = container.appendingPathComponent("recipe-captures-v1.json")
        self.now = now
    }
    static func canonicalURL(_ raw: String) throws -> String {
        guard var url = URLComponents(string: raw), ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil, url.user == nil, url.password == nil, raw.utf8.count <= 2048 else { throw SharedRecipeInboxError.invalid }
        url.fragment = nil
        if ["instagram.com", "www.instagram.com", "m.instagram.com"].contains(url.host?.lowercased() ?? "") { url.host = "www.instagram.com"; url.scheme = "https"; url.query = nil
            let parts = url.path.split(separator: "/")
            if !url.path.hasPrefix("/share/"), parts.count >= 2, ["p", "reel", "reels", "tv"].contains(String(parts[parts.count - 2])) { url.path = "/\(parts[parts.count - 2] == "p" ? "p" : "reel")/\(parts.last!)/" } }
        if ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].contains(url.host?.lowercased() ?? "") {
            url.scheme = "https"
            url.query = nil
            url.path = url.path.hasSuffix("/") ? String(url.path.dropLast()) : url.path
            if ["tiktok.com", "www.tiktok.com", "m.tiktok.com"].contains(url.host?.lowercased() ?? "") { url.host = "www.tiktok.com" }
        }
        return url.string!
    }
    static func isSocialURL(_ url: URL) -> Bool {
        return ["instagram.com", "www.instagram.com", "m.instagram.com", "tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].contains(url.host?.lowercased() ?? "")
    }
    static func preferredURL(_ urls: [URL]) throws -> URL {
        let social = urls.filter { isSocialURL($0) }
        let candidates = social.isEmpty ? urls : social
        let unique = Set(try candidates.map { try canonicalURL($0.absoluteString) })
        guard unique.count == 1, let selected = candidates.first else { throw SharedRecipeInboxError.invalid }
        return selected
    }
    private func transaction<T>(_ update: (inout [SharedRecipeCapture]) throws -> T) throws -> T {
        var coordinationError: NSError?
        var result: Result<T, Error>?
        NSFileCoordinator().coordinate(writingItemAt: file, options: .forMerging, error: &coordinationError) { coordinated in
            do {
                var captures: [SharedRecipeCapture] = []
                let original = FileManager.default.fileExists(atPath: coordinated.path) ? try Data(contentsOf: coordinated) : nil
                if let original {
                    guard let decoded = try? JSONDecoder().decode([SharedRecipeCapture].self, from: original), decoded.count <= 20, decoded.allSatisfy({ $0.schemaVersion == 1 && !$0.id.isEmpty && $0.id.count <= 100 && $0.createdAt.isFinite && $0.url.utf8.count <= 2048 && ($0.sharedText?.utf16.count ?? 0) <= 80_000 && (try? Self.canonicalURL($0.url)) != nil }) else { throw SharedRecipeInboxError.corrupt }
                    captures = decoded
                }
                let timestamp = now()
                captures.removeAll { timestamp - $0.createdAt >= 7 * 24 * 60 * 60 * 1000 || $0.createdAt > timestamp + 60_000 }
                let value = try update(&captures)
                let encoder = JSONEncoder()
                encoder.outputFormatting = .sortedKeys
                let encoded = try encoder.encode(captures)
                if encoded != original {
                    try encoded.write(to: coordinated, options: .atomic)
                    #if os(iOS)
                    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: coordinated.path)
                    #endif
                }
                result = .success(value)
            } catch { result = .failure(error) }
        }
        if let error = coordinationError { throw error }
        guard let result else { throw SharedRecipeInboxError.unavailable }
        return try result.get()
    }
    @discardableResult func capture(url: String, text: String?) throws -> SharedRecipeCapture {
        let key = try Self.canonicalURL(url)
        guard (text?.utf16.count ?? 0) <= 80_000 else { throw SharedRecipeInboxError.invalid }
        return try transaction { captures in
            if let existing = captures.first(where: { (try? Self.canonicalURL($0.url)) == key }) { return existing }
            guard captures.count < 20 else { throw SharedRecipeInboxError.full }
            let capture = SharedRecipeCapture(schemaVersion: 1, id: UUID().uuidString, url: url, sharedText: text, createdAt: now().rounded(.down), claimedBy: nil)
            captures.append(capture)
            return capture
        }
    }
    func peek() throws -> SharedRecipeCapture? { try transaction { $0.first } }
    func claim(id: String, owner: String) throws {
        try transaction { captures in
            guard let index = captures.firstIndex(where: { $0.id == id }) else { throw SharedRecipeInboxError.invalid }
            guard captures[index].claimedBy == nil || captures[index].claimedBy == owner else { throw SharedRecipeInboxError.wrongAccount }
            captures[index].claimedBy = owner
        }
    }
    func acknowledge(id: String, owner: String) throws {
        try transaction { captures in
            guard let item = captures.first(where: { $0.id == id }) else { return }
            guard item.claimedBy == owner else { throw SharedRecipeInboxError.wrongAccount }
            captures.removeAll { $0.id == id }
        }
    }
}
