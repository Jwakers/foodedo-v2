# Production pre-launch checklist

This is a release gate, not a backlog. Every applicable item must have an owner and evidence before the first public web or App Store release. Use separate production Clerk, Convex, hosting, OAuth, and webhook configuration; a working development flow is not proof that production is configured.

## 1. Release identity and ownership

- [ ] Confirm the App Store product will use bundle ID `com.foodedo.app` and will not conflict with an existing Foodedo listing.
- [ ] Select the production Apple Developer Team in Xcode and record the App ID Prefix from **Certificates, Identifiers & Profiles → Identifiers → Foodedo**. Do not assume the prefix is the Team ID for an older Apple account.
- [ ] Create or confirm the App Store Connect record, SKU, primary category, age rating, territories, support contact, and release owner.
- [ ] Confirm signing works for a physical device and for an archived Release build, not only the simulator.
- [ ] Record who owns Clerk, Convex, Vercel/hosting, Google Cloud OAuth, Apple Developer, App Store Connect, DNS, and incident access. Require MFA for every account that supports it.

## 2. Production environment isolation

- [ ] Create a Clerk production instance dedicated to Foodedo V2.
- [ ] Create a Convex production deployment dedicated to Foodedo V2.
- [ ] Create the production web deployment and domain. Do not use a development `*.vercel.app`, Clerk test instance, or Convex development deployment in the release build.
- [ ] Build the environment matrix below and verify every value from the built artifact:

| Concern                | Web build        | iOS build        | Convex deployment        |
| ---------------------- | ---------------- | ---------------- | ------------------------ |
| Clerk publishable key  | Production       | Production       | —                        |
| Clerk Frontend API URL | Derived from key | Derived from key | `CLERK_FRONTEND_API_URL` |
| Convex client URL      | Production       | Production       | —                        |
| Convex site URL        | Production       | Production       | —                        |
| Clerk webhook secret   | Never present    | Never present    | Production-only secret   |

- [ ] Confirm no V1 project, development deployment, test key, localhost address, or temporary callback URL appears in the web deployment, iOS archive, Convex production variables, or Clerk production dashboard.

## 3. Clerk and iOS authentication

