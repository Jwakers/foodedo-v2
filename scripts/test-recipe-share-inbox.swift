import Foundation

@main
struct InboxChecks {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("foodedo-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        var time = 1_800_000_000_000.0
        let inbox = try SharedRecipeInbox(directory: root, now: { time })
        let unicodeInbox = try SharedRecipeInbox(directory: root.appendingPathComponent("unicode"))
        do {
            try unicodeInbox.capture(url: "https://example.com/too-long", text: String(repeating: "🥕", count: 40_001))
            fatalError("Native text limit must match JavaScript UTF-16 length")
        } catch SharedRecipeInboxError.invalid { }
        let boundary = try unicodeInbox.capture(url: "https://example.com/boundary", text: String(repeating: "🥕", count: 40_000))
        precondition(boundary.sharedText?.utf16.count == 80_000)
        let first = try inbox.capture(url: "https://instagram.com/reel/Cexample123/?igsh=one", text: "My recipe")
        let duplicate = try inbox.capture(url: "https://www.instagram.com/reel/Cexample123/?igsh=two", text: nil)
        precondition(first.id == duplicate.id, "Tracking variations must not duplicate captures")
        let restored = try SharedRecipeInbox(directory: root, now: { time }).peek()
        precondition(restored?.id == first.id, "Captures survive a new inbox instance")
        try inbox.claim(id: first.id, owner: "owner-1")
        do { try inbox.claim(id: first.id, owner: "owner-2"); fatalError("Another account claimed this capture") } catch SharedRecipeInboxError.wrongAccount { }
        do { try inbox.acknowledge(id: first.id, owner: "owner-2"); fatalError("Another account deleted this capture") } catch SharedRecipeInboxError.wrongAccount { }
        try inbox.acknowledge(id: first.id, owner: "owner-1")
        try inbox.acknowledge(id: first.id, owner: "owner-1")
        for index in 0..<20 { try inbox.capture(url: "https://example.com/recipe/\(index)", text: nil) }
        do { try inbox.capture(url: "https://example.com/overflow", text: nil); fatalError("A full inbox silently accepted a capture") } catch SharedRecipeInboxError.full { }
        time += 7 * 24 * 60 * 60 * 1000
        let expired = try inbox.peek()
        precondition(expired == nil, "Expired captures must be removed")
        let concurrent = try SharedRecipeInbox(directory: root.appendingPathComponent("concurrent"))
        let errorLock = NSLock()
        var errors: [String] = []
        DispatchQueue.concurrentPerform(iterations: 20) { index in
            do { try concurrent.capture(url: "https://example.com/concurrent/\(index)", text: nil) }
            catch { errorLock.lock(); errors.append(error.localizedDescription); errorLock.unlock() }
        }
        precondition(errors.isEmpty, "Concurrent capture failed: \(errors)")
        var count = 0
        while let capture = try concurrent.peek() {
            count += 1
            try concurrent.claim(id: capture.id, owner: "owner-1")
            try concurrent.acknowledge(id: capture.id, owner: "owner-1")
        }
        precondition(count == 20, "Concurrent captures were lost")
        let file = root.appendingPathComponent("recipe-captures-v1.json")
        let corrupt = Data("not a valid inbox".utf8)
        try corrupt.write(to: file)
        do { _ = try inbox.peek(); fatalError("Corrupt data was silently discarded") } catch SharedRecipeInboxError.corrupt { }
        let preserved = try Data(contentsOf: file)
        precondition(preserved == corrupt, "Corrupt data must remain intact")
        print("Shared inbox checks passed: deduplication, restart, ownership, acknowledgement, capacity, expiry, concurrency and corruption preservation.")
    }
}
