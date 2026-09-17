import Capacitor

final class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(ClerkOAuthPlugin())
        bridge?.registerPluginInstance(CookScreenPlugin())
    }
}
