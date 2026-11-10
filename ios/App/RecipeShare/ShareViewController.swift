import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  // Match the app's paper, ink, cadmium and leaf design tokens.
  private let accent = UIColor(red: 221 / 255, green: 53 / 255, blue: 42 / 255, alpha: 1)
  private let leaf = UIColor(red: 63 / 255, green: 104 / 255, blue: 75 / 255, alpha: 1)
  private let heading = UILabel()
  private let status = UILabel()
  private let symbol = UIImageView()
  private let symbolBackground = UIView()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let source = UILabel()
  private let sourceCard = UIView()
  private let nextStep = UIStackView()
  private let done = UIButton(type: .system)
  private var captureTask: Task<Void, Never>?

  override func viewDidLoad() {
    super.viewDidLoad()
    configureLayout()
    captureTask = Task { @MainActor in
      await captureRecipe()
    }
  }

  private func configureLayout() {
    view.backgroundColor = .systemBackground
    view.tintColor = accent
    preferredContentSize = CGSize(width: 420, height: 640)

    let brand = label("Foodedo", style: .title2)
    brand.font = UIFontMetrics(forTextStyle: .title2).scaledFont(
      for: UIFont(name: "Georgia-Bold", size: 25) ?? .boldSystemFont(ofSize: 25))
    let closeButton = UIButton(type: .system)
    closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
    closeButton.tintColor = .secondaryLabel
    closeButton.accessibilityLabel = "Close share sheet"
    closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
    closeButton.widthAnchor.constraint(equalToConstant: 44).isActive = true
    closeButton.heightAnchor.constraint(equalToConstant: 44).isActive = true
    let header = UIStackView(arrangedSubviews: [brand, UIView(), closeButton])
    header.alignment = .center

    symbolBackground.backgroundColor = .secondarySystemBackground
    symbolBackground.layer.cornerRadius = 20
    symbolBackground.translatesAutoresizingMaskIntoConstraints = false
    symbolBackground.widthAnchor.constraint(equalToConstant: 64).isActive = true
    symbolBackground.heightAnchor.constraint(equalToConstant: 64).isActive = true
    symbol.translatesAutoresizingMaskIntoConstraints = false
    symbol.preferredSymbolConfiguration = UIImage.SymbolConfiguration(
      pointSize: 29, weight: .medium)
    symbol.isAccessibilityElement = false
    spinner.translatesAutoresizingMaskIntoConstraints = false
    spinner.color = accent
    symbolBackground.addSubview(symbol)
    symbolBackground.addSubview(spinner)
    NSLayoutConstraint.activate([
      symbol.centerXAnchor.constraint(equalTo: symbolBackground.centerXAnchor),
      symbol.centerYAnchor.constraint(equalTo: symbolBackground.centerYAnchor),
      spinner.centerXAnchor.constraint(equalTo: symbolBackground.centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: symbolBackground.centerYAnchor),
    ])
    spinner.startAnimating()
    let symbolRow = UIStackView(arrangedSubviews: [symbolBackground, UIView()])

    heading.text = "Saving your recipe link…"
    heading.font = UIFontMetrics(forTextStyle: .largeTitle).scaledFont(
      for: UIFont(name: "Georgia-Bold", size: 30) ?? .boldSystemFont(ofSize: 30))
    heading.adjustsFontForContentSizeCategory = true
    heading.numberOfLines = 0
    heading.accessibilityTraits = .header
    status.text = "Saving this link so you can add the recipe to Foodedo."
    status.font = .preferredFont(forTextStyle: .body)
    status.adjustsFontForContentSizeCategory = true
    status.textColor = .secondaryLabel
    status.numberOfLines = 0

    let linkIcon = UIImageView(image: UIImage(systemName: "link"))
    linkIcon.tintColor = .secondaryLabel
    linkIcon.contentMode = .scaleAspectFit
    linkIcon.widthAnchor.constraint(equalToConstant: 24).isActive = true
    let sourceCaption = label("RECIPE LINK", style: .caption2)
    sourceCaption.textColor = .secondaryLabel
    source.font = .preferredFont(forTextStyle: .headline)
    source.adjustsFontForContentSizeCategory = true
    source.numberOfLines = 2
    source.lineBreakMode = .byTruncatingMiddle
    let sourceText = UIStackView(arrangedSubviews: [sourceCaption, source])
    sourceText.axis = .vertical
    sourceText.spacing = 4
    let sourceRow = UIStackView(arrangedSubviews: [linkIcon, sourceText])
    sourceRow.spacing = 12
    sourceRow.alignment = .center
    sourceRow.translatesAutoresizingMaskIntoConstraints = false
    sourceCard.addSubview(sourceRow)
    sourceCard.backgroundColor = .secondarySystemBackground
    sourceCard.layer.cornerRadius = 12
    NSLayoutConstraint.activate([
      sourceRow.leadingAnchor.constraint(equalTo: sourceCard.leadingAnchor, constant: 16),
      sourceRow.trailingAnchor.constraint(equalTo: sourceCard.trailingAnchor, constant: -16),
      sourceRow.topAnchor.constraint(equalTo: sourceCard.topAnchor, constant: 16),
      sourceRow.bottomAnchor.constraint(equalTo: sourceCard.bottomAnchor, constant: -16),
    ])
    sourceCard.isHidden = true

    let nextCaption = label("NEXT STEP", style: .caption2)
    nextCaption.textColor = accent
    let nextTitle = label("Open Foodedo to import", style: .headline)
    let nextDescription = label(
      "Close this sheet, then open Foodedo to add the recipe to your account. Once added, it’s available wherever you sign in.", style: .subheadline
    )
    nextDescription.textColor = .secondaryLabel
    nextStep.addArrangedSubview(nextCaption)
    nextStep.addArrangedSubview(nextTitle)
    nextStep.addArrangedSubview(nextDescription)
    nextStep.axis = .vertical
    nextStep.spacing = 6
    nextStep.isHidden = true

    var buttonStyle = UIButton.Configuration.filled()
    buttonStyle.baseBackgroundColor = accent
    buttonStyle.baseForegroundColor = .white
    buttonStyle.cornerStyle = .medium
    buttonStyle.contentInsets = NSDirectionalEdgeInsets(
      top: 16, leading: 20, bottom: 16, trailing: 20)
    buttonStyle.title = "Cancel"
    done.configuration = buttonStyle
    done.titleLabel?.adjustsFontForContentSizeCategory = true
    done.addTarget(self, action: #selector(close), for: .touchUpInside)
    done.heightAnchor.constraint(greaterThanOrEqualToConstant: 52).isActive = true

    let stack = UIStackView(arrangedSubviews: [
      header, symbolRow, heading, status, sourceCard, nextStep, done,
    ])
    stack.axis = .vertical
    stack.spacing = 16
    stack.setCustomSpacing(20, after: header)
    stack.setCustomSpacing(8, after: heading)
    stack.setCustomSpacing(24, after: nextStep)
    stack.translatesAutoresizingMaskIntoConstraints = false
    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(scroll)
    scroll.addSubview(stack)
    NSLayoutConstraint.activate([
      scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
      scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
      stack.leadingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(
        equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
      stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 12),
      stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
      stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48),
    ])
  }

  private func label(_ text: String, style: UIFont.TextStyle) -> UILabel {
    let label = UILabel()
    label.text = text
    label.font = .preferredFont(forTextStyle: style)
    label.adjustsFontForContentSizeCategory = true
    label.numberOfLines = 0
    return label
  }

  private func showSaved(url: URL) {
    spinner.stopAnimating()
    symbolBackground.backgroundColor = UIColor { traits in
      traits.userInterfaceStyle == .dark
        ? UIColor(red: 0.12, green: 0.22, blue: 0.15, alpha: 1)
        : UIColor(red: 237 / 255, green: 243 / 255, blue: 238 / 255, alpha: 1)
    }
    symbol.image = UIImage(systemName: "checkmark")
    symbol.tintColor = UIColor { [leaf] traits in
      traits.userInterfaceStyle == .dark ? .systemGreen : leaf
    }
    heading.text = "Recipe link saved."
    status.text = "Your link is ready to add to your account."
    source.text =
      url.host?.replacingOccurrences(of: "www.", with: "", options: .anchored) ?? "Shared website"
    sourceCard.isHidden = false
    nextStep.isHidden = false
    done.configuration?.title = "Done"
    UIAccessibility.post(
      notification: .announcement, argument: "Recipe link saved. Open Foodedo to import.")
  }

  private func captureRecipe() async {
    do {
      var texts: [String] = []
      for item in (extensionContext?.inputItems as? [NSExtensionItem] ?? []).prefix(8) {
        if let text = item.attributedContentText?.string { texts.append(text) }
        for provider in (item.attachments ?? []).prefix(8) {
          let type =
            provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
            ? UTType.url.identifier : UTType.plainText.identifier
          guard provider.hasItemConformingToTypeIdentifier(type) else { continue }
          let loaded = try await load(provider, type: type)
          if let url = loaded as? URL {
            texts.append(url.absoluteString)
          } else if let text = loaded as? String {
            texts.append(text)
          }
        }
      }
      let text = texts.joined(separator: "\n")
      guard text.utf16.count <= 80_000 else { throw SharedRecipeInboxError.invalid }
      let detector = try NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
      let urls = detector.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap
      { $0.url }.filter { ["http", "https"].contains($0.scheme?.lowercased() ?? "") }
      let url = try SharedRecipeInbox.preferredURL(urls)
      try Task.checkCancellation()
      try SharedRecipeInbox().capture(url: url.absoluteString, text: text)
      showSaved(url: url)
    } catch {
      guard !Task.isCancelled else { return }
      spinner.stopAnimating()
      symbol.image = UIImage(systemName: "exclamationmark.triangle")
      symbol.tintColor = accent
      heading.text = "Couldn’t save this link."
      status.text = error.localizedDescription
      done.configuration?.title = "Done"
      UIAccessibility.post(
        notification: .announcement,
        argument: "Couldn’t save this link. \(error.localizedDescription)")
    }
  }
  private func load(_ provider: NSItemProvider, type: String) async throws -> NSSecureCoding? {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: item)
        }
      }
    }
  }
  @objc private func close() {
    captureTask?.cancel()
    extensionContext?.completeRequest(returningItems: nil)
  }
}
