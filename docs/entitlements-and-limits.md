# Account entitlements and import limits

Every existing account defaults to **free**. Standard catalogue access, saved
catalogue favourites, planning and shopping remain available under their existing
contracts. There is no billing integration or paid upgrade flow in this change.

## Policy

`src/lib/domain/entitlements.ts` is the central tier/feature/allowance policy.
The free tier currently permits:

- **10 saved imported recipes** in the private library. Plan-only snapshots and
  household copies do not consume private library capacity. Removing an import
  from the library frees a slot; its private row remains available to pinned
  plans and shopping lists. Existing accounts above the cap keep their recipes
  and can edit/read them; new imports wait until space is available.
- **20 import attempts per UTC calendar month**, resetting at midnight on the
  first day of the next month. New starts, explicit retries, resumed failed
  imports with new text, and resumed drafts each consume one attempt when
  accepted. Failed provider/model attempts still count. Internal model recovery,
  editing and finalizing a draft do not consume extra attempts. Invalid requests,
  rejected limits and duplicate start requests do not consume attempts.
- **Two simultaneous imports**, including queued and processing jobs. These jobs
  also reserve library capacity so parallel starts cannot overfill the library.
  Waiting-for-input drafts release their reservation; finalization checks current
  capacity again.

`convex/lib/entitlements.ts` resolves server-owned entitlements.
`api.entitlements.current` returns a server-clock snapshot of tier, grant expiry,
feature flags and numeric limits for future UI use. Backend writes independently
resolve policy and enforce it; a client snapshot is never authorization.

The reserved `premium` policy currently uses 100 saved imports, 100 attempts per
month and five simultaneous jobs as provisional configuration, not a published
commercial offer. No production grants are created by this implementation.
`accountEntitlements` has no public write API. A premium grant must have a future,
finite `validUntil`; absent, expired or invalid grants resolve to free.

Future billing must verify active subscription status server-side before issuing
or extending a grant, revoke it when appropriate, and set an expiry rather than
trust client/Clerk metadata. New premium feature flags belong in the central
policy, with free defaults and backend checks using `requireFeature`. Current
feature policy enables `recipeImport` for both tiers; nothing in the standard
catalogue is put behind a premium flag. Premium catalogue delivery, if introduced,
needs its own authenticated, server-verified entitlement checks.

## Enforcement and storage

`convex/lib/importLimits.ts` uses `@convex-dev/rate-limiter` 0.4.3 in synchronous,
transactional mode. Enqueue, capacity/concurrency reads, allowance consumption and
job scheduling commit together. Monthly state is keyed by the server-derived
Foodedo user ID, never by a client-selected tier or household. `accountImportUsage`
tracks the current window/configuration, not a growing event log; month changes
reset the component state. Tier changes preserve attempts already spent that
month. Downgrades cannot reset usage to gain another free allowance.

Final completion and draft finalization also check saved-import capacity. Quota
errors use structured `ConvexError` codes: `IMPORTED_RECIPE_LIMIT`,
`IMPORT_ALLOWANCE_EXHAUSTED` and `IMPORT_CONCURRENCY_LIMIT`. Web/import continuation,
draft editing and native capture flows display their specific next-step messages.
Native capture pauses automatic retries on a limit and retains the local capture.
Its retry notice remains visible, and returning to the foreground rechecks the
limit so the capture can resume after capacity or allowance becomes available.

Existing data requires no destructive backfill: the new usage/grant tables start
empty, existing imported recipes are counted using the existing saved/source
index, and grants are opt-in server data. Schema additions include an import
owner/status index and a proposal/operation/time index.

## Account deletion

Deletion records the Clerk tombstone, leaves household membership and removes the
user row atomically. User resolution then immediately denies private access;
allowlisted admin identities are also checked against deletion tombstones.

Private rows drain in batches of at most eight across all personal tables. The
internal `users.cleanupDeletedUser` continuation is idempotent and refuses a live
user ID. It removes usage/grants and resets the component allowance at completion.
In-flight imports check the owner's existence before claiming, exposing payload,
staging, recording acquisition or completing, so deferred cleanup cannot recreate
private recipes. Image attachment also refuses deleted owners while recipe rows
await cleanup, allowing the image-copy action to discard its uploaded file.
Repeated webhook delivery cannot restore a deleted identity.
Household content remains under the existing retained-content policy.

## Recipe edits and shopping history

Recipe edits reconcile active plans atomically, with bounded reads. A small,
bounded historical fast path handles up to two slot references in the same
transaction. Remaining archived lists reconcile through internal continuations,
one slot reference/plan per transaction. They may briefly show the previous
quantities while the worker runs, and remain editable. Each worker reads the
latest recipe rather than carrying old content, so older workers cannot undo a
newer edit. Derived ingredient state and manual extras retain the existing merge
semantics. Plan writes still reconcile their linked list atomically.

## Delivery and verification

Deploy the backend/component/schema before releasing clients that consume it.
Development uses the existing V2 target with `pnpm exec convex dev --once` after
classification; production deployment is a separate explicit operation. Do not
point these commands at V1 or provision another backend.

`tests/convex-test.ts` registers the rate-limiter component (including its bundled
batch-worker dependency) for the existing Convex suite. Coverage includes quota
rollback, parallel starts, monthly reset, tier expiry/change, saved capacity,
repeated starts, immediate deletion revocation, bounded cleanup, late import
completion and archived reconciliation across successive edits.

Implementation verification (9 November 2026): 457 tests across 46 files pass,
lint/typecheck/format checks pass, and both `pnpm build` and
`pnpm build:ios:web` pass. All 114 registered top-level backend functions have
return validators. The component, schema and functions were applied successfully
to V2 development deployment `bold-walrus-818`; production was not changed.
