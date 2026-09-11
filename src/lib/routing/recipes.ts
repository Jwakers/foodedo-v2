/**
 * Recipe App Router path helpers — keep shell chrome and feature links
 * aligned on one contract as routes grow beyond `/recipes/[slug]`.
 */

export function recipeDetailPath(slug: string): string {
  return `/recipes/${slug}`;
}

export function isRecipesSectionPath(pathname: string): boolean {
  return pathname === "/recipes" || pathname.startsWith("/recipes/");
}

/** True for any path under `/recipes/…` (not the listing index). */
export function isRecipeDetailPath(pathname: string): boolean {
  return pathname.startsWith("/recipes/") && pathname !== "/recipes";
}

/**
 * First segment after `/recipes/`, URL-decoded.
 * Returns null when the path is not a recipe detail path or the segment is empty.
 */
export function parseRecipeDetailSlug(pathname: string): string | null {
  if (!isRecipeDetailPath(pathname)) return null;

  const segment = pathname
    .slice("/recipes/".length)
    .split("/")
    .filter(Boolean)[0];

  if (!segment) return null;

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
