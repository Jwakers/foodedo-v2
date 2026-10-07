# Recipes and ingredients

Recipes are the durable food unit used by Decide, Plan, Shop, Cook, and Remember. The first implementation must preserve useful information without turning recipe capture into taxonomy maintenance.

## Content boundaries

- A `CatalogueMeal` is versioned Foodedo product content available equally to guests and accounts. Its stable internal ID is separate from its unique, human-readable catalogue URL slug.
- A `Recipe` is a private, mutable snapshot owned by an authenticated account.
- Plans may create a private snapshot for referential integrity without presenting it as explicitly saved.
- Saving catalogue content creates or reuses a personal recipe, records `savedAt`, and preserves its source. Plans and history reference the personal recipe, so later catalogue changes cannot silently alter them.
- **Save recipe** is the only initial library action. Favouriting is a separate preference signal and remains deferred until it serves recommendations or another proven job.
- The authenticated planning candidate pool prefers eligible recipes in **My recipes**—regardless of whether they were created manually or saved from shared content—before using standard catalogue meals as fallback. Later scoring may add favourites, cooking history, recency, context, and explicit preferences without changing plan storage.
- Future public publishing is a separate concern. Do not represent it with a nullable owner or an `isPublic` flag on a personal recipe.

## Catalogue lifecycle

The standard catalogue is public, non-personal Convex content. Each stable meal identity has independently versioned `catalogueMeals` rows with `staging`, `published`, or `retired` status and a typed Convex storage image ID. Exactly one revision per meal may be published. Published rows form the current catalogue; retired rows remain readable so guest drafts and explicit save requests can resolve the exact meal revisions they pinned. This supports frequent one-at-a-time publishing without cloning the rest of the catalogue.

Shared detail and Cook routes are static client shells at `/recipes/view?slug=…` and `/recipes/cook?slug=…`. They resolve content from Convex after hydration, so the Capacitor bundle does not embed catalogue data. Next.js generates the web sitemap at build time from the currently published meal revisions; scheduled rebuilds may refresh it after catalogue changes. Pretty web-only routes and per-recipe server metadata remain deferred. See [technical-spec.md](../../docs/technical-spec.md) and [ADR 0002](../decisions/0002-nextjs-web-capacitor-runtime.md).

Generation must create a candidate, not publish directly. A future workflow validates and reviews the candidate before publishing an immutable catalogue revision. Guests can read published standard revisions without authentication; premium delivery remains a separate, server-entitled concern. Saving still resolves the trusted published revision on the server and creates a personal snapshot, so the client contract and provenance model can remain stable when storage moves.

## Ingredient lines

The authored line remains the source of truth. Keep a stable line ID, ingredient name, human-readable quantity, optional unit, and optional note. The note currently preserves preparation and qualifiers such as “finely chopped”, “drained”, or “at room temperature”; this information has not been discarded. Preserve expressions such as “1 × 400g tin” or “to taste”; structured interpretation must not destroy the original meaning.

Do not require a separate structured `preparation` field until Cook or Shop needs to distinguish preparation reliably from other qualifiers. Imported qualifiers remain in the preserved note. If a stronger need appears, add optional enrichment or split the preserved note through a migration; do not make recipe entry harder or lose the original wording in anticipation.

A canonical ingredient catalogue may be introduced when Shop or allergy assistance proves the need. Resolution must be optional enrichment: unresolved lines remain valid, and arbitrary user input must never create global taxonomy records automatically.

Shopping aggregation should group confident canonical matches but add quantities only when units are compatible or a safe conversion exists. Otherwise show the related quantities together rather than inventing precision.

Canonical and inferred allergen data can support warnings and filtering, but cannot guarantee that a user-authored recipe is allergen-free. Ambiguous or unresolved lines must remain visible as such.

## MVP selection metadata

The approved Swap Meal flow needs a small set of recipe selection facets. Time and approximate cost may be unknown; **protein category is required on every recipe**. These are selection metadata, not a general recipe taxonomy.

```ts
type ProteinCategory =
  "chicken" | "beef" | "pork" | "lamb" | "fish" | "meat-free" | "other";

type RecipeSelectionMetadata = {
  proteinCategory: ProteinCategory;
  prepMinutes?: number;
  cookMinutes?: number;
  costBand?: "budget" | "standard" | "premium";
};
```

- **Time:** display and compare the sum of the trustworthy time components that are present. A recipe may legitimately supply only preparation or cooking time; zero is valid when explicitly stated. If neither component is known, the total is unknown and does not satisfy an active time constraint.
- **Protein choice:** `proteinCategory` is required on every catalogue meal and every personal recipe. Allowed values are `chicken`, `beef`, `pork`, `lamb`, `fish`, `meat-free`, and `other`. It names the primary consumer-facing protein choice used by the approved filter—not every ingredient in the dish and not a nutritional claim. Prefer one clear primary (for example a chicken and vegetable traybake is `chicken`). Use `fish` for fish and seafood mains. Use `meat-free` when the primary protein is not animal flesh (beans, lentils, tofu, eggs, cheese, vegetable-forward mains). `other` keeps game and unfamiliar primaries honest instead of forcing them into an incorrect category.
- **Approximate cost:** `costBand` is optional for MVP and remains one of `budget`, `standard`, or `premium`. Keep this simple three-band model for now rather than a finer 0–10 index; revisit only if editorial banding proves too coarse. For the MVP catalogue it is assigned and reviewed editorially. The product does not expose a currency amount or imply live supermarket pricing.

