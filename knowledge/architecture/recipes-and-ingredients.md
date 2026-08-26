# Recipes and ingredients

Recipes are the durable food unit used by Decide, Plan, Shop, Cook, and Remember. The first implementation must preserve useful information without turning recipe capture into taxonomy maintenance.

## Content boundaries

- A `CatalogueMeal` is versioned Foodedo product content available equally to guests and accounts.
- A `Recipe` is a private, mutable snapshot owned by an authenticated account.
- Saving catalogue content creates or reuses a personal recipe with its source recorded. Plans and history reference the personal recipe, so later catalogue changes cannot silently alter them.
- Future public publishing is a separate concern. Do not represent it with a nullable owner or an `isPublic` flag on a personal recipe.

## Ingredient lines

The authored line remains the source of truth. Keep a stable line ID, ingredient name, human-readable quantity, optional unit, and optional note. Preserve expressions such as “1 × 400g tin” or “to taste”; structured interpretation must not destroy the original meaning.

A canonical ingredient catalogue may be introduced when Shop or allergy assistance proves the need. Resolution must be optional enrichment: unresolved lines remain valid, and arbitrary user input must never create global taxonomy records automatically.

Shopping aggregation should group confident canonical matches but add quantities only when units are compatible or a safe conversion exists. Otherwise show the related quantities together rather than inventing precision.

Canonical and inferred allergen data can support warnings and filtering, but cannot guarantee that a user-authored recipe is allergen-free. Ambiguous or unresolved lines must remain visible as such.

## Provenance and publishing

Recipe provenance is a small discriminated value. The initial variants are `manual` and `catalogue`; import and publication variants arrive with those features.

Future public content should use publisher profiles and immutable publication revisions. Following, liking, and saving are separate relationships. Saving a published revision creates an attributed personal snapshot; personal edits never mutate the publisher's recipe. Rights, moderation, takedown, feeds, and update notifications are later product work.

## Foundation scope

Implement now:

- Recipe domain types and bounded validation.
- Private authenticated recipe persistence and owner indexes.
- Manual provenance plus the versioned `CatalogueMeal` contract.
- Create, read, and paginated-list operations that derive ownership from verified auth.
- A small versioned catalogue rendered equally for guests and accounts.
- An authenticated, retry-safe save that resolves trusted catalogue content on the server and creates or reuses a private snapshot.

Defer canonical ingredients, unit conversion, allergens, import, images, editing, search, publishing, social relationships, and feeds until a product slice needs them.
