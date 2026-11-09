# Foodedo iOS launch preparation

Audit started 9 November 2026. Foodedo's web service is already live. Reuse its
verified V2 production services; do not create replacement accounts or deployments
just to complete this checklist. This document supplements
[the release gates](production-pre-launch-checklist.md), recording what was
actually checked rather than assuming unchecked historical items are missing.

## Current position

The native project exists for iPhone and iPad, including a recipe share extension,
system-browser authentication, household invitation links, and Cook Mode screen
behaviour. The app packages the Next.js static export; it does not load the live
website as its shell. Both targets use version 1.0 / build 1.

Local `.env.local` uses a Clerk **test** publishable key. A successful local build
or unsigned archive therefore proves compilation, not production authentication
or App Store readiness. No production dashboard changes or deployments were made
as part of this audit.

Changes made during preparation:

- Help now exposes Privacy Policy and Terms of Service to guests and signed-in
  users. iOS opens the hosted documents rather than a missing packaged route.
- Recipe imports on iOS ask permission before sending new input to OpenAI through
  Vercel AI Gateway and, for social sources, Apify. The same check covers direct
  import, sign-in continuation, retries, draft reprocessing and native captures.
  Declining retains the source and offers retry for automatic continuations.
  Permission is requested for each processing request, with no stored blanket
  permission. Saving or finalising an existing draft does not run AI.
- Account-deletion webhook handling now removes owned import jobs, source text
  and unfinished drafts, and schedules cancellation of active acquisition runs.
  A late pipeline completion cannot create a new recipe from a deleted job.
  Existing shared household content keeps its documented lifecycle.
- The share extension's Foundation reference now resolves against the selected
  SDK, replacing a hard-coded iOS 18 SDK location.
- Native household link handling now defaults to the same `www.foodedo.com`
  origin used to create invitation links, and associated domains include that
  host as well as `foodedo.com`.
- `pnpm build:ios:release` rejects test Clerk keys and missing or invalid public
  HTTPS origins before building and syncing. Ordinary simulator/development
  exports continue to use `pnpm build:ios:web`.
- The policy drafts and contact page now identify Jack Wakeham and provide
  `jackwakeham82@gmail.com` for support and privacy requests. The privacy draft
  describes actual import processors and the disabled native PostHog integration.
- ESLint ignores generated test reports so concurrent test cleanup cannot cause
  its directory scan to fail.

## Remaining release gates

| Gate                         | Current evidence                                                                         | Next action                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer membership         | Enrolment purchased; activation not checked here                                         | Confirm active membership and the intended team                                                                                                                         |
| Production build environment | Local key is a test key                                                                  | Supply existing production Clerk key, Convex client/site origins and `NEXT_PUBLIC_SITE_URL` to the release build                                                        |
| Convex deployment identity   | URLs configured locally, production identity not established                             | Verify the release URLs against the V2 production dashboard; the release guard cannot infer deployment ownership from a hostname                                        |
| Bundle and signing identity  | `com.foodedo.app`, extension `com.foodedo.app.RecipeShare`; team `2UFQ4ZW67L` in project | Verify registered identifiers and paid team, then archive with distribution signing                                                                                     |
| App Group                    | Both entitlements use `group.com.foodedo.app.imports`                                    | Register/assign the group to both identifiers and validate share capture on a device                                                                                    |
| Associated domains           | App includes both Foodedo hosts; AASA names the current team and bundle                  | Verify production hosting, actual App ID prefix and device invitation handling; configure Clerk's production associated domain if required by the tested integration    |
| Production authentication    | Clerk prebuilt account controls and native OAuth adapter exist                           | Verify Clerk native registration, allowed origin, mobile SSO callback, provider credentials and all device return paths                                                 |
| Equivalent login option      | Providers are configured remotely, not established by this source audit                  | If Google is enabled on iOS, configure and test Sign in with Apple or establish an applicable Guideline 4.8 exception                                                   |
| In-app deletion              | Manage account opens Clerk's profile; backend webhook handler exists                     | Confirm Clerk allows user deletion, find the deletion control inside the iPhone app, and test the full production webhook path with a dedicated account                 |
| Privacy policy / Terms       | Still explicitly drafts                                                                  | Finalise lawful bases (including allergy information), processor contracts/locations, backup/provider retention and terms; publish verified documents before submission |
| Privacy manifests            | Capacitor and Cordova manifests included in unsigned archive                             | Generate/review Xcode's privacy report for the final signed archive; App Privacy declarations still require actual service configuration                                |
| Physical-device QA           | Compilation is separate from device testing                                              | Complete the matrix below using the production release candidate                                                                                                        |
| Store artwork and listing    | Brand assets exist; listing draft below                                                  | Capture final native screenshots for accepted iPhone and 13-inch iPad sizes; complete category/age/territory questions in App Store Connect                             |
| Review access                | No review credentials created                                                            | Create a dedicated account and put credentials only in App Store Connect                                                                                                |
| Monitoring and support       | Web analytics exist; native PostHog is disabled                                          | Verify support delivery and TestFlight crash collection; establish how launch sign-in/import failures will be detected                                                  |

