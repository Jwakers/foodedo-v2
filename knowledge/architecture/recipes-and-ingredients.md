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

The current versioned code bundle is a deliberate foundation-stage delivery choice, not the intended permanent authoring system. Its 23 lightweight meals exist to exercise catalogue and planning behavior. Move standard catalogue content to public, non-personal Convex reads before adding generation, catalogue administration, frequent independent releases, or enough content that bundling becomes costly.

Generation must create a candidate, not publish directly. A future workflow validates and reviews the candidate before publishing an immutable catalogue revision. Guests can read published standard revisions without authentication; premium delivery remains a separate, server-entitled concern. Saving still resolves the trusted published revision on the server and creates a personal snapshot, so the client contract and provenance model can remain stable when storage moves.

## Ingredient lines

The authored line remains the source of truth. Keep a stable line ID, ingredient name, human-readable quantity, optional unit, and optional note. The note currently preserves preparation and qualifiers such as “finely chopped”, “drained”, or “at room temperature”; this information has not been discarded. Preserve expressions such as “1 × 400g tin” or “to taste”; structured interpretation must not destroy the original meaning.

Do not require a separate structured `preparation` field until Capture, import, Cook, or Shop needs to distinguish preparation reliably from other qualifiers. If that need appears, add optional enrichment or split the preserved note through a migration; do not make recipe entry harder or lose the original wording in anticipation.

A canonical ingredient catalogue may be introduced when Shop or allergy assistance proves the need. Resolution must be optional enrichment: unresolved lines remain valid, and arbitrary user input must never create global taxonomy records automatically.

Shopping aggregation should group confident canonical matches but add quantities only when units are compatible or a safe conversion exists. Otherwise show the related quantities together rather than inventing precision.

Canonical and inferred allergen data can support warnings and filtering, but cannot guarantee that a user-authored recipe is allergen-free. Ambiguous or unresolved lines must remain visible as such.

## MVP selection metadata

The approved Swap Meal flow needs three small, optional recipe facets. They are selection metadata, not a general recipe taxonomy.

```ts
type RecipeSelectionMetadata = {
  proteinCategory?: "chicken" | "beef" | "fish" | "meat-free";
  costBand?: "budget" | "standard" | "premium";
};
```

- **Time:** derive one total from `prepMinutes + cookMinutes`. Filtering, display, quick refinements, and sorting must use the same calculation. An unknown time does not match an active time constraint.
- **Protein choice:** `proteinCategory` is one of `chicken`, `beef`, `fish`, or `meat-free`. It expresses the primary consumer-facing choice used by the approved filter, not every ingredient in the dish and not a nutritional claim.
- **Approximate cost:** `costBand` is `budget`, `standard`, or `premium`. For the MVP catalogue it is assigned and reviewed editorially. The product does not expose a currency amount or imply live supermarket pricing.

The approved **Budget friendly** filter matches the `budget` band. **Lowest cost first** orders known bands from budget to premium and retains the normal recommendation rank within a band. Recipes with unknown cost remain valid but are excluded by a cost filter and ordered after known bands when the user explicitly requests cost ordering.

Filtering and sorting must share these fields and unknown-value rules. Add deterministic tests for time boundaries, each protein option, cost-band ordering, ties, and unknown metadata.

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

Recipe provenance is a small discriminated value. The initial variants are `manual` and `catalogue`; import and publication variants arrive with those features.

Future public content should use publisher profiles and immutable publication revisions. Following, liking, and saving are separate relationships. Saving a published revision creates an attributed personal snapshot; personal edits never mutate the publisher's recipe. Rights, moderation, takedown, feeds, and update notifications are later product work.

## Foundation scope

Foundation already implemented:

- Recipe domain types and bounded validation.
- Private authenticated recipe persistence and owner indexes.
- Manual provenance plus the versioned `CatalogueMeal` contract.
- Create, read, and paginated-list operations that derive ownership from verified auth.
- A small versioned catalogue rendered equally for guests and accounts.
- An authenticated, retry-safe save that resolves trusted catalogue content on the server, creates or reuses a private snapshot, and explicitly adds it to the user's library.

MVP additions still required by the approved designs:

- the narrow time, protein-choice, and approximate-cost selection metadata above;
- an optional explicit oven-preheat value;
- authored method-step timer cues;
- one canonical serving-scaling path shared by Cook and Shop; and
- the approved Cook Mode interface.

Defer canonical ingredients, automated method-step ingredient mapping, dietary/allergen profiles, automatic timer extraction, a calculated regional cost estimator, import, images, editing, search, publishing, social relationships, and feeds until their product slices need them.
