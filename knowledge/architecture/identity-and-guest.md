# Identity and guest access

Foodedo should earn an account request by demonstrating value first. A visitor may try the core decision loop without signing in, but durable personal data belongs to an authenticated account.

## Capability boundary

| Capability                                            | Guest                    | Account                    |
| ----------------------------------------------------- | ------------------------ | -------------------------- |
| Use the complete standard Foodedo meal catalogue      | Yes                      | Yes                        |
| Adjust lightweight context such as time or servings   | Temporary                | Saved                      |
| Build a short draft plan and derived shopping preview | Temporary on this device | Saved and synced           |
| View a standard catalogue meal in Cook mode           | Yes                      | Yes                        |
| Import or permanently save personal recipes           | Sign-in boundary         | Yes                        |
| Keep plans, settings, and cooking history             | Sign-in boundary         | Yes                        |
| Remember, cross-device sync, notifications            | No                       | Yes                        |
| Access explicitly premium meals (future)              | No                       | Active subscription, later |

“Temporary” means a versioned local draft may survive refresh or an accidental close, but it is not cloud-backed, portable, or guaranteed. The interface must say this plainly. The primary prompt is **Keep this plan**, not “Create an account to continue.”

Guest access is an activation path, not the later Discover job. It must not become a generic recipe feed or a second product.

Authentication protects durable personal data; it does not unlock the standard meal catalogue. The initial catalogue may be small because the product is early, but guests and account holders must see the same complete standard catalogue for that release.

## Guest data

- Use a versioned standard meal catalogue shared by guests and account holders. The initial implementation may bundle it with the app, but bundling is a delivery choice—not a guest access tier or a separate “starter” collection.
- Store only a bounded draft locally (prefer IndexedDB behind a platform adapter): catalogue meal IDs, short-horizon meal choices, lightweight preferences, schema version, and timestamps.
- Do not put guest-owned recipes, plans, settings, or synthetic guest users in Convex.
- Do not store secrets or treat a device identifier as identity.
- Give the user an obvious way to clear the draft.

This avoids abandoned anonymous accounts, retention cleanup, and authorization ambiguity. The guest draft remains independent of the backend; while the initial catalogue is bundled, the iOS app can render it without reaching the web origin.

## Future premium meals

Premium meal content is a later monetisation feature, not part of the identity milestone. When introduced:

- Standard catalogue meals remain available to guests without authentication.
- Premium meals are clearly designated additions, not standard meals moved behind a paywall.
- Premium meal access requires both an authenticated account and an active subscription entitlement.
- Entitlement checks happen on the server; premium content is not shipped in a guest-readable bundle and hidden only by the interface.

Do not add subscription tables, paywalls, or premium content delivery to the foundation merely to anticipate this boundary.

## Claiming a guest draft

After successful sign-in:

1. Generate a stable, random claim key for the local draft.
2. Send the bounded draft to one authenticated Convex mutation.
3. Validate schema version, payload limits, catalogue meal IDs, and all values on the server.
4. Use the claim key idempotently so retries cannot duplicate recipes or meal slots.
5. Copy only referenced standard catalogue meals into user-owned recipes, create the saved plan/preferences, and record the claim.
6. Delete the local draft only after the server acknowledges success. Preserve it on failure and offer retry.

Never accept `userId` or an auth-provider subject from the client. The mutation derives the owner from `ctx.auth`.

If the account already contains data, show a concise merge summary before claiming anything that could conflict. Do not silently replace an existing plan or settings.

## Authentication provider

**Clerk is accepted for V2**, integrated with Convex JWT validation. Guest access remains local and does not use Clerk anonymous accounts.

The shared Next.js shell uses Clerk's framework-neutral React SDK and `ConvexProviderWithClerk`; it deliberately does not use `@clerk/nextjs`, Next.js Proxy, request cookies, or server-side Clerk helpers because their server-action/request paths are incompatible with the Capacitor static export. Both deliveries use Clerk's standard-browser mode: Capacitor hosts it in a cookie-capable `WKWebView` whose `capacitor://localhost` origin is allowlisted. The Capacitor build adds one platform OAuth adapter backed by Apple's `ASWebAuthenticationSession`. Clerk returns to an HTTPS Convex bridge, which opens `com.foodedo.app://callback` so the native authentication sheet can complete and dismiss; it does not replace Clerk's browser session with native token storage. Convex functions remain the authoritative authorization boundary and derive identity from the validated JWT.

Before shipping authentication, complete the cross-platform proof against both the Vercel web build and the Capacitor iOS build. Verify:

- Convex JWT integration and authorization state
- email/passwordless flow and any chosen social providers
- redirects/deep links in the iOS WebView
- static-export compatibility with client-side auth
- sign-out, expiry, interrupted-connectivity recovery, and account deletion
- guest-draft claiming and retry behavior
- pricing, maturity, maintenance, and lock-in

Email/passwordless sign-in is the first proof. Google is the first external-browser proof through the isolated Capacitor OAuth adapter. Every social/SSO flow still needs explicit Clerk native-application registration, the exact HTTPS Convex bridge in the mobile redirect allowlist, the registered iOS app scheme, and device testing before enablement. If the internal Clerk transport surface becomes unreliable, replace the isolated adapter—potentially with a narrow Clerk iOS bridge—rather than changing the backend identity model or recreating Clerk's native token protocol in JavaScript.

The provider decision is recorded in [ADR 0008](../decisions/0008-convex-and-clerk.md). Remaining iOS work is delivery validation, not a vendor-selection spike.

## Next implementation milestone

Build the recipe prerequisite, then one identity vertical slice:

1. **Recipe kernel — foundation complete:** bounded recipe content and `CatalogueMeal`, lossless ingredient lines, private authenticated create/read/list operations, and owner indexes now exist. A product-facing recipe interaction remains deliberately unbuilt.
2. **Guest contract:** define `GuestDraftV1`, a versioned standard catalogue shared across access states, and a platform storage interface with an IndexedDB implementation. It may be small and bundled initially, but it is never a guest-only subset. Keep rendering work minimal until the interaction is designed.
3. **New Convex project — complete:** V2 has a separate project and development deployment; no V1 keys or deployments are shared.
4. **Minimum schema:** keep `users` and `recipes`; add `mealSlots` and `guestClaims` only with the claim slice. Defer shopping persistence and Remember events.
5. **Authorization boundary:** derive every owner from `ctx.auth` and use owner indexes from the first personal operation.
6. **Auth integration — proof complete:** email and Google sign-in, token propagation, sign-out, and the iOS return flow work in development. Repeat the full matrix against release environments before launch.
7. **Claim flow:** implement the single idempotent `claimGuestDraft` mutation and retain the local draft until acknowledgement.
8. **E2E proof:** guest reaches Decide, chooses Keep, authenticates, claims once, reloads as an account, and cannot access another user's data.

Do not begin with a full recipe importer, settings surface, shopping schema, or provider-specific user-profile system. The milestone succeeds when the identity transition is trustworthy.

## Authorization boundary

- Public/unauthenticated standard-catalogue reads, if introduced later, must be explicit, bounded, and non-personal.
- Premium catalogue reads, when introduced, require server-verified authentication and subscription entitlement.
- Every persistent personal mutation requires authentication and derives ownership server-side.
- Every personal query scopes through an owner index; never fetch broadly and filter afterward.
- Guest behavior must work without weakening the authenticated API.
