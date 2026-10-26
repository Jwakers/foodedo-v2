import type { OptimisticLocalStore } from "convex/browser";
import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { selectDiscoveryMeals } from "../../../src/lib/domain/recipe-discovery";
import { PROTEIN_CATEGORIES } from "../../../src/lib/domain/recipes";
import { getFixtureIdentity } from "../household/auth";

const listeners = new Set<() => void>();
let revision = 0;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const change = () => {
  revision++;
  listeners.forEach((fn) => fn());
};
export const meals = Array.from({ length: 18 }, (_, index) => ({
  id: `meal-${index}`,
  slug: `meal-${index}`,
  version: 1,
  position: index,
  title: `Dinner ${index}`,
  proteinCategory: PROTEIN_CATEGORIES[index % 8],
  prepMinutes: 5,
  cookMinutes: index % 2 ? 20 : 45,
  costBand: index % 2 ? ("budget" as const) : ("standard" as const),
}));
const savedIds = (): string[] =>
  JSON.parse(sessionStorage.getItem("fixture:saved") ?? '["meal-0"]');
export function fixturePlan(household: boolean) {
  const meal = meals[household ? 2 : 3]!;
  return {
    _id: household ? "shared-plan" : "private-plan",
    startDate: "2030-11-01",
    endDate: "2030-11-07",
    servings: 4,
    updatedAt: 1,
    status: "active",
    hasActivePlanConflict: false,
    mealSlots: [
      {
        _id: "slot",
        date: "2030-11-02",
        recipeId: "planned-recipe",
        isAvailable: true,
        catalogueMealId: meal.id,
        catalogueVersion: 1,
        catalogueMealSlug: meal.slug,
        title: meal.title,
        description: null,
        imageSrc: null,
        prepMinutes: 5,
        cookMinutes: 20,
        status: "planned",
      },
    ],
  };
}
export function useQuery(
  reference: FunctionReference<"query">,
  args?: unknown,
) {
  useSyncExternalStore(subscribe, () => revision);
  return queryResult(reference, args);
}

function queryResult(reference: FunctionReference<"query">, args?: unknown) {
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  const guest = getFixtureIdentity() === "guest";
  if (
    guest &&
    (name === "mealPlans:getCurrent" ||
      name === "recipes:listSavedCatalogueMeals")
  )
    throw new Error("Personal query was not skipped");
  switch (name) {
    case "households:current":
      return {
        _id: "household-one",
        members: [
          { userId: "alice", name: "Alice" },
          { userId: "bob", name: "Bob" },
        ],
      };
    case "catalogue:getDiscovery": {
      const request = args as {
        householdId?: string;
        day: string;
        localPlannedMealIds: string[];
      };
      const plannedMealIds =
        !guest && !new URLSearchParams(location.search).has("empty")
          ? fixturePlan(!!request.householdId).mealSlots.map(
              (slot) => slot.catalogueMealId,
            )
          : request.localPlannedMealIds;
      return selectDiscoveryMeals(meals, {
        savedMealIds: new Set(guest ? [] : savedIds()),
        plannedMealIds: new Set(plannedMealIds),
        day: request.day,
        viewerKey: guest ? "guest" : getFixtureIdentity(),
      });
    }
    case "catalogue:getCurrent":
      return { meals };
    case "catalogue:list":
      return {
        page: meals.filter(
          (meal) =>
            !(args as { savedOnly?: boolean })?.savedOnly ||
            savedIds().includes(meal.id),
        ),
        isDone: false,
        continueCursor: "more",
      };
    case "mealPlans:getCurrent":
      return new URLSearchParams(location.search).has("empty")
        ? null
        : fixturePlan(!!(args as { householdId?: string })?.householdId);
    case "recipes:listSavedCatalogueMeals":
      if (sessionStorage.getItem("fixture:saved-loading") === "true")
        return undefined;
      return optimisticSavedRecipes();
    default:
      return null;
  }
}
type SaveArgs = {
  catalogueMealId: string;
  catalogueVersion: number;
  saved: boolean;
};
type OptimisticUpdate = (store: OptimisticLocalStore, args: SaveArgs) => void;
const pending: { args: SaveArgs; update?: OptimisticUpdate }[] = [];
let mutationQueue = Promise.resolve();
function optimisticSavedRecipes() {
  let value = savedIds().map((id) => ({
    catalogueMealId: id,
    recipeId: `saved-${id}`,
  }));
  const store = {
    getQuery: () => value,
    setQuery: (_query: unknown, _args: unknown, next: typeof value) => {
      value = next;
    },
  } as unknown as OptimisticLocalStore;
  for (const layer of pending) layer.update?.(store, layer.args);
  return value;
}
export function useMutation(reference: FunctionReference<"mutation">) {
  function createMutation(update?: OptimisticUpdate) {
    const mutate = (args: SaveArgs) => {
      const layer = { args, update };
      pending.push(layer);
      sessionStorage.setItem("fixture:pending-saves", String(pending.length));
      change();
      const result = mutationQueue
        .then(async () => {
          if (getFixtureIdentity() === "guest")
            throw new Error("Guest personal write");
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Number(sessionStorage.getItem("fixture:save-delay") ?? 0),
            ),
          );
          if (sessionStorage.getItem("fixture:fail-save") === "true")
            throw new Error("Fixture save failure");
          if (getFunctionName(reference) !== "recipes:setCatalogueMealSaved")
            throw new Error("Unexpected mutation");
          const ids = new Set(savedIds());
          if (args.saved) ids.add(args.catalogueMealId);
          else ids.delete(args.catalogueMealId);
          sessionStorage.setItem("fixture:saved", JSON.stringify([...ids]));
          return null;
        })
        .finally(() => {
          pending.splice(pending.indexOf(layer), 1);
          sessionStorage.setItem(
            "fixture:pending-saves",
            String(pending.length),
          );
          change();
        });
      mutationQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };
    mutate.withOptimisticUpdate = createMutation;
    return mutate;
  }
  return createMutation();
}

const client = {
  async query(reference: FunctionReference<"query">, args: unknown) {
    const name = getFunctionName(reference);
    if (name === "catalogue:getDiscovery") {
      const count = Number(
        sessionStorage.getItem("fixture:discovery-requests") ?? 0,
      );
      sessionStorage.setItem("fixture:discovery-requests", String(count + 1));
      if (sessionStorage.getItem("fixture:fail-discovery") === "true")
        throw new Error("Fixture discovery failure");
    }
    const result = queryResult(reference, args);
    if (sessionStorage.getItem("fixture:delay-discovery") === "true")
      await new Promise((resolve) => setTimeout(resolve, 150));
    return result;
  },
};
export function useConvex() {
  return client;
}

export function usePaginatedQuery(
  reference: FunctionReference<"query">,
  args: unknown,
) {
  const result = useQuery(reference, args) as { page: unknown[] } | undefined;
  return { results: result?.page ?? [], status: "Exhausted", loadMore() {} };
}
