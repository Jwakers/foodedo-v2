import Capacitor
import UIKit

final class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(ClerkOAuthPlugin())
        bridge?.registerPluginInstance(CookScreenPlugin())

        // Match native-app zoom: the packaged viewport already locks scale, and
        // this also covers live-reload which loads the zoomable web build.
        webView?.scrollView.minimumZoomScale = 1
        webView?.scrollView.maximumZoomScale = 1
        webView?.scrollView.pinchGestureRecognizer?.isEnabled = false
    }
}
