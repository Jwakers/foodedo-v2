import Capacitor
import UIKit

@MainActor
private final class CookScreenAwakeCoordinator {
    static let shared = CookScreenAwakeCoordinator()

    private var requested = false
    private var observers: [NSObjectProtocol] = []

    private init() {
        let center = NotificationCenter.default
        observers = [
            center.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { _ in
                Task { @MainActor in
                    UIApplication.shared.isIdleTimerDisabled = false
                }
            },
            center.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.applyRequestedState()
                }
            }
        ]
    }

    func setEnabled(_ enabled: Bool) {
        requested = enabled
        applyRequestedState()
    }

    private func applyRequestedState() {
        UIApplication.shared.isIdleTimerDisabled =
            requested && UIApplication.shared.applicationState == .active
    }
}

@objc(CookScreenPlugin)
public class CookScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CookScreenPlugin"
    public let jsName = "CookScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setKeepAwake", returnType: CAPPluginReturnPromise)
    ]

    @objc func setKeepAwake(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            CookScreenAwakeCoordinator.shared.setEnabled(enabled)
            call.resolve()
        }
    }

    deinit {
        DispatchQueue.main.async {
            CookScreenAwakeCoordinator.shared.setEnabled(false)
        }
    }
}
