import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let status = UILabel()
    private let done = UIButton(type: .system)
    private var captureTask: Task<Void, Never>?
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let title = UILabel()
        title.text = "Foodedo"
        title.font = .preferredFont(forTextStyle: .largeTitle)
        title.adjustsFontForContentSizeCategory = true
        status.text = "Capturing your recipe link…"
        status.font = .preferredFont(forTextStyle: .body)
        status.adjustsFontForContentSizeCategory = true
        status.numberOfLines = 0
        done.setTitle("Cancel", for: .normal)
        done.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        done.addTarget(self, action: #selector(close), for: .touchUpInside)
        done.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        let stack = UIStackView(arrangedSubviews: [title, status, done])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24), stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32)])
        captureTask = Task { @MainActor in
            do {
                var texts: [String] = []
                for item in (extensionContext?.inputItems as? [NSExtensionItem] ?? []).prefix(8) {
                    if let text = item.attributedContentText?.string { texts.append(text) }
                    for provider in (item.attachments ?? []).prefix(8) {
                        let type = provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) ? UTType.url.identifier : UTType.plainText.identifier
                        guard provider.hasItemConformingToTypeIdentifier(type) else { continue }
                        let loaded = try await load(provider, type: type)
                        if let url = loaded as? URL { texts.append(url.absoluteString) }
                        else if let text = loaded as? String { texts.append(text) }
                    }
                }
                let text = texts.joined(separator: "\n")
                guard text.utf16.count <= 80_000 else { throw SharedRecipeInboxError.invalid }
                let detector = try NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
                let urls = detector.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { $0.url }.filter { ["http", "https"].contains($0.scheme?.lowercased() ?? "") }
                let url = try SharedRecipeInbox.preferredURL(urls)
                try Task.checkCancellation()
                try SharedRecipeInbox().capture(url: url.absoluteString, text: text)
                status.text = "Captured — open Foodedo to import."
                done.setTitle("Done", for: .normal)
                UIAccessibility.post(notification: .announcement, argument: status.text)
            } catch {
                status.text = error.localizedDescription
                done.setTitle("Done", for: .normal)
            }
        }
    }
    private func load(_ provider: NSItemProvider, type: String) async throws -> NSSecureCoding? {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: item) }
            }
        }
    }
    @objc private func close() { captureTask?.cancel(); extensionContext?.completeRequest(returningItems: nil) }
}
