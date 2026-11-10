# 0011 — Native Clerk client identity for packaged iOS

## Status

Implemented locally on 10 November 2026. Production Native API activation was
explicitly approved and completed that day. Jack confirmed successful production
Google sign-in on the updated physical iPhone build, then reported the reopening,
sign-out/re-sign-in and email checks working. TestFlight upload and installation
also succeeded. The extended authentication acceptance matrix is pending.
This supersedes ADR 0008's browser-cookie
delivery assumption for iOS; Clerk, Convex and the web authentication flow remain.

## Evidence

Production Clerk rejected the initial WebView origin until `capacitor://localhost`
was allowlisted. Its mobile SSO redirect list also needed the existing exact
production HTTPS bridge. After those configuration fixes, Clerk's application log
reported `oauth_callback.failed`, `reason: authorization_invalid`,
`reason_detail: no_valid_client`. ASWebAuthenticationSession returned a callback
containing only `__clerk_status=failed`. The cookie-based client that began the
attempt in WKWebView was unavailable to the separate browser callback. Development
OAuth success was not proof of the production cookie handoff.

## Decision

- Web continues using `@clerk/react` in standard-browser mode.
- Packaged iOS uses a pinned official ClerkJS instance in native mode
  (`standardBrowser: false`) with a real native request/token adapter, rather than
  flipping that option alone. Clerk owns token creation, verification, session
  lifecycle and rotation. Foodedo never mints or decodes these credentials.
- The adapter follows the [official Clerk native SDK hooks](https://github.com/clerk/javascript/blob/main/packages/electron/src/react/create-clerk-instance.ts):
  omit browser cookies, add `_is_native=1`, send the opaque client JWT in the
  Authorization header, and persist updated credentials returned by Clerk.
  Only requests to the configured HTTPS Clerk Frontend API host can access the
  token store. No Electron or Expo runtime is introduced.
- An extension to the existing Capacitor bridge reads/writes the client token in
  iOS Keychain, scoped by bundle ID and Clerk host, with
  `AfterFirstUnlockThisDeviceOnly` accessibility and no Keychain synchronization.
  There is no localStorage, plaintext-file or memory-only persistence fallback.
- Keep the already-allowlisted HTTPS Convex bridge and app-scheme return for
  ASWebAuthenticationSession. The native client identity and rotating nonce are
  handled by Clerk's SDK. No backend authentication broker or new schema is added.
- Load the native runtime only in the Capacitor delivery. Initialize Keychain and
  the sign-in UI before mounting the native Clerk provider. Failures offer retry
  without clearing drafts or modifying remote data.
- Pin ClerkJS 6.42.3, its shared runtime 4.44.1 and the native CDN sign-in UI
  1.42.4. Pinning the UI explicitly prevents the script loader's floating major
  version from silently changing the tested release. The compatible major-4 shared
  runtime is pinned across the existing React/backend SDKs so there are not two
  incompatible resource/UI type graphs. Re-run both delivery builds and the auth
  matrix before changing this version set.
- Disable Capacitor bridge logging because returned token payloads otherwise
  appear in debug output. Deliberate sanitized native OSLog messages remain.

## Production activation and security boundary

Jack explicitly approved “Enable native API and test the fix” on 10 November 2026,
after being informed of the different native CAPTCHA/bot-protection assumptions.
Native applications are now enabled in Foodedo's production instance. Existing
origin and mobile redirect allowlists were preserved; unrelated protection settings
were not changed. Register the production iOS app identity using its verified Apple App
ID Prefix and bundle ID before shipping.

This is not a backend deployment. Convex continues validating Clerk JWTs and
enforcing the existing user/household boundaries. No Convex production settings,
data, functions or schema are changed by this implementation.

## Verification required

Local verification passes: lint, TypeScript, formatting of changed files, 388
unit tests, 460 backend/rendering tests, 22 account-boundary browser fixtures and
the import-permission browser fixture. Both delivery builds and the unsigned
native Release archive compile. After activation, the production native-mode
environment request returns HTTP 200 with the expected `capacitor://localhost`
CORS origin; the standard website environment request also returns HTTP 200.
The prepared build is running on Jack's physical iPhone. Jack confirmed that
Google sign-in succeeds after activation and installation, then reported the
requested basic persistence, sign-out/re-sign-in and email checks working.
Expiry/revocation, deletion, account switching and the remaining extended
acceptance matrix below still require device verification. The UI CDN pin added
during code review must be included in the next native build and its sign-in
smoke test; it does not change the already-installed TestFlight binary.
The repository-wide formatting check reports existing vendor skill-file formatting
warnings; vendor files were left unchanged.

- Native request tests: cookie omission, restored client identity, token rotation,
  unexpected-host refusal and Keychain failure propagation.
- Lint, TypeScript, unit/backend tests, both web and iOS builds, and a native Release
  compile. The iOS archive is compilation evidence, not successful authentication.
- After approved production activation: guest → Google → return to Foodedo;
  email sign-in; cancel/deny/retry; fresh app launch; sign-out; expiry/revocation;
  account deletion; switching accounts; guest-draft continuation. Keep the device
  attached to Xcode during the initial round trip.
- A previous browser-cookie session is not migrated into native storage. Users
  may need to sign in again after this update; local guest drafts are preserved.
