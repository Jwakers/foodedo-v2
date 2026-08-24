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

## Authentication provider decision

Guest access must remain provider-independent. Do not select an auth system merely because it offers anonymous accounts.

Before adoption, run a small spike against both the Vercel web build and the Capacitor static-export build. Verify:

- Convex JWT integration and authorization state
- email/passwordless flow and any chosen social providers
- redirects/deep links in the iOS WebView
- static-export compatibility with client-side auth
- sign-out, expiry, interrupted-connectivity recovery, and account deletion
- guest-draft claiming and retry behavior
- pricing, maturity, maintenance, and lock-in

Current default for the spike: **Clerk**, because Convex documents it as a comprehensive third-party integration and it is mature for Next.js. This is a candidate, not an accepted decision. Convex Auth remains beta with experimental Next.js support. Convex + Better Auth supports anonymous accounts, but that does not outweigh the simpler local-guest boundary and adds a newer integration surface.

Record the selected provider in a new ADR only after the spike passes both builds.

## Next implementation milestone

Build one identity vertical slice rather than installing the whole future backend at once:

1. **Guest contract:** define `CatalogueMeal` and `GuestDraftV1` as domain types, a versioned standard catalogue shared across access states, and a platform storage interface with an IndexedDB implementation. It may be small and bundled initially, but it is never a guest-only subset. Keep rendering work minimal until the interaction is designed.
2. **New Convex project:** install Convex in V2 and run development setup from this repository, creating a deployment that is visibly unrelated to V1. Record its environments without copying any V1 keys.
3. **Minimum schema:** implement only `users`, `recipes`, `mealSlots`, and `guestClaims`. Defer shopping persistence and Remember events until their slices exist.
4. **Authorization helpers:** create one `requireCurrentUser` path and require it in every personal mutation/query. Add indexes before functions depend on them.
5. **Auth spike:** test the candidate provider's sign-in, token propagation to Convex, sign-out, expiry, and iOS redirect behavior in both production builds. Then accept an auth-provider ADR.
6. **Claim flow:** implement the single idempotent `claimGuestDraft` mutation and retain the local draft until acknowledgement.
7. **E2E proof:** guest reaches Decide, chooses Keep, authenticates, claims once, reloads as an account, and cannot access another user's data.

Do not begin with a full recipe importer, settings surface, shopping schema, or provider-specific user-profile system. The milestone succeeds when the identity transition is trustworthy.

## Authorization boundary

- Public/unauthenticated standard-catalogue reads, if introduced later, must be explicit, bounded, and non-personal.
- Premium catalogue reads, when introduced, require server-verified authentication and subscription entitlement.
- Every persistent personal mutation requires authentication and derives ownership server-side.
- Every personal query scopes through an owner index; never fetch broadly and filter afterward.
- Guest behavior must work without weakening the authenticated API.
