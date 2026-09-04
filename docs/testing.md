# Testing

## Strategy

E2E-first, minimal unit tests, CI enforcement, bug-driven tests.

The primary safety net is Playwright against real jobs: Decide, Plan, Capture, Shop, Cook. Unit and integration tests cover deterministic, UI-independent domain logic only (future scoring, import transforms, shopping-list merge) in `src/lib/domain`.

When a bug is found, add a regression test at the cheapest correct layer: domain unit test if the logic is pure; E2E if the job broke in the UI.

## Now

Pure recipe-domain tests run without a browser or web server:

```bash
pnpm test:unit
```

They cover deterministic domain risks that are easy to regress without a browser: lossless ingredient quantity text, stable line IDs, protein-category validation, catalogue ID/slug uniqueness, version-scoped catalogue lookup, guest-plan construction/claim reconciliation, meal-plan selection, and shopping-list grouping. Keep the suite small. Do not assert catalogue size, release version numbers, or other content that changes as meals are added.

Playwright is installed with a Chromium production smoke suite in `tests/e2e/app-shell.spec.ts`. It verifies:

- the app shell renders and exposes its primary navigation
- catalogue links open real recipe routes
- a guest receives seven dated meals, can swap or shuffle them, and reload without losing the temporary plan
- the web manifest is linked and contains the required app identity and icons
- every declared icon is served as PNG

Do not assert transient headings, marketing copy, or visual composition merely because they are currently on screen. Add an E2E assertion when it proves a durable route or user job; add a unit test only when deterministic domain behaviour would otherwise be easy to regress.

CI (`.github/workflows/ci.yml`) runs formatting, linting, typechecking, unit tests, the iOS static-export build, the regular Vercel web build, and the Chromium smoke suite on push/PR.

Local setup:

```bash
pnpm test:e2e:install
pnpm build
pnpm test:e2e
```

The Playwright web server runs `next start`, so the regular production build must exist first.

CI must define `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL` as GitHub Actions repository variables. These values are public client configuration, not secrets. A missing value fails the relevant Next.js build before tests run.

## Upcoming

- Manually verify Keep/save prompts resume automatically after email and Google sign-in on web and iOS without discarding local intent.
- Add an authenticated integration harness for current-plan hydration, IndexedDB cleanup after acknowledgement, idempotent claim retry, occupied-date conflict, and cross-user isolation without storing real Clerk credentials in tests.
- Cover plan hydration with a deliberately unavailable recipe reference so corrupted historical data cannot crash the app shell.
- Unauthenticated clients cannot read or mutate personal Convex data.
- Clerk sign-in yields a Convex-authenticated session and the user webhook creates exactly one indexed user document.
- Clerk profile updates and deletion update/delete the matching Convex user document.
- Clerk sign-out clears the Convex-authenticated state in web and Capacitor iOS builds.
- The iOS scene uses `BridgeViewController`; the `ClerkOAuth` plugin is available and every social provider opens an `ASWebAuthenticationSession` rather than stopping at a spinner.
- Grow tests with each job slice, not with implementation details.
- Add WebKit coverage when native/WebKit-specific behavior exists.

## Out of scope for the foundation

Component snapshot forests, Testing Library for the placeholder page, and native UI automation before native behavior exists. Third-party Clerk UI is verified manually in the integration proof rather than automated with stored production credentials.