The approved **Budget friendly** filter matches the `budget` band. **Lowest cost first** orders known bands from budget to premium and retains the normal recommendation rank within a band. Recipes with unknown cost remain valid but are excluded by a cost filter and ordered after known bands when the user explicitly requests cost ordering.

Filtering and sorting must share these fields and unknown-value rules for time and cost. Protein filtering assumes every recipe has a category. Add deterministic tests for time boundaries, each protein option, cost-band ordering, ties, and unknown time/cost metadata.

A later regional cost estimator may replace the editorial band when Foodedo has structured quantities, safe unit conversion, region/currency context, a maintained price source, and sufficient catalogue coverage. That estimator must preserve the same selection contract and label any displayed monetary value as an estimate.

Editorial descriptions visible in Plan Review—such as **Comfort food**, **Fresh and filling**, **Easygoing**, and **Light and bright**—remain flavour copy. Do not treat them as categories until a controlled vocabulary, authoring rules, and a concrete recommendation or filtering use have been approved.

## Cook Mode enrichment

Cook Mode is an MVP view of recipe content. The approved design requires two explicit enrichments:

- an optional `preheat` value for a reliably authored oven temperature; and
- zero or more stable timer cues on a method step, each with an ID, concise label, and duration in seconds.

```ts
type RecipePreheat = {
  appliance: "oven";
  temperatureC: number;
};

type RecipeTimerCue = {
  id: string;
  label: string;
  durationSeconds: number;
};
```

For the initial contract, preheat is oven-specific and stores a Celsius temperature. Show **Before you start — Preheat oven to …** only when that explicit value exists. Do not infer preheating merely because a later step contains a cooking temperature.

Timer cues are authored recipe content. Starting one creates local Cook-session state that can persist while the user moves to later steps or opens Ingredients. Cook progress, preparation checks, and timers are not recipe mutations or backend entities. Automatic extraction of timer cues from imported prose is later enrichment.

Every Cook surface must consume the same serving-scaled ingredient model. Mise en place, contextual **You'll need** quantities, All Ingredients, and Shop must not calculate or hard-code divergent values. Human expressions such as `to taste`, packets, handfuls, and whole items require cooking-friendly rules rather than naive decimal multiplication.

## Method-step ingredient mapping follow-up

The Cook designs highlight ingredient words inside method instructions and surface the corresponding scaled lines beneath **You'll need**. Automatic mapping is intentionally post-MVP planned work because incorrect matches can undermine trust and cooking safety.

The target contract should:

1. map each method step to stable ingredient-line IDs rather than copying quantities into the step;
2. render quantities through the same serving-scaled ingredient model used everywhere else;
3. distinguish reviewed explicit links from inferred candidates;
4. normalise case and punctuation and support reviewed aliases such as `clove of garlic` → `garlic` without relying on raw substring matching;
5. avoid false matches inside unrelated words and handle repeated ingredients, ingredient sections, optional lines, and steps that mention no ingredient;
6. preserve the original instruction text and apply presentation highlights by character ranges or reviewed references without rewriting the recipe; and
7. provide deterministic tests and, for automated imports, a review path for ambiguous or low-confidence matches.

Until this feature is implemented, Cook Mode may show the full scaled ingredient reference and authored steps without pretending that contextual ingredient detection is available. Do not hard-code per-screen quantities to reproduce the design.

## Provenance and publishing

Recipe provenance is a small discriminated value. The implemented variants are `manual`, `catalogue`, and private `import`; public publication remains a separate future feature. Import provenance records the capture method, import time, canonical source URL, trustworthy site/author attribution when available, the normalisation version, and a content fingerprint.

## Recipe import

Authenticated users can capture recipes from a public HTTP(S) URL or pasted text. `beginImport` creates an idempotent private `recipeImports` job and schedules a Convex Node action; the client observes that job rather than holding the work open in a Next.js request. This keeps the shared route compatible with the Capacitor static export and lets imports survive navigation and reload.

