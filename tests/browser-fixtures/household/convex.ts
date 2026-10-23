import { getFixtureIdentity } from "./auth";
import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
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
window.addEventListener("fixture:plan-change", change);
const meal = (shared: boolean) => ({
  id: shared ? "family-meal" : "private-meal",
  version: 1,
  slug: shared ? "family-meal" : "private-meal",
  position: 0,
  title: shared ? "Family tomato pasta" : "Private work-trip dinner",
  description: "A simple dinner",
  proteinCategory: "meat-free",
  servings: shared ? 4 : 1,
  prepMinutes: 5,
  cookMinutes: 15,
  ingredients: [
    {
      id: "i",
      name: "parsley",
      quantity: "1",
      shoppingCategory: "fruit_and_veg",
    },
  ],
  steps: [{ id: "s", text: "Cook dinner." }],
});
const plan = (shared: boolean) => ({
  _id: shared ? "shared-plan" : "private-plan",
  startDate: "2030-11-01",
  endDate: "2030-11-03",
  servings: shared
    ? Number(sessionStorage.getItem("fixture:servings") ?? 4)
    : 1,
  updatedAt: Number(sessionStorage.getItem("fixture:plan-revision") ?? 1),
  status: "active",
  hasActivePlanConflict: false,
  mealSlots: [
    {
      _id: shared ? "shared-slot" : "private-slot",
      slotId: shared ? "shared-slot" : "private-slot",
      date: "2030-11-01",
      recipeId: shared ? "shared-recipe" : "private-recipe",
      isAvailable: true,
      catalogueMealId: meal(shared).id,
      catalogueVersion: 1,
      catalogueMealSlug: shared ? meal(shared).slug : null,
      title: meal(shared).title,
      description: "A simple dinner",
      imageSrc: null,
      prepMinutes: 5,
      cookMinutes: 15,
      status: "planned",
    },
  ],
});
const makeItem = (shared: boolean) => ({
  _id: shared ? "shared-item" : "private-item",
  name: shared ? "Parsley" : "Cauliflower",
  displayName: shared ? "Parsley" : "Cauliflower",
  category: "fruit_and_veg",
  detailLines: [],
  sources: [
    {
      recipeId: shared ? "shared-recipe" : "private-recipe",
      recipeTitle: meal(shared).title,
      date: "2030-11-01",
      amount: "1 bunch",
    },
  ],
  origin: "derived",
  treatment: "required",
  included: true,
  checked: false,
  deletedAt: null as number | null,
  order: 0,
});
const sharedItem = makeItem(true),
  privateItem = makeItem(false);
