import AuthenticationServices
import Capacitor
import OSLog
import Security
import UIKit

@objc(ClerkOAuthPlugin)
public class ClerkOAuthPlugin: CAPInstancePlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "ClerkOAuthPlugin"
    public let jsName = "ClerkOAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getClientToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setClientToken", returnType: CAPPluginReturnPromise)
    ]

    private let callbackURLScheme = "com.foodedo.app"
    private var authenticationSession: ASWebAuthenticationSession?
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.foodedo.app",
        category: "ClerkOAuth"
    )

    private func tokenQuery(_ call: CAPPluginCall) -> [String: Any]? {
        guard let host = call.getString("frontendApiHost"),
              host.range(of: "^[a-zA-Z0-9.-]{1,253}$", options: .regularExpression) != nil else {
            call.reject("The authentication service host is invalid.")
            return nil
        }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "\(Bundle.main.bundleIdentifier ?? "com.foodedo.app").clerk-client",
            kSecAttrAccount as String: host.lowercased(),
            kSecAttrSynchronizable as String: false
        ]
    }

    @objc func getClientToken(_ call: CAPPluginCall) {
        guard var query = tokenQuery(call) else { return }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve([:])
        } else if status == errSecSuccess, let data = result as? Data,
                  let token = String(data: data, encoding: .utf8) {
            call.resolve(["token": token])
        } else {
            call.reject("Foodedo could not read secure sign-in storage. Unlock your iPhone and try again.", "keychain_read_failed")
        }
    }

    @objc func setClientToken(_ call: CAPPluginCall) {
        guard let query = tokenQuery(call) else { return }
        guard let token = call.getString("token"), !token.isEmpty,
              token.utf8.count <= 16_384,
              let data = token.data(using: .utf8) else {
            call.reject("The sign-in storage value is invalid.")
            return
        }
        let attributes: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Foodedo could not save secure sign-in storage. Unlock your iPhone and try again.", "keychain_write_failed")
        }
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        logger.info("Native Clerk OAuth request received")

        guard let urlString = call.getString("url"),
              let url = URL(string: urlString),
              let scheme = url.scheme,
              scheme == "https" || scheme == "http" else {
            logger.error("Rejected invalid authentication URL")
            call.reject("A valid HTTP(S) authentication URL is required.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("The authentication session is unavailable.")
                return
            }

            guard self.authenticationSession == nil else {
                self.logger.error("Rejected overlapping authentication session")
                call.reject("An authentication session is already running.")
                return
            }

            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: self.callbackURLScheme
            ) { [weak self] callbackURL, error in
                self?.authenticationSession = nil

                if let callbackURL {
                    self?.logger.info("Native Clerk OAuth callback received")
                    call.resolve(["callbackUrl": callbackURL.absoluteString])
                    return
                }

                if let authenticationError = error as? ASWebAuthenticationSessionError,
                   authenticationError.code == .canceledLogin {
                    self?.logger.info("Native Clerk OAuth cancelled")
                    call.reject("Social sign-in was cancelled.", "oauth_cancelled")
                    return
                }

                self?.logger.error(
                    "Native Clerk OAuth failed with code \((error as NSError?)?.code ?? -1)"
                )
                call.reject(
                    error?.localizedDescription ?? "Social sign-in could not complete.",
                    "oauth_failed",
                    error
                )
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authenticationSession = session

            if session.start() {
                self.logger.info("Native Clerk OAuth session started")
            } else {
                self.authenticationSession = nil
                self.logger.error("Native Clerk OAuth session failed to start")
                call.reject("Social sign-in could not start.", "oauth_start_failed")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let bridgeWindow = bridge?.viewController?.view.window {
            return bridgeWindow
        }

        if let keyWindow = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) {
            return keyWindow
        }

        logger.error("No presentation window is available for native Clerk OAuth")
        return ASPresentationAnchor()
    }
}
