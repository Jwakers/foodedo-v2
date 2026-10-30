import { getFunctionName, type FunctionReference } from "convex/server";
import { recordPersonalQuery, recoverAccount, useFixture } from "./state";
export function useMutation() {
  return recoverAccount;
}
export function useConvexAuth() {
  const state = useFixture();
  return {
    isLoading: state.isLoading,
    isAuthenticated: state.isSignedIn && state.isAuthenticated,
  };
}
export function useQuery(ref: FunctionReference<"query">, args: unknown) {
  const state = useFixture();
  if (args === "skip") return undefined;
  if (getFunctionName(ref) === "users:current") return state.account;
  recordPersonalQuery();
  if (!state.account || state.account.authSubject !== state.userId)
    throw new Error("ACCOUNT_NOT_SYNCED");
  if (new URLSearchParams(location.search).get("scenario") === "home") {
    if (getFunctionName(ref) === "households:current") return state.household;
    if (getFunctionName(ref) === "mealPlans:getCurrent") return state.plan;
  }
  return {};
}
