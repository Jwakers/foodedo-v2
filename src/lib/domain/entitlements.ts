/** Product allowances, not subscription or billing state. All existing accounts are free. */
export const tierPolicies = {
  free: {
    features: { recipeImport: true },
    limits: {
      savedImportedRecipes: 10,
      importAttemptsPerMonth: 20,
      simultaneousImports: 2,
    },
  },
  // Reserved policy; no client can grant this tier and no paid offer is enabled.
  premium: {
    features: { recipeImport: true },
    limits: {
      savedImportedRecipes: 100,
      importAttemptsPerMonth: 100,
      simultaneousImports: 5,
    },
  },
} as const;
export type AccountTier = keyof typeof tierPolicies;
export type AccountFeature =
  keyof (typeof tierPolicies)[AccountTier]["features"];

export function importAllowanceWindow(now: number) {
  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { start, end };
}
