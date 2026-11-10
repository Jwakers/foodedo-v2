# iOS authentication and recipe-import review — 10 November 2026

Scope: the uncommitted native Clerk adapter, Keychain bridge, OAuth diagnostics,
recipe-fetching fixes, dependency changes, tests and launch documentation. No
V1 code, data model or identity provider was changed.

## Findings resolved

- **P1 — Dependency advisories.** The production dependency audit reported 32
  advisories, including six critical entries. Updated Next.js and its ESLint
  configuration to 16.4.1; Capacitor core/iOS/CLI to 8.5.1; Undici to 8.12.2;
  and Zod to 4.6.6. Major-specific overrides select patched transitive Undici
  7.30.1 and source-map-js 1.2.2. Clerk's tested version pins remain intact.
  The production dependency audit now reports zero known advisories.
  Relevant references include the [Capacitor app-origin advisory](https://github.com/advisories/GHSA-rvm3-566m-v7fv),
  [Undici TLS-options advisory](https://github.com/advisories/GHSA-2m5v-pch6-74hx)
  and [Next.js image-optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw).
- **P1 — IPv6 literal SSRF gap.** WHATWG URL hostnames retain IPv6 brackets,
  whereas `net.isIP` expects the unbracketed address. Literal addresses also
  bypass socket DNS lookup. Normalize brackets before the direct-address check;
  regressions reject loopback, mapped loopback, private, link-local and reserved
  IPv6 destinations before any fetch. Existing socket-level DNS validation and
  Early Hints handling remain intact.
- **P2 — Floating native sign-in UI.** The official UI loader selected the latest
  major-1 CDN script despite the pinned ClerkJS/shared packages. Explicitly pin
  UI 1.42.4, matching the installed SDK's expected UI version. New bootstrap
  tests cover initialization sharing, secure-store failures, UI failure/retry,
  missing plugins and token persistence wiring.
- **P2 — Callback diagnostic data.** A snake-case format check still accepted
  arbitrary query values shaped like codes. Use a fixed allowlist; unknown and
  ambiguous values become `unspecified`, without logging callback credentials.
- **Documentation.** Reconciled the launch checklist with the confirmed native
  sign-in checks, signed TestFlight installation and successful Delish import.
  Historical audit evidence remains labelled by date.

## Verification

- Lint, application/backend TypeScript and changed-file formatting pass.
- Unit tests: **388 passed**. Backend/rendering tests: **473 passed**.
- Production web build passes, including deployment-trace verification.
- Production iOS static export and Capacitor sync pass. The patched SwiftPM
  dependency is pinned to Capacitor 8.5.1; an unsigned native Release archive
  compiles successfully. Share-inbox lifecycle checks pass.
- Browser suite using the development authentication environment: **211 passed,
  three pre-existing failures**. These are the previously recorded live-catalogue
  serving-control assumption in Cook Mode, missing worked-example editorial
  link, and legacy URL inventory expecting 200 for intentionally redirected
  articles. They are not newly passing gates; see the historical launch audit.
- Development backend sync passes on Foodedo V2 `bold-walrus-818`.
- Changed-file credential-pattern scan found no matching private-key material.

## Release follow-up

These review fixes are uncommitted. The last tested production Delish import
already saved successfully; the IPv6 hardening and dependency updates from this
review still need the normal backend/web release. The Capacitor security update
and UI pin require a fresh native build, TestFlight upload and sign-in/share
smoke test. The currently installed TestFlight binary cannot receive native SDK
updates through a backend deployment. Co-op's publisher verification block,
extended device checks and existing App Store submission gates remain open.
