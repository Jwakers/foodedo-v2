import Capacitor
import UIKit
import WebKit

final class BridgeViewController: CAPBridgeViewController {
    private var launchCover: UIImageView?
    private var webViewProgressObservation: NSKeyValueObservation?
    private var isFinishingLaunch = false

    override func viewDidLoad() {
        super.viewDidLoad()

        guard
            let imageURL = Bundle.main.url(forResource: "LaunchWordmark", withExtension: "png"),
            let image = UIImage(contentsOfFile: imageURL.path)
        else {
            return
        }

        let imageView = UIImageView(image: image)
        imageView.backgroundColor = .white
        imageView.contentMode = .scaleAspectFill
        imageView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            imageView.topAnchor.constraint(equalTo: view.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        launchCover = imageView
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(ClerkOAuthPlugin())
        bridge?.registerPluginInstance(CookScreenPlugin())

        // Match native-app zoom: the packaged viewport already locks scale, and
        // this also covers live-reload which loads the zoomable web build.
        webView?.scrollView.minimumZoomScale = 1
        webView?.scrollView.maximumZoomScale = 1
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false

        guard let webView else {
            removeLaunchCover()
            return
        }

        if let launchCover {
            view.bringSubviewToFront(launchCover)
        }
        webViewProgressObservation = webView.observe(
            \.estimatedProgress,
            options: [.initial, .new]
        ) { [weak self, weak webView] _, change in
            guard let self, let webView, (change.newValue ?? 0) >= 1 else {
                return
            }
            self.finishLaunch(after: webView)
        }
    }

    private func finishLaunch(after webView: WKWebView) {
        guard !isFinishingLaunch else { return }
        isFinishingLaunch = true
        webViewProgressObservation = nil

        // Wait for the completed document to paint twice before revealing it.
        // This follows actual readiness and does not impose a fixed splash delay.
        webView.evaluateJavaScript(
            "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))"
        ) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.removeLaunchCover()
            }
        }
    }

    private func removeLaunchCover() {
        launchCover?.removeFromSuperview()
        launchCover = nil
    }
}
