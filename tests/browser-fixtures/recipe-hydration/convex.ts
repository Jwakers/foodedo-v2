import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { counts, getState, meal, update, useFixture } from "./state";

export function useConvexAuth() {
  const s = useFixture();
  return {
    isAuthenticated: s.isSignedIn && s.isAuthenticated,
    isLoading: s.isLoading,
  };
}
function requireAccount() {
  const s = getState();
  if (
    !s.isSignedIn ||
    !s.isAuthenticated ||
    !s.account ||
    s.account.authSubject !== s.userId
  )
    throw new Error("EARLY_PERSONAL_ACCESS");
}
export function useQuery(ref: FunctionReference<"query">, args: unknown) {
  const s = useFixture();
  if (args === "skip") return undefined;
  const name = getFunctionName(ref);
  if (name === "users:current") return s.account;
  if (name === "catalogue:getCurrentMealBySlug")
    return s.publicReady ? meal : undefined;
  if (name === "catalogue:getCurrent") return { meals: [meal] };
  if (name === "catalogue:getMeals") return [meal];
  requireAccount();
  counts.personalQueries.push(name);
  switch (name) {
    case "recipes:getMine":
      return s.personalReady
        ? {
            ...meal,
            _id: "private-recipe",
            reviewIssues: [],
            source: { type: "manual" },
          }
        : undefined;
    case "households:current":
      return s.household;
    case "mealPlans:getCurrent":
      return null;
    case "mealPlans:getCatalogueSelectionSignals":
      return [];
    case "planningPreferences:getCurrent":
      return null;
    case "recipes:listSavedCatalogueMeals":
      return s.savedReady
        ? s.saved.map((catalogueMealId) => ({ catalogueMealId }))
        : undefined;
    case "onboarding:getState":
      return { retired: [], firstSavedPlanId: undefined };
    case "recipeImports:notificationJobs":
      return [];
    case "catalogueAdmin:access":
      return { isAdmin: false };
    default:
      throw new Error(`Unmocked personal query ${name}`);
  }
}
const mutations = new Map<string, ReturnType<typeof mutation>>();
function mutation(name: string) {
  const fn = async (args: { catalogueMealId?: string; saved?: boolean }) => {
    counts.mutations.push(name);
    if (name === "users:ensureCurrent") {
      const s = getState();
      if (s.recovery === "deleted")
        throw new ConvexError({ code: "ACCOUNT_DELETED" });
      if (s.recovery === "fail") throw new Error("Provisioning unavailable");
      if (s.recovery === "pending") return new Promise(() => {});
      update({ account: { authSubject: s.userId! } });
      return;
    }
    requireAccount();
    if (name === "recipes:setCatalogueMealSaved") {
      update({ saved: args.saved ? [args.catalogueMealId!] : [] });
      return { showSavedConfirmation: false };
    }
    throw new Error(`Unmocked personal mutation ${name}`);
  };
  fn.withOptimisticUpdate = () => fn;
  return fn;
}
export function useMutation(ref: FunctionReference<"mutation">) {
  const name = getFunctionName(ref);
  if (!mutations.has(name)) mutations.set(name, mutation(name));
  return mutations.get(name)!;
}
