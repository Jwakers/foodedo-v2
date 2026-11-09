# Skills

Use skills when the work matches them. Do not install extra skill packs on speculation.

## In this repo

| Skill           | Path                                      | When                                                                      |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| Frontend design | `.cursor/skills/frontend-design/SKILL.md` | Building real UI. Copied from V1 so V2 agents have it without opening V1. |

## Cursor / Vercel plugins (do not copy)

| Skill                                | When                                        |
| ------------------------------------ | ------------------------------------------- |
| Next.js (Vercel plugin)              | App Router, metadata, caching, routing      |
| React best practices (Vercel plugin) | After editing multiple TSX components       |
| routing-middleware                   | `proxy.ts` / request interception (Next 16) |

## Convex skills — installed

V2 already has its own Convex project, Clerk authentication and backend tests.
The 33 upstream skills are installed under `.agents/skills/convex*`, with matching
Claude copies under `.claude/skills/`. `skills-lock.json` records their source and
hashes; `convex/_generated/ai/ai-files.state.json` records the upstream revision.
Keep vendor files unchanged and put Foodedo-specific adaptations here so an
upstream refresh does not silently erase them.

Read `convex/_generated/ai/guidelines.md` before backend work, then select the
relevant skill. Check unfamiliar APIs against the installed package (currently
Convex 1.45.0), rather than treating every generic skill claim as a platform rule.

| Work                       | Skills                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------- |
| Backend code and contracts | `convex`, `convex-expert`, `convex-docs`, `convex-reviewer`                           |
| Authorization              | `convex-authz`, tracing the existing auth and space helpers                           |
| Behavioral verification    | `convex-test`, `convex-verify`, reusing `pnpm test:convex`                            |
| Architecture explanation   | `convex-explain-app`                                                                  |
| Deployment operations      | `convex-deploy-guard`, plus the specific operational skill                            |
| Other capabilities         | Only when the requested feature needs them; see the [review](convex-skills-review.md) |

### Foodedo-specific adaptations

- **Identity:** retain Clerk, `ConvexProviderWithClerk`, `auth.config.ts`, and
  `convex/lib/auth.ts`. Do not follow `convex-auth`'s default installation of
  `@convex-dev/auth`. With the single configured Clerk issuer, `identity.subject`
  intentionally matches Clerk webhook IDs in `users.authSubject`. Do not change
  it to `tokenIdentifier` without an identity migration and webhook plan.
- **Authorization:** reuse `requireUserId`, `requireAdministrator`,
  `requireSpace` and `canReadSpace`. Ownership is a Foodedo user or household ID,
  not a raw JWT subject. Trace these helpers before interpreting an authz scan:
  an absent inline `ctx.auth` is not evidence of missing authorization. Public
  standard-catalogue reads and invitation previews are intentional exceptions to
  the reviewer's blanket authentication rule. Personal writes still require auth.
- **Deployment:** use pnpm and the existing V2 target. For local verification,
  use `pnpm lint`, `pnpm typecheck` and `pnpm test:convex`. A skill's self-verify
  instruction is not authorization to provision, switch or push a deployment.
  When a development push is part of the task, classify and announce the target
  first, then use `pnpm exec convex dev` (optionally `--once`). Do not use
  `convex deploy` during development or fall back to anonymous provisioning.
- **AI:** recipe extraction and editorial generation are bounded structured-output
  jobs, not durable conversations. Preserve their existing AI SDK/Gateway,
  attempt/revision guards, approvals and model-call budgets. Evaluate agent,
  workflow or workpool components only for a demonstrated requirement; an LLM
  call alone does not require replacing these pipelines.
- **Data access:** judge the scanned index range and data-growth path. A database
  filter after `withIndex` scans that range, not automatically the entire table;
  JavaScript array filters do not scan the database. Prefer existing suitable
  indexes. Do not hide growth problems by silently truncating deletion,
  reconciliation or complete-catalogue results with `take(n)`.
- **Testing:** reuse `vitest.config.ts` and existing module maps. The current
  suite runs without `server.deps.inline`; do not add it merely because
  `convex-verify` calls it mandatory. Test owners, strangers, guests and household
  membership according to the actual feature contract.
- **Runtime:** keep Next.js web and Capacitor static-export compatibility. Do not
  replace Vercel hosting, add server-only auth to shared routes, or introduce
  Android/Expo integrations from a generic recommendation.
- **Operations:** discover actual tools and installed component exports before
  using them. This skill installation does not itself install the Convex MCP,
  recipe runner, findings schemas or helper scripts mentioned by some skills.
  Use ordinary source reviews and reports when those facilities are absent.
  Keep backups, migrations, paid features and monitoring installations within
  the requested scope. Transcript sharing remains explicit opt-in.

## Capacitor

No project-local skill file. Follow `docs/technical-spec.md` and ADR 0002. Sibling reference: `muay-thai-bag-trainer` (Capacitor 8, Vite — config patterns only).

## Accessibility

No extra pack. Follow `knowledge/ux/interaction-principles.md` (targets, keyboard, safe areas, reduced motion, semantics).
