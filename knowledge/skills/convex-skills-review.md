# Convex skills review — 9 November 2026

Reviewed commit `574fb09`, all 33 installed skill entry points and the component
references against the V2 architecture, backend function surface and existing
tests. The `.agents` and `.claude` copies are identical. Installed Convex is
1.45.0; the generated guidelines declare a `^1.44.0` target, which includes
1.45.0. No version mismatch was established.

This is a source review and local verification, not a live deployment health,
usage, cost or recovery assessment. No deployment, secret, provider or component
was changed. No transcript was shared. Vendor skill files remain unchanged.

## Findings in existing code

### Important: account deletion grows without a transaction bound

`convex/users.ts:100` (`deleteFromClerk`) collects and deletes every private
import, feedback record, plan, slot, list, item and recipe in one mutation.
These are owner-indexed reads, but a user's lifetime history is unbounded. A
large account can exceed transaction read/write limits. The whole mutation then
rolls back, including its deletion marker, leaving cleanup and access revocation
dependent on a successful retry of the same oversized transaction.

Recommended change: commit the deletion marker and invalidate account access
first, then run idempotent, bounded internal cleanup batches. Update auth helpers
to reject marked identities while a user row still exists; preserve household
departure and retained shared-content semantics. Verify interrupted/repeated
cleanup, in-flight import completion, stale JWTs and webhook races. Merely
changing each `collect()` to `take(n)` would silently leave personal data behind.

### Important: import budgets apply per attempt, not per account

`convex/recipeImports.ts:100` (`beginImport`) authenticates and deduplicates an
existing client request ID, but a caller can submit many distinct IDs and
schedule a new paid pipeline for each. Retry/recovery paths also schedule new
attempts. Individual model-call/time budgets do not bound aggregate account
spend or concurrency. Apify's upstream 429 handling is not an application quota.

Recommended change before broad public use: define a server-enforced per-account
start/retry allowance and an in-flight cap, with idempotent replays exempt from
double charging. `@convex-dev/rate-limiter` is a candidate for the quota once the
limits are decided; concurrency needs separate handling. Test parallel starts,
retries and distinct request IDs. No component was installed or limit invented
as part of this review.

### Important: recipe edits fan out across lifetime plan history

`convex/lib/shoppingListSync.ts:17` (`syncShoppingListsForRecipe`) collects every
slot referring to a recipe, then reconciles every associated plan's list within
the recipe-edit transaction. Reusing a recipe over many weeks grows this work
without a bound, even though each individual plan/list has limits.

Recommended change: explicitly decide which historical lists must reflect a
later recipe edit, then design a bounded update or versioned reconciliation
strategy. Preserve the current atomic plan/list behavior and editable archived
lists. Asynchronously updating arbitrary old lists or taking only the first N
slots would change the documented product contract; this needs a deliberate
design rather than a mechanical skill-driven rewrite.

### Contract hardening: 23 registered functions lack return validators

An AST inventory of top-level backend modules found 111 registered functions;
all have argument validators, but 23 omit `returns`:

- `convex/catalogueAdmin.ts`: 10 public functions (`access`, `overview`,
  `getProposal`, `analysisRows`, `begin`, `updateProposal`, `reject`,
  `deleteProposal`, `reviewMetadata`, `publish`) and nine internal functions
  (`payload`, `claim`, `recordUsage`, `completeRecipe`, `completeReview`,
  `completeImage`, `completeEnrichment`, `failRun`, `expireRun`).
- `convex/catalogueMaintenance.ts`: three public functions (`list`, `getMeal`,
  `start`).
- `convex/socialImportEvaluation.ts`: one internal action (`probe`).

This is a runtime output-contract gap, not proof of missing authorization or a
compile failure. Add shared explicit validators for the admin projections and
schema document validators where entire documents are intentionally returned.
Use `v.null()` for side-effect-only functions, retaining all current nullable
branches. Cover these contracts with the existing admin/maintenance tests.

### Lower priority: reuse indexes and bound complete reads deliberately

- `convex/lib/onboarding.ts:60` filters saved recipes by source after scanning
  `by_owner_and_saved_at`; the existing `by_owner_and_source_and_saved_at` index
  can express both predicates directly.
- `convex/lib/mealSelection.ts:35` scans all catalogue snapshots for every
  household member, filters saved state, then collects them. Reuse the saved
  catalogue index and an explicit overflow strategy, preserving the regression
  coverage that old favourites must not be crowded out by private imports.
- `convex/catalogueAdmin.ts:124` finds the latest image run by filtering a
  proposal's run history. A proposal/operation/time index would avoid scanning
  unrelated later runs if that history becomes large.
- `convex/lib/catalogue.ts:16` reads complete published recipe documents for
  catalogue consumers. Editorial publication has a 1,000-position guard, so
  this is not equivalent to unlimited user history, but full recipe bytes and
  repeated enrichment still deserve measurement as the catalogue grows.
  Prefer compact selection projections or explicit byte-aware limits over
  truncating the standard catalogue.

## Guidance adjustments applied

Updated `knowledge/skills/README.md` and linked it from the Convex skill rule in
`AGENTS.md`. This replaces the stale “Convex later” instructions and adds the
Foodedo adaptations for Clerk, guest reads, household ownership, deployment
verification, bounded AI jobs and the existing test setup. Upstream files and
their lock/state hashes were left intact.

Several generic claims need interpretation:

- `convex-auth` installs a different auth provider by default; Foodedo already
  uses Clerk. Component examples importing `getAuthUserId` need adapting too.