## Verification evidence — 9 November 2026

- Formatting, ESLint and TypeScript checks pass.
- Unit tests: **384 passed**. Convex/rendering tests: **445 passed**.
- Brand asset verification: **11 assets checked**.
- Swift share-inbox checks pass, covering restart, ownership, acknowledgement,
  capacity, expiry, concurrent writes and corruption preservation. macOS file
  coordination required running this check outside the filesystem sandbox.
- Both Next.js build modes pass. Native export checks confirm editorial pages,
  contact forms and server-only public recipe routes are excluded. Web build
  checks confirm public pages, recipe rendering and deployment traces.
- Xcode 26.6 compiles both native targets into an **unsigned Release archive**.
  This is a development-service compilation artifact, not a signed production
  candidate or an upload-ready build.
- Running `pnpm build:ios:release` with the current local environment correctly
  fails before export/sync because the Clerk key is a test key.
- Focused browser acceptance: **14 passed**, covering contact submission/recovery,
  Help layout/context at mobile and desktop sizes, and native import continuation
  cancellation/retry. The permission test mounts the real continuation component,
  verifies no import mutation after cancellation, verifies the source remains in
  IndexedDB, then grants fresh permission and verifies exactly one import starts.
- The full browser run recorded **207 passes and 7 failures**. Four contact
  failures came from a broad field selector also matching the new support region;
  the corrected tests pass in the focused rerun. Three separate expectations
  remain unresolved:
  - `app-shell.spec.ts` assumes the live baked-chicken casserole supports serving
    scaling. Current catalogue content displays authored quantities and no
    serving-change button, so the Cook Mode test cannot start its scaling step.
  - `organic-discovery.spec.ts` expects a worked-example link in
    `/blog/how-to-build-shopping-list-from-meal-plan`; it was absent in the served
    article.
  - `public-pages.spec.ts` invokes the URL inventory audit, which expects 200 for
    multiple articles now permanently redirected by `config/blog-redirects.ts`.

Reconcile those catalogue/editorial expectations before marking the full web
regression gate green. They are separate from the passing launch-focused checks.
Physical-device sign-in, signed capabilities, final privacy declarations and
TestFlight installation remain unverified.

## Build and rollout procedure

1. Release the changed `users.deleteFromClerk` handler to the **existing V2
   production Convex deployment** through the established production process.
   No schema migration or generated API change is needed. Do not use a
   development deployment or V1 backend. This audit does not deploy it.
2. Supply production public build variables through the release environment.
   Next.js embeds `NEXT_PUBLIC_*` values at build time; an existing web deployment
   does not configure a local native build automatically. Do not copy private
   Clerk, Convex, Apple or provider credentials into public variables.
3. Run `pnpm build:ios:release`. It builds the static export and syncs that exact
   export into the iOS project. Its origin checks do not establish that Convex is
   the correct production deployment; verify that separately.
4. Open `pnpm cap:open:ios`. Confirm the paid team and capabilities for **both**
   targets. Archive Release for a generic iOS device with distribution signing,
   validate it, and upload through Xcode Organizer.
5. Install that uploaded build through TestFlight, complete device QA, then
   submit with **manual release** selected. Store approval should not publish
   before the launch owner is ready.
6. Increment the build number on both targets for each subsequent upload.
   Preserve compatibility with the previous native version when updating the
   shared web/backend services: installed apps retain their bundled client code.

An unsigned compile can be repeated without claiming signing or upload readiness:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/foodedo-ios-derived \
  -archivePath /tmp/foodedo-ios-readiness.xcarchive \
  -clonedSourcePackagesDirPath /tmp/foodedo-ios-packages \
  CODE_SIGNING_ALLOWED=NO archive
