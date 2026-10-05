# V1 system recipe catalogue migration

This workflow moves only V1 production recipes whose `source` is `system` into
the V2 catalogue. It never exports or mutates V1 personal/imported recipes and
never imports a whole V1 database snapshot.

Generated snapshots, images, decisions, rollback data, and promotion bundles
live under `.catalogue-migration/`, which is intentionally ignored by Git.

## Safety model

- V1 is queried through its existing public paginated recipe and ingredient
  queries. No V1 mutation is called.
- The source baseline is locked to 113 system recipes and the checked-in V1
  seed baseline to 90 recipe titles. A count change blocks extraction for an
  explicit delta review.
- Catalogue clearing is scoped to `catalogueMeals`; personal recipes and their
  image references are inspected but never changed.
- Candidates remain `staging` until the decisions file is complete. Public
  catalogue queries cannot read staging rows.
- Production import requires an empty catalogue, starts in staging, validates
  every row and image, and publishes the complete ordered set transactionally.

## Commands

Run from the V2 repository. `FOODEDO_V1_PATH` may override the default sibling
V1 path, and `CATALOGUE_MIGRATION_DIR` may override the ignored working folder.

```sh
pnpm catalogue:migrate extract
pnpm catalogue:migrate stage-dev
pnpm catalogue:migrate stage-dev --fresh
pnpm catalogue:migrate apply-review
pnpm catalogue:migrate export-promotion
pnpm catalogue:migrate import-promotion
pnpm catalogue:migrate import-promotion --apply
pnpm catalogue:migrate restore-dev
```

Before any command that calls V2 migration functions, deploy the current V2
Convex functions to the intended deployment. Do not use `npx convex deploy`
from development.

`extract` creates:

- `source/candidates.json`: normalized candidates, flags, source IDs, image
  hashes, and inference evidence;
- `review.html`: a local visual review report;
- `decisions.json`: the required approval input.

`stage-dev` first creates `rollback-dev/`, then clears only the development
catalogue and uploads all candidates as staging. It is intentionally blocked
unless the development catalogue has the expected 30-row pre-migration state.
`stage-dev --fresh` instead requires an empty development catalogue and skips
the rollback and clear steps.

`apply-review` validates every decision and approval, applies corrections and
removals, audits the result, then publishes it. `export-promotion` exports the
actual published development rows and images; it does not reuse the original
V1 candidate payload.

`import-promotion` is a production dry-run. `--apply` is the separately explicit
write step and still refuses any non-empty production catalogue.

## Decisions contract

The decisions file is keyed by immutable V1 recipe ID. Flagged recipes require
an explicit `keep` or `remove`; unflagged recipes start as `keep`. Every inferred
cost band, preheat, and timer set requires a boolean approval. `false` removes
the inferred field unless a replacement is supplied in `overrides`.

Top-level fields:

- `reviewer`: required approver name;
- `approvedAt`: required ISO timestamp;
- `homeMealIds`: exactly six unique accepted V2 meal IDs in display order;
- `sourceSnapshotHash`: must continue to match the frozen extraction.

Per-recipe fields:

- `decision`: `keep` or `remove`;
- `approvals`: approval for every inference present on that candidate;
- `overrides`: a partial V2 recipe-content object; `null` removes an optional
  field and arrays replace the complete existing array;
- `imageFile`: for a missing or replaced image, a path relative to
  `.catalogue-migration/` (absolute paths are deliberately not accepted).

The current extraction identifies `Cottage Pie` as missing its V1 image. It
must either be removed or supplied with a supported JPEG, PNG, or WebP file
before publication.

## Evidence and rollback

The promotion manifest records the schema version, extraction hash, decisions
hash, recipe count, image hashes, and a semantic catalogue hash. After a
production apply, the deployment is re-exported and its semantic hash must
match the reviewed bundle.

`restore-dev` clears the current development catalogue and restores the
pre-migration rollback bundle. It does not roll back personal recipes or other
tables.
