# Household MVP

Household and Private are independent plan-and-shopping spaces. Members default to Household when joining or creating, then their deliberate selection is remembered per Clerk account, household and device. It follows Home, Week, Shop, plan generation, adjustments and history. Personal recipe libraries and usual planning settings remain account-owned. Household planning aggregates every current member’s saved catalogue favourites, while the initiating account controls plan length, servings and the use-favourites switch. See [meal selection](../knowledge/architecture/meal-selection.md).

Reviewed designs: [Foodedo V2 — Household](https://app.paper.design/file/01M0FD2K4HNTJZ5MET5T0CNYP7/p-2-0).

Signed-in accounts without a household see a small **Share your week** section on Home, with or without an active plan. It links to household creation and is hidden for guests, unresolved membership and existing members. Web invite links use the current browser origin (including localhost and its port); packaged iOS links use `NEXT_PUBLIC_SITE_URL` or the canonical fallback.

Week and Shopping use the same responsive header layout and fixed 120×44px context selector. At widths below 360px, the full-width title and metadata precede a controls row (context left, secondary action right). Wider layouts place context beside the title and the action beside metadata. “Edit this week” and “View week” remain independent text actions with 44px targets; shopping progress follows the header. Private uses “My week” and “My shopping”.

## Storage and access

`households` keeps its creator as attribution and an optional `closedAt`. `householdMembers` indexes both household and user; a user has at most one membership, enforced transactionally. There are no roles or administrator controls.

Existing `ownerId` fields on plans, slots, lists, items and recipe snapshots now accept a typed `users` **or** `households` ID. This preserves existing personal data and indexes without backfilling rows or conflating a creator with shared ownership. `requireSpace` derives the private user from Convex authentication, or validates current membership and an open household for the supplied household ID. List/item/slot/recipe checks retain the same owner throughout. Personal recipe writes still require that account's user ID. Shared recipe reads validate membership independently of the selected UI context.

Creating a household copies the active private plan, referenced recipe snapshots and linked shopping state, including manual extras, checks and removals. Private history and original content are untouched. Household recipe snapshots have no private-library membership and are independently retained. Automatic Household selection uses current catalogue meals and already-shared recipe snapshots. It does not automatically expose members’ private imports. Explicit recipe sharing copies snapshots rather than referencing mutable private originals. Individual meal rejections and accepted-plan outcomes are recorded in their own space; whole-week changes are not inferred dislikes.

The copied shopping list is reconciled against the copied recipes so obsolete source references cannot break creation or leave stale ingredients in the shared list. This reconciliation does not mutate the private list. Saved-recipe links work in both contexts; signed-out recipe and Cook links offer sign-in recovery before accessing account data.

Leaving removes membership immediately. Remaining members keep access. The final departure closes the household and retains its records; no shared content is copied back to Private or exposed through an archive/restore UI. Clerk account deletion uses the same membership departure and deletes only user-owned content.

## Invitations

Any member may create/reuse one current unused link, share it using the existing native/browser sheet, copy it, or cancel it. Tokens use 32 bytes from the browser cryptographic RNG, with a uniqueness check on insertion. Links are single-use and expire after seven days. Mutation time is authoritative; the public preview takes a display clock so the query itself has no nondeterministic clock reads. The preview discloses only the inviter's name for a valid link.

`/household/join?token=…` is a static client route. Signing in never accepts an invitation. The recipient sees their account and can switch accounts before explicitly joining. Acceptance is transactional and idempotent for an existing member. A different household requires an explicit leave confirmation followed by a separate join. The token remains in the URL for retries. A device-local continuation carries it through sign-in once and is consumed when the authenticated join page opens; it must not be recreated when membership changes remount that page. Acceptance selects Household and replaces the join route with `/week` (Our week), with a welcome toast. The logo always opens Home. An invitation continuation takes precedence over unrelated pending guest-plan claims until the join page opens.

## Concurrent work and drafts

Each signed-in account/context has its own IndexedDB draft key. An operation captures its store before asynchronous work; changing selection cannot retarget it. Authenticated generation also captures the original active plan ID/version for reviewed saves. Existing-plan replanning captures the source in its review URL, preserves elapsed slots and uses server-side deterministic proposals. Any newer plan edit blocks the old review. Adjustment drawers freeze their reviewed version when opened.

That frozen revision also drives the adjustment form and its explanations; live partner edits never change its baseline. Resuming a next-week draft requires the same source revision. Persisted context selection remains authoritative across tabs, with a memory fallback only if storage is unavailable.

Replacement carries manual shopping extras, checked/removal state on matching still-needed ingredients, and unchecked new ingredients to the new plan's list. Undo captures original plan IDs and context and refuses a newer plan version. Item removal undo likewise retains the original item and context even after navigation.

Cook servings are local display/session state. They do not mutate the plan or shopping list. Shared recipe details hide private edit/save/share actions and identify the snapshot's household provenance.

## iOS Universal Links and release checks

The App plugin listens for warm `appUrlOpen` and cold `getLaunchUrl` events. Only the canonical HTTPS origin and exact `/household/join` path with one valid token are routed internally. Clerk's existing custom-scheme OAuth callback stays with its existing transport.

The repository includes `public/.well-known/apple-app-site-association` and `App.entitlements`, scoped to `foodedo.com` and `2UFQ4ZW67L.com.foodedo.app` from the configured Xcode team and bundle ID. Before the partner soft launch:

1. Confirm the signing profile's App ID prefix matches `2UFQ4ZW67L`; update AASA if Apple uses another prefix. Enable Associated Domains on the app identifier/provisioning profile.
2. Set `NEXT_PUBLIC_SITE_URL` to the actual canonical public HTTPS domain; keep the entitlement domain and hosted AASA in agreement. Deploy the V2 web build and V2 Convex functions using the existing project release process.
3. Verify `https://foodedo.com/.well-known/apple-app-site-association` returns JSON with HTTP 200 and no redirect, including through the actual hosting configuration.
4. Run `pnpm cap:sync:ios`, archive/sign in Xcode and install a fresh release-like build. Test links from Messages/WhatsApp with the app closed, open and absent. Verify the browser fallback and sign-in token continuation.
5. With two real accounts: create/copy, invite/join, switch Private/Household, edit concurrently, cook a shared recipe, check/remove/undo shopping, leave as creator, and finally close. Confirm Private remains unchanged.

Automated tests cover authorization, independent copies, single-use/cancelled/expired invites, stale reviewed writes, list-state preservation, creator/account departure, retained closure records and trusted-link parsing. Real-device association/signing and external hosting require the release checks above.

References: [Capacitor App](https://capacitorjs.com/docs/apis/app), [Apple Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains).