```

## Device acceptance matrix

Use a current small iPhone, a large iPhone, the oldest supported OS/device
available, and an iPad because the current app targets both device families.

- Fresh install → guest → generate a week → swap a dinner → Keep → email login →
  the exact reviewed plan persists → Shopping → relaunch.
- Returning account: production email and every enabled social provider; cancel
  and deny consent, wrong account, sign out, expired session and interrupted
  network. Authentication must return automatically from the system sheet.
- In-app account settings → delete a dedicated account → confirm webhook delivery
  and removal of owned plans, recipes, lists, allergy profiles and import jobs.
  Confirm retained shared content follows the policy and another account is
  unaffected. Do not use a real customer's account.
- Direct text/URL import and share from Safari/social apps: approve permission,
  cancel permission, retry, sign in after capture, switch accounts with a pending
  capture, recover an unfinished import, and background during processing.
- Household invitation from a message/browser; join and edit the shared list on
  two devices, then return to Private.
- Cook Mode: timers, screen awake/release, background/foreground and interruption.
- Small screens, iPad rotation, keyboard, safe areas, VoiceOver, enlarged text,
  Reduce Motion and loss of connectivity. Bundled screens should launch without
  the web hosting origin; live catalogue/account data still requires connectivity.

## Store listing draft

Keyword candidates below are positioning ideas, not validated search-volume or
ranking claims. Finalise for the first storefront after keyword research.

- **Name:** Foodedo: Meal Planner
- **Subtitle:** Dinner ideas. Shopping sorted.
- **Keywords:** weekly,cooking,recipes,grocery,list,family,organiser,menu,food,save
- **Support URL:** `https://www.foodedo.com/support/contact`
- **Privacy URL:** `https://www.foodedo.com/privacy` (after policy review)
- **Marketing URL:** `https://www.foodedo.com/`
- **Contact:** Jack Wakeham — `jackwakeham82@gmail.com`
- **Category candidate:** Food & Drink. Complete Apple's age-rating questionnaire
  against shipped features rather than assuming a rating.

Description draft:

> Spend less time deciding what to eat.
>
> Foodedo helps you choose dinners, organise your week and turn your plan into a
> useful shopping list.
>
> Start with dinner suggestions, swap meals to suit your week, and keep the
> recipes you want to cook again. Bring recipe links or pasted recipes into your
> own collection, then review and edit the result.
>
> Planning with someone else? Share a household plan and shopping list while
> keeping your private space separate.
>
> Try the meal catalogue and dinner planning without an account. Sign in when
> you want to keep your plan, save recipes or share a household. Foodedo is
> currently free.
>
> Recipe information and imports can contain mistakes. Always check ingredients,
> allergens and cooking instructions for your needs.

Screenshot sequence, captured from the final iOS build with sanitised data:

1. **Dinner, decided.** Home showing the next useful dinner.
2. **Your week, sorted.** A varied plan with clear dates and servings.
3. **A shopping list that follows your plan.** Grouped ingredients and checks.
4. **Keep recipes worth cooking again.** Saved/imported recipes; show actual
   import functionality without promising every site or video is supported.

Reviewer notes draft:

> Foodedo helps users choose dinners, keep meal plans and shop from linked lists.
> Guests can browse the standard catalogue and try planning. Saving plans,
> personal recipes and household features requires an account.
>
> Use the supplied dedicated review account for personal features. Account
> settings are in the profile menu under Manage account. Help is available from
> the guest header or the signed-in profile menu and contains support and privacy
> links.
>
> On iOS, social sign-in uses the system authentication sheet and returns to the
> app automatically. Recipe imports request permission before processing with
> OpenAI through Vercel AI Gateway and, for social acquisition, Apify. Import
> results can be edited. The share extension accepts recipe links from other apps.
>
> The app is currently free and has no in-app purchases or subscriptions.

Verify every statement in the TestFlight candidate before using these notes.
Never commit review credentials or customer data.

## Privacy evidence to complete in App Store Connect

| Implementation                     | Data to assess                                                                     | Verified boundary / outstanding check                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk                              | Email, name, account identifier, auth/security information                         | Production options, deletion setting, logs and provider retention need dashboard verification                                                   |
| Convex                             | Saved recipes, plans/lists, preferences, household membership and allergy profiles | Linked to account; allergy information needs specific health/sensitive-data assessment; backups/regions and retained shared records need review |
| Recipe processing                  | Recipe links, pasted content, captions and retrieved source text                   | Vercel AI Gateway/OpenAI; Apify for social sources; per-request iOS permission added; provider contracts/retention not established by code      |
| Native capture inbox               | Shared link/text and claiming account identifier                                   | Local App Group file, seven-day expiry on access; no anonymous backend user                                                                     |
| PostHog                            | Website usage, account identifier and campaign attribution                         | Disabled for packaged iOS; web is optional/configured separately with opt-out; hosted pages opened from iOS can still have web analytics        |
| Contact / Formspree                | Name, email, message and optional account-ID hint                                  | Hosted contact form; support email fallback is published; inbox/provider retention needs review                                                 |
| Hosting and service infrastructure | Technical/security logs such as IP and request information                         | Verify actual retention, processors and transfer arrangements                                                                                   |

Do not select “Data Not Collected” for an app that persists personal account
content. Do not assume a privacy manifest substitutes for the store's privacy
answers or the public policy.

Sources checked for this preparation:

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
  — privacy, account deletion, login services and minimum functionality.
- [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/).
- [Review access](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review).
- [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/).
- [Current SDK minimum](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).
- [Clerk account options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options).
