/**
 * Recipe App Router path helpers — keep shell chrome and feature links
 * aligned on the shared static query-route contract.
 */

export type RecipeCatalogueReference = {
  catalogueMealId: string;
  catalogueVersion: number;
};

export function recipeDetailPath(
  slug: string,
  reference?: Partial<RecipeCatalogueReference>,
): string {
  const search = new URLSearchParams({ slug });
  appendCatalogueReference(search, reference);
  return `/recipes/view?${search.toString()}`;
}

export function recipeCookPath(
  slug: string,
  servings?: number,
  reference?: Partial<RecipeCatalogueReference>,
): string {
  const search = new URLSearchParams({ slug });
  if (servings !== undefined) search.set("servings", String(servings));
  appendCatalogueReference(search, reference);
  return `/recipes/cook?${search.toString()}`;
}

export function isCookPath(pathname: string): boolean {
  return pathname === "/recipes/cook";
}

export function isRecipesSectionPath(pathname: string): boolean {
  return pathname === "/recipes" || pathname.startsWith("/recipes/");
}

/** True for any path under `/recipes/…` (not the listing index). */
export function isRecipeDetailPath(pathname: string): boolean {
  return pathname === "/recipes/view" || pathname === "/recipes/cook";
}

/**
 * First segment after `/recipes/`, URL-decoded.
 * Returns null when the path is not a recipe detail path or the segment is empty.
 */
export function parseRecipeDetailSlug(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  if (!isRecipeDetailPath(pathname)) return null;
  const slug = searchParams.get("slug")?.trim();
  return slug ? slug : null;
}

export function parseRecipeCatalogueReference(
  searchParams: Pick<URLSearchParams, "get">,
): RecipeCatalogueReference | null {
  const catalogueMealId = searchParams.get("catalogueMealId")?.trim() || null;
  const catalogueVersion = Number(searchParams.get("catalogueVersion"));
  if (
    catalogueMealId === null ||
    !Number.isInteger(catalogueVersion) ||
    catalogueVersion < 1
  ) {
    return null;
  }
  return { catalogueMealId, catalogueVersion };
}

function appendCatalogueReference(
  search: URLSearchParams,
  reference?: Partial<RecipeCatalogueReference>,
) {
  if (
    reference?.catalogueMealId === undefined ||
    reference.catalogueVersion === undefined ||
    !Number.isInteger(reference.catalogueVersion) ||
    reference.catalogueVersion < 1
  ) {
    return;
  }
  search.set("catalogueMealId", reference.catalogueMealId);
  search.set("catalogueVersion", String(reference.catalogueVersion));
}
