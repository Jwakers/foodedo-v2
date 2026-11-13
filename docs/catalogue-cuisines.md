# Editorial cuisine influences

Cuisine tags support catalogue gap analysis and recipe generation. They have no consumer-facing UI and make no authenticity, dietary or allergy guarantees.

`src/lib/domain/cuisines.ts` owns the versioned vocabulary and shared policy. Use one influence normally; use multiple for meaningful fusion. Prefer a specific cuisine to its regional fallback, without counting both. A single ingredient, dish birthplace or protein substitution does not establish another cuisine. Use an empty array for reviewed uncertainty. German and Russian supplement the initial proposed vocabulary because the catalogue includes pork schnitzel and stroganoff.

## Catalogue review and generation

`catalogueCuisineMetadata` stores independently reviewed influences, rationale, reviewer, taxonomy version and the exact published meal ID/content fingerprint. These records permit cuisine-only classification without approving unrelated editorial tags or rewriting immutable recipes.

The generator reads current independent reviews first, including an explicitly empty array. Where no current independent review exists, it uses current reviewed general editorial tags. Stale fingerprints and taxonomy versions, and retired meal revisions, do not contribute independent cuisine tags. Statistics include every vocabulary category, including zero counts, and separate `cuisineClassified`/`cuisineUnclassified` meal counts. A fusion meal contributes once to each assigned cuisine. Counts represent influences, not mutually exclusive totals or generation quotas. Unknown classification is not evidence of absence.

Generation, revision and enrichment prompts share the policy; generated tag structured outputs use the vocabulary enum. Administrator tag writes normalise and validate it. Accepting editorial tags updates the independent cuisine review in the same transaction, so later corrections take effect in generator statistics. Publishing a recipe also records its accepted cuisines.

Maintenance drafts inherit current independent cuisines while keeping unreviewed general tags unapproved. Photo-only publication preserves the original cuisine review and its provenance; explicitly edited cuisines receive a new review on publication. Recipe changes receive a fresh cuisine classification through the existing editorial approval workflow.

## Imports

New imports infer optional `RecipeContent.cuisines` during their existing normalization/correction calls. These use the same vocabulary but remain inferred private-recipe metadata; they do not become reviewed catalogue coverage. Unknown labels are discarded during conversion, and uncertainty needs no extra model call. Old imports and private recipes are not backfilled.

The recipe editor does not expose cuisine inference. Cosmetic edits preserve it; changes to cooking content clear an omitted inference rather than silently retaining stale labels. Explicitly supplied cuisines are normalised and validated. None of this adds a consumer-facing cuisine control.

## Completed backfill

The V2 production backfill completed on 13 November 2026: all 146 then-published meals received a reviewed cuisine record, 141 had assigned influences and five remained explicitly unclassified. Verification confirmed that all original meal documents and all 127 pre-existing general editorial metadata records were unchanged. A 135-meal development apply/verify/rollback rehearsal restored all original data.

The unclassified dishes were Baked Chicken and Rice Casserole; One-Pan Lemon Herb Chicken Thighs with Potatoes and Carrots; Turkey and Spinach Traybake; Beef and Vegetable Traybake; and Pork and Sweet Potato Hash. Their general home-cooking preparations did not establish a defensible cuisine attribution.

The one-off migration endpoints, runner, tests, deployment-specific manifest, snapshots and temporary receipts were removed after verification. Reviewed assignments and their rationale remain in the database. Ongoing classification uses the normal administrator review/publication paths and the shared runtime helpers in `convex/lib/catalogueCuisines.ts`.
