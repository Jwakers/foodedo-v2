# Testing

## Strategy

E2E-first, minimal unit tests, CI enforcement, bug-driven tests.

The primary safety net is Playwright against real jobs: Decide, Plan, Capture, Shop, Cook. Unit and integration tests cover deterministic, UI-independent domain logic only (future scoring, import transforms, shopping-list merge) in `src/lib/domain`.

When a bug is found, add a regression test at the cheapest correct layer: domain unit test if the logic is pure; E2E if the job broke in the UI.

## Now

Playwright is installed with a Chromium production smoke suite in `tests/e2e/pwa.spec.ts`. It verifies:

- the placeholder shell renders with its accessible heading and title
- the web manifest is linked and contains the required app identity and icons
- every declared icon is served as PNG
- the production service worker registers and becomes active

CI (`.github/workflows/ci.yml`) runs formatting, linting, typechecking, the iOS static-export build, the regular Vercel/PWA build, and the Chromium smoke suite on push/PR.

Local setup:

```bash
pnpm test:e2e:install
pnpm build
pnpm test:e2e
```

The Playwright web server runs `next start`, so the regular production build must exist first.

## Upcoming

- Grow tests with each job slice, not with implementation details.
- Add WebKit coverage when native/WebKit-specific behavior exists.

## Out of scope for the foundation

Component snapshot forests, Testing Library for the placeholder page, Convex test harness (no Convex yet), and native UI automation before native behavior exists.