- [ ] In Clerk production **Native applications**, add the iOS app using the exact Apple App ID Prefix and bundle ID `com.foodedo.app`. Clerk lists this as required production configuration in its [deployment guide](https://clerk.com/docs/guides/development/deployment/production#confirm-your-ios-app-is-registered-in-production).
- [ ] In Xcode **Signing & Capabilities**, add the Clerk associated domain required by the current Clerk iOS guidance: `webcredentials:{PRODUCTION_CLERK_FRONTEND_API_HOST}`. Use the host only—no `https://` or path—and verify the signed entitlement in the archive.
- [ ] Keep `capacitor://localhost` in the production Clerk instance's allowed origins while the packaged app uses Clerk's web client in its WebView.
- [ ] Add the exact production `${NEXT_PUBLIC_CONVEX_SITE_URL}/clerk-oauth-callback` URL to Clerk's **Allowlist for mobile SSO redirect**. Do not allowlist the development callback.
- [ ] Confirm `com.foodedo.app://callback` is registered in the Release app and cannot be confused with any other installed app owned by the team.
- [ ] Decide whether Clerk's Native API is required by the final architecture. The current hybrid WebView proof does not use Clerk's native token API; do not enable an additional public authentication pathway without documenting the bot-protection trade-off.
- [ ] Replace Clerk development/shared Google OAuth credentials with production credentials and verify the production domains, consent screen, support email, and publishing status in Google Cloud.
- [ ] If Google remains a primary-account login option on iOS, implement an equivalent privacy-preserving login—normally Sign in with Apple—or document why an exception in [App Review Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services) applies.
- [ ] Treat the internal Clerk OAuth transport API as a release risk: pin the tested `@clerk/react` version, test the installed ClerkJS runtime, and block dependency updates until the full iOS matrix passes. Prefer a documented Clerk-supported Capacitor path if one becomes available.

### Required authentication matrix

- [ ] New account and returning account: email flow on web, iOS simulator, and physical iPhone.
- [ ] New account and returning account: every enabled social provider on web, iOS simulator, and physical iPhone.
- [ ] Social authentication opens the iOS system authentication sheet, returns to Foodedo automatically, dismisses itself, and produces no JSON page, manual-close step, or unexplained spinner.
- [ ] Cancel at the provider, deny consent, choose the wrong account, lose the network, background/foreground the app, and retry. Each path returns to a usable state with an understandable message.
- [ ] Sign out, session expiry, revoked session, app relaunch, app upgrade, and reinstall behave as documented.
- [ ] A guest's in-progress plan survives the sign-in boundary and is claimed exactly once; canceling sign-in does not destroy it.
- [ ] Personal Convex queries and mutations reject unauthenticated access, another user's identity, expired JWTs, and forged identifiers.

## 4. Clerk–Convex synchronization

- [ ] Set the production Convex `CLERK_FRONTEND_API_URL` to the production Clerk Frontend API URL.
- [ ] Create a production Clerk webhook pointing only to the production Convex `/clerk-users-webhook` endpoint.
- [ ] Subscribe to `user.created`, `user.updated`, and `user.deleted`; store its distinct `whsec_...` value only in Convex production.
- [ ] Verify signatures against the raw body, reject missing/invalid signatures, and confirm logs contain no webhook secret or authentication tokens.
- [ ] Prove create/update delivery is idempotent and cannot duplicate a user. Prove deletion removes or anonymises all product data according to the retention policy.
- [ ] Test webhook delay, duplicate delivery, out-of-order delivery, provider retry, and a replay/resync procedure. Do not make immediate product access depend on webhook timing when JWT identity is already valid.
- [ ] Confirm all personal-data indexes and authorization checks against the production schema before importing or creating real user data.

## 5. Guest, account, and paid boundaries

- [ ] A guest can use the standard meal catalogue and core decision loop without signing in.
- [ ] Sign-in is requested only at a persistence, sync, identity, or paid-entitlement boundary, with the value explained before the prompt.
- [ ] Temporary guest data is clearly labelled, survives ordinary refresh/relaunch as designed, and has a tested retention/cleanup rule.
- [ ] Guest-to-account claiming is atomic, idempotent, retryable, and never silently overwrites existing account data.
- [ ] Reviewing plan alternatives performs no write. Applying one preserves elapsed meals, rejects a stale source plan, archives exactly one previous version, and can be undone without creating multiple active plans.
- [ ] Inject a development-only multiple-active-plan anomaly and verify the newest plan remains visible, plan edits are blocked, and the explicit recovery archives the others atomically.
- [ ] Verify shopping checks/removal are optimistic and roll back on mutation failure; removed items can be restored. Prove the 30-list account cap and daily 30-day inactive-list cleanup delete child items before their parent without crossing account boundaries.
- [ ] Standard meals are not gated for guests. If premium meals are introduced later, entitlement is checked server-side and requires both authentication and an active subscription.
- [ ] Account deletion is available inside the app and removes the Clerk account plus associated Convex data. Apple requires in-app initiation when an app supports account creation; follow its [account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- [ ] Data export, privacy requests, retention, deletion recovery window, and support escalation are documented and tested.

## 6. Secrets and security

- [ ] Run secret scanning across git history and release artifacts. No Clerk secret key, webhook secret, Convex deploy key, Apple private key, or Google client secret may be bundled into browser/iOS JavaScript or committed.
- [ ] Rotate any credential used in prototypes if it was pasted into a ticket, chat, log, screenshot, shell history, or client bundle.
- [ ] Restrict production dashboard roles and deployment tokens to least privilege; document emergency access and offboarding.
- [ ] Review Content Security Policy, allowed origins, callback allowlists, CORS, URL-scheme handling, and externally opened URLs. Reject unexpected hosts and callback shapes.
- [ ] Review dependencies and privacy manifests, remove unused SDKs, and resolve material audit findings before submission.
- [ ] Complete a threat-model pass for guest claiming, account takeover, webhook spoofing/replay, cross-user Convex access, custom-scheme interception, and paid entitlement bypass.

## 7. Quality gates and release build

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm build`
- [ ] `pnpm build:ios:web`
- [ ] `pnpm test:e2e`
- [ ] `pnpm exec cap sync ios`, followed by a clean Xcode Release archive using the production environment.
- [ ] Validate and upload the archive to App Store Connect; resolve all signing, entitlement, privacy-manifest, and API warnings.
- [ ] Run the release candidate from TestFlight on at least the oldest supported iPhone/iOS combination, a current small screen, and a current large screen.
- [ ] Test slow/offline networking, interrupted requests, cold/warm launches, background restoration, low storage, dark mode, Dynamic Type, VoiceOver, Reduce Motion, keyboard navigation on web, safe areas, and rotation policy.
- [ ] Verify web behavior in supported Safari, Chrome, and Firefox versions and iOS behavior independently. A passing desktop OAuth flow does not approve iOS.

## 8. Store, privacy, and support readiness

- [ ] Publish accessible Privacy Policy, Terms, support, and account-deletion URLs on the production domain.
- [ ] Complete App Store privacy answers from actual SDK/data behavior, including Clerk, Convex, analytics, crash reporting, and any AI service. Keep an evidence sheet mapping each declaration to code/configuration.
- [ ] Provide accurate screenshots, description, guest-mode explanation, reviewer notes, and a working review account or review path. Explain any non-obvious authentication callback behavior.
- [ ] Confirm food/allergen/nutrition wording, disclaimers, data sources, and user-reporting routes before those features ship; do not imply medical guarantees.
- [ ] Verify all user-facing email templates, sender domains, links, support replies, and rate limits in production.

## 9. Operations, monitoring, and rollback

- [ ] Add privacy-safe monitoring for web errors, native crashes, failed OAuth starts/completions, Convex authorization failures, and webhook failures. Never record authorization URLs, tokens, codes, or user-entered credentials.
- [ ] Define launch health thresholds and alerts for sign-in completion, crash-free sessions, webhook backlog, server errors, and core decision-loop completion.
- [ ] Test a rollback for web, Convex functions/schema changes, Clerk provider configuration, and the iOS release. Database migrations must be backwards-compatible with the previous app version.
- [ ] Keep a remotely controllable way to disable a failing social provider or non-essential integration without blocking email access or guest use.
- [ ] Document incident roles, status messaging, support macros, data-breach escalation, and a post-launch observation window.

## Release sign-off

| Gate                             | Owner | Evidence/link | Approved/date |
| -------------------------------- | ----- | ------------- | ------------- |
| Product and guest boundary       |       |               |               |
| Security and privacy             |       |               |               |
| Clerk and Convex production      |       |               |               |
| Web release candidate            |       |               |               |
| iOS/TestFlight release candidate |       |               |               |
| App Store metadata and review    |       |               |               |
| Monitoring and rollback          |       |               |               |

Do not release with a blank evidence column for an applicable gate.