Every URL and pasted-text source receives AI normalization followed by independent AI verification. Source preparation preserves whole, bounded readable-page and JSON-LD evidence blocks with stable IDs and an explicit truncation flag; JSON-LD is evidence, never a bypass. A tagged internal measurement contract represents exact values, ranges, package counts/sizes, qualitative amounts and unknown amounts. One deterministic formatter prefers published metric equivalents, converts weight-only lb/oz to grams, keeps cups and spoons, and writes the existing durable quantity/unit/amount fields. Shared quantities produce separate ingredient lines. Source references, measurement-aware checks, note references and recipe bounds are validated locally; the verifier checks omissions, quantity scope, alternatives and the full selected primary method. One complete repair is allowed, with at most two extraction and two verification calls under the job deadline. There is no deterministic recipe parser, specialist routing or source-shaped fallback. Save only a validated AI result; distinguish no recipe, incomplete source, transport/provider failure and exhausted validation. Existing private jobs, provenance, atomic persistence, non-blocking image work and missing-metadata review remain. Safe diagnostic areas, reasons and affected evidence IDs support failure investigation without retaining model responses. Existing recipes and plans are not rewritten. See [AI recipe import](../../docs/recipe-import.md).

Imported ingredients retain bounded `sourceText` plus a normalised `amountText`, intact local ingredient `name`, optional preparation note, group, and note references. Steps retain their source expression and note references; recipe-card notes are first-class recipe content. Detail, Cook, and Shop consume the same representation. `servingScaling` is `safe` only when every scale-relevant amount is trustworthy; otherwise the recipe stays `source_only` and opens at its authored servings. Partial scaling is forbidden. Owner corrections set `contentEditedAt` and expose preserved source expressions only in the edit surface.

Title, ingredients, steps, and `proteinCategory` form the usable core. Unfamiliar proteins use `other`, so optional classification work cannot veto an otherwise complete structured recipe. The recipe and successful job transition are committed atomically as soon as that core validates. Missing servings or the absence of both preparation and cooking time after whole-recipe reasoning produces derived review issues; one useful time value is sufficient, and explicit zero-minute no-cook/no-prep time is complete. Detail quietly labels derived and estimated metadata, and an owner correction removes that field's inference label. Review is therefore not a second mutable status. The narrow repair mutation lets the owner add servings and whichever time information they know.

URL fetching rejects credentials, non-HTTP protocols, and private or reserved address ranges, and revalidates every redirect. A request-local Undici dispatcher validates the exact DNS address passed to the socket, closing the validate-then-connect rebinding gap without changing global fetch behaviour. Response time and size are bounded. Source HTML is never persisted or rendered. Image work ranks at most three candidates and tries them asynchronously; each download repeats network validation, sniffs JPEG/PNG/WebP bytes, reads real dimensions, and is attached only while the recipe content fingerprint still matches. Rejected or stale blobs are deleted, a successful replacement deletes the previous blob afterwards, and image failure never blocks a usable recipe.

Completed jobs clear pasted source text and expire after a short retention period. Attempt numbers prevent stale actions and watchdogs from overwriting a retry. Telemetry contains timings, role/model usage, fallback state, extractor path, and typed outcomes only—never recipe content, HTML, pasted text, or full source URLs.

Future public content should use publisher profiles and immutable publication revisions. Following, liking, and saving are separate relationships. Saving a published revision creates an attributed personal snapshot; personal edits never mutate the publisher's recipe. Rights, moderation, takedown, feeds, and update notifications are later product work.

## Home “Ideas for your week”

The guest Home strip is a horizontal carousel of six catalogue meals plus **Browse recipes**. Cards are wider than a three-across grid so titles can breathe; titles still clamp to three lines with an ellipsis when needed. Selection is deliberately naive for now: it returns the first meals by catalogue `position` so the approved layout can ship without inventing a recommendation surface. The Paper frame still shows a static three-up row—update the design to match this carousel when convenient.

**Post-MVP follow-up:** replace that placeholder ranking with real intelligence—preferences, cooking history, plan context, variety, and any later favourites signal—without changing the Home composition or the catalogue contract. Do not treat the current first-six order as product intent.

## Foundation scope

Foundation already implemented:

- Recipe domain types and bounded validation.
- Private authenticated recipe persistence and owner indexes.
- Manual provenance plus the versioned `CatalogueMeal` contract.
- Create, read, and paginated-list operations that derive ownership from verified auth.
- Public database-backed, independently versioned catalogue meals and storage-backed images rendered equally for guests and accounts.
- An authenticated, retry-safe save that resolves trusted catalogue content on the server, creates or reuses a private snapshot, and explicitly adds it to the user's library.
- Guest Home “Ideas for your week” carousel using temporary first-six catalogue selection (smarter ranking deferred post-MVP).
- Authenticated URL/text recipe import with resumable jobs, AI normalization, independent semantic verification, bounded whole-recipe repair, derived review, and personal detail/Cook routes.

MVP additions still required by the approved designs:

- the narrow selection metadata above (required protein category; optional time and cost band);
- an optional explicit oven-preheat value;
- authored method-step timer cues;
- one canonical serving-scaling path shared by Cook and Shop; and
- the approved Cook Mode interface.

Defer canonical ingredients, automated method-step ingredient mapping, dietary/allergen profiles, automatic timer extraction, a calculated regional cost estimator, photo/camera/share-sheet capture, general recipe editing, publishing, social relationships, and feeds until their product slices need them.
