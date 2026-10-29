/** Stable IDs, independent of routes, copy and presentation. Add new IDs here. */
export const introductionIds = [
  "home",
  "recipes",
  "shopping",
  "recipe-save-confirmation",
] as const;
export type IntroductionId = (typeof introductionIds)[number];

/** Read the first implementation's fields without resetting existing users. */
export type IntroductionRetirementState = {
  retired?: readonly string[];
  homeRetired?: boolean;
  recipesRetired?: boolean;
  shoppingRetired?: boolean;
};
const legacyFields: Partial<
  Record<IntroductionId, "homeRetired" | "recipesRetired" | "shoppingRetired">
> = {
  home: "homeRetired",
  recipes: "recipesRetired",
  shopping: "shoppingRetired",
};

export function isIntroductionId(value: string): value is IntroductionId {
  return introductionIds.some((id) => id === value);
}

export function retiredIntroductionIds(
  state: IntroductionRetirementState | null | undefined,
): string[] {
  return [
    ...new Set([
      ...(state?.retired ?? []),
      ...introductionIds.filter((id) => {
        const field = legacyFields[id];
        return field !== undefined && state?.[field];
      }),
    ]),
  ].sort();
}

/** Preserve unknown IDs too, so an older client cannot erase future flags. */
export function mergeRetiredIntroductions(
  state: IntroductionRetirementState | null | undefined,
  additions: readonly IntroductionId[],
): string[] {
  return [...new Set([...retiredIntroductionIds(state), ...additions])].sort();
}
