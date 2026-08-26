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

They cover bounded recipe/catalogue validation, stable line IDs, and preservation of flexible ingredient quantities. Keep this suite focused on platform-independent logic.

Playwright is installed with a Chromium production smoke suite in `tests/e2e/app-shell.spec.ts`. It verifies:

- the placeholder shell renders with its accessible heading and title
- the web manifest is linked and contains the required app identity and icons
- every declared icon is served as PNG
- the shell renders either the sign-in entry point or an honest configuration state without requiring CI secrets

CI (`.github/workflows/ci.yml`) runs formatting, linting, typechecking, unit tests, the iOS static-export build, the regular Vercel web build, and the Chromium smoke suite on push/PR.

Local setup:

```bash
pnpm test:e2e:install
pnpm build
pnpm test:e2e
```

The Playwright web server runs `next start`, so the regular production build must exist first.

## Upcoming

- Guest can reach a useful Decide result without authentication.
- Guest draft survives refresh locally but is clearly marked temporary.
- Keep/save prompts for authentication without discarding the draft.
- Claiming after sign-in is idempotent, survives retry, and never overwrites existing account data silently.
- Unauthenticated clients cannot read or mutate personal Convex data.
- Clerk sign-in yields a Convex-authenticated session and the user webhook creates exactly one indexed user document.
- Clerk profile updates and deletion update/delete the matching Convex user document.
- Clerk sign-out clears the Convex-authenticated state in web and Capacitor iOS builds.
- The iOS scene uses `BridgeViewController`; the `ClerkOAuth` plugin is available and every social provider opens an `ASWebAuthenticationSession` rather than stopping at a spinner.
- Grow tests with each job slice, not with implementation details.
- Add WebKit coverage when native/WebKit-specific behavior exists.

## Out of scope for the foundation

Component snapshot forests, Testing Library for the placeholder page, and native UI automation before native behavior exists. Third-party Clerk UI is verified manually in the integration proof rather than automated with stored production credentials.