const list = (shared: boolean) => ({
  _id: shared ? "shared-list" : "private-list",
  mealPlanId: plan(shared)._id,
  startDate: "2030-11-01",
  endDate: "2030-11-03",
  mealCount: 1,
  needsSync: false,
  items: [shared ? sharedItem : privateItem],
});
export function useQuery(
  reference: FunctionReference<"query">,
  args?: unknown,
) {
  useSyncExternalStore(subscribe, () => revision);
  if (args === "skip") return undefined;
  const data = args as
    | { householdId?: string; meals?: unknown[]; authSubject?: string }
    | undefined;
  const shared = !!data?.householdId;
  switch (getFunctionName(reference)) {
    case "onboarding:getState":
      return {
        retired: [
          ...new Set([
            ...(new URLSearchParams(location.search).get("plan") !== "empty"
              ? ["home"]
              : []),
            ...JSON.parse(
              sessionStorage.getItem(`fixture:retired:${data?.authSubject}`) ??
                "[]",
            ),
          ]),
        ],
        firstSavedPlanId:
          new URLSearchParams(location.search).get("introduction") === "first"
            ? "shared-plan"
            : undefined,
      };
    case "households:current":
      if (
        sessionStorage.getItem("fixture:join-journey") === "true" &&
        sessionStorage.getItem("fixture:joined") !== "true"
      )
        return null;
      if (new URLSearchParams(location.search).get("members") === "none")
        return null;
      if (new URLSearchParams(location.search).get("members") === "loading")
        return undefined;
      return {
        _id: "household-one",
        members: [
          { userId: "alice", name: "Alice" },
          ...(new URLSearchParams(location.search).get("members") === "solo"
            ? []
            : [{ userId: "bob", name: "Bob" }]),
        ],
      };
    case "households:previewInvite":
      return {
        status:
          new URLSearchParams(location.search).get("inviteStatus") ?? "ready",
        householdId: "household-one",
        inviterName: "Bob",
      };
    case "mealPlans:getCurrent":
      if (getFixtureIdentity() === "guest")
        throw new Error("An unauthenticated plan query must be skipped.");
      return new URLSearchParams(location.search).get("plan") === "empty"
        ? null
        : plan(shared);
    case "mealPlans:getCatalogueSelectionSignals":
      if (sessionStorage.getItem("fixture:selection-signals") === "enabled")
        return [
          {
            catalogueMealId: "family-meal",
            isSaved: true,
            savedByMemberKeys: ["member-0", "member-1"],
            dismissalCount: 0,
          },
        ];
      return [];
    case "catalogue:getCurrent":
      return { meals: [meal(true), meal(false)] };
    case "catalogue:getMeals":
      return [meal(true), meal(false)];
    case "catalogue:getMeal":
      return meal(true);
    case "planningPreferences:getCurrent":
      return null;
    case "shoppingLists:getCurrent":
      return {
        status: "ready",
        currentMealPlanId: plan(shared)._id,
        startDate: "2030-11-01",
        endDate: "2030-11-03",
        mealCount: 1,
        list: list(shared),
      };
    case "shoppingLists:getRecentSummaries":
      return [
        {
          _id: list(shared)._id,
          startDate: "2030-11-01",
          endDate: "2030-11-03",
          status: "active",
          itemCount: 1,
          checkedCount: 0,
          mealCount: 1,
          createdAt: 1,
        },
      ];
    default:
      return null;
  }
}
export function useMutation(reference: FunctionReference<"mutation">) {
  const mutate = async (args: Record<string, unknown>) => {
    const name = getFunctionName(reference);
    if (name === "onboarding:retire") {
      sessionStorage.setItem(
        "fixture:onboarding-syncs",
        String(
          Number(sessionStorage.getItem("fixture:onboarding-syncs") ?? 0) + 1,
        ),
      );
      if (sessionStorage.getItem("fixture:fail-onboarding-once") === "true") {
        sessionStorage.removeItem("fixture:fail-onboarding-once");
        throw new Error("Simulated unavailable connection");
      }
      const key = `fixture:retired:${args.authSubject}`;
      const previous = JSON.parse(
        sessionStorage.getItem(key) ?? "[]",
      ) as string[];
      sessionStorage.setItem(
        key,
        JSON.stringify([
          ...new Set([...previous, ...(args.introductions as string[])]),
        ]),
      );
      change();
      return null;
    }
    if (name === "households:acceptInvite") {
      sessionStorage.setItem("fixture:joined", "true");
      change();
      // Convex subscriptions can deliver membership (and remount the keyed
      // page) before the mutation promise resumes its navigation callback.
      await new Promise((resolve) => setTimeout(resolve, 0));
      return "household-one";
    }
    if (name === "households:invite")
      return {
        token: "a".repeat(64),
        expiresAt: 2_000_000_000_000,
        cancelled: false,
      };
    const item = args.itemId === sharedItem._id ? sharedItem : privateItem;
    if (name === "shoppingLists:setItemChecked")
      item.checked = Boolean(args.checked);
    if (name === "shoppingLists:removeItem") item.deletedAt = 1;
    if (name === "shoppingLists:restoreItem") item.deletedAt = null;
    change();
    return { status: "updated" };
  };
  mutate.withOptimisticUpdate = () => mutate;
  return mutate;
}
