import AuthenticationServices
import Capacitor
import OSLog
import UIKit

@objc(ClerkOAuthPlugin)
public class ClerkOAuthPlugin: CAPInstancePlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "ClerkOAuthPlugin"
    public let jsName = "ClerkOAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private let callbackURLScheme = "com.foodedo.app"
    private var authenticationSession: ASWebAuthenticationSession?
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.foodedo.app",
        category: "ClerkOAuth"
    )

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