- `convex-authz`'s inline regex scan misses helper-based enforcement, and its
  referenced `content/convex-expert.md` is absent from this installation.
  Reuse Foodedo's helpers and user/household ID model instead of introducing a
  second ownership abstraction.
- `convex-reviewer` says every public function needs auth and every DB filter is
  a full-table scan. Catalogue guest reads are intentional; filters scan the
  selected query range. See the official [filter documentation](https://docs.convex.dev/database/reading-data/filters).
- Generated guidance prefers `tokenIdentifier` universally. It combines issuer
  and subject for multi-provider uniqueness; the current single-issuer Clerk
  schema and webhooks deliberately use the Clerk subject. See [identity fields](https://docs.convex.dev/auth/functions-auth).
- `convex-expert`/`convex-design` overgeneralize agent/workflow adoption and
  require a push for self-verification. Neither warrants replacing Foodedo's
  bounded non-conversational AI pipelines or deploying during a source review.
- `convex-verify` says dependency inlining is required. The current 445-test run
  succeeds without it; retain the working config and explicit module maps.
- `convex-env`'s actions-only `process.env` rule conflicts with existing admin
  allowlists and cron configuration. Do not move authorization into an action
  to satisfy that sentence. Verify API/runtime support against installed types
  before changing environment access.
- Several operations skills refer to absent pack tooling: `specs/finding*.json`,
  `generators/suggest-detector.mjs`, `/add-component`, `check-updates`,
  `quickstart-recipe@^2` and `wait_for_event`. No Convex MCP tools are exposed in
  this review session. Installing skill text does not supply those facilities.
- `convex-suggest`'s claim that an ordinary mutation counter inherently races
  is too broad: Convex mutations are transactional. Evaluate contention,
  rollback semantics and actual requirements before replacing counters.

## All installed skills: disposition

| Skills                                                      | Application to Foodedo                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convex`, `convex-expert`, `convex-docs`, `convex-reviewer` | Useful now, with the repository adaptations above.                                                                                                     |
| `convex-authz`                                              | Useful for owner/member/admin checks; trace helpers and preserve intentional public reads.                                                             |
| `convex-test`, `convex-verify`                              | Useful now; the test infrastructure and negative auth cases already exist.                                                                             |
| `convex-explain-app`                                        | Useful read-only architecture mapping.                                                                                                                 |
| `convex-deploy-guard`                                       | Useful when deployment operations are actually requested.                                                                                              |
| `convex-advisor`, `convex-insights`, `convex-cost`          | Useful with scoped live evidence/tools; source review cannot establish production health or spend.                                                     |
| `convex-launch-readiness`, `convex-optimize`                | Later composite audits; distinguish missing live coverage from a passing check and adapt absent report tooling.                                        |
| `convex-add`, `convex-design`, `convex-suggest`             | Use for a concrete capability need; preserve the agreed stack and verify component/tool availability.                                                  |
| `convex-agent`                                              | Future conversational/RAG capability, not a requirement for recipe normalization. Do not switch gateways by default.                                   |
| `convex-auth`                                               | Do not apply its provider-install recipe; Clerk is already integrated.                                                                                 |
| `convex-billing`                                            | Deferred by product principles; no subscriptions or paywall work required now.                                                                         |
| `convex-create-component`                                   | Use only for a justified isolated/reusable subsystem, not ordinary Foodedo feature logic.                                                              |
| `convex-crons`                                              | Existing native cron registration, internal targets and GMT/BST handling fit the need; no component replacement indicated.                             |
| `convex-backup`                                             | Worth a separate operational task including storage and an actual disposable restore drill. Never overwrite the existing dev deployment as a fallback. |
| `convex-migrate`, `convex-migrate-rehearse`                 | Use for a real schema/backfill change; preserve V2-only deployment rules and use a disposable rehearsal target.                                        |
| `convex-domains`, `convex-env`                              | Operational tasks only; adapt to Vercel, Clerk and the iOS callback/origin contract.                                                                   |
| `convex-quickstart`                                         | Not applicable to this established backend; do not re-scaffold or create anonymous deployments.                                                        |
| `convex-seed`                                               | For intentional fixtures/imports; do not interpret clear-then-insert as safe for current catalogue revisions or private data.                          |
| `convex-monitor`, `convex-sentinel`, `convex-self-heal`     | Separate observability work, requiring available tools, verified components and defined scope; no installation is implied by this review.              |
| `convex-improve-convex-plugin`                              | Explicit transcript-sharing opt-in only; reviewing this skill grants no sharing permission.                                                            |

## Verification

- `pnpm test:convex`: passed, 42 files / 445 tests, including backend TypeScript
  compilation, cross-user/guest boundaries, household departure, stale writes,
  recipe import and editorial approvals.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- Both skill copies match. This does not independently authenticate their
  upstream supply chain or prove optional external helpers/components exist.
- Web/iOS builds were not rerun: only documentation changed, with no routing,
  rendering or data-access edits. Live logs, transaction sizes, backups and
  release-device behavior were not tested.

Recommended implementation order: import spend controls and robust deletion,
then recipe-edit fan-out design, return validators, and targeted index/read
improvements. These runtime findings are recommendations; this review changes
only repository guidance and records the evidence.

## Implementation follow-up

The subsequent implementation addresses the import limits, deletion batches, historical reconciliation, 23 return validators and targeted indexes described above. The findings above record the original review, not the current implementation state. See [Entitlements and limits](../../docs/entitlements-and-limits.md) for the implemented contracts and free-tier policy. Live deployment health/cost measurements and a backup restore drill remain separate operational work.
