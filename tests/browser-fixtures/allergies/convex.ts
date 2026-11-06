import { getFunctionName, type FunctionReference } from "convex/server";
import { catalogue } from "./catalogue";
import { counts, read, update, useFixture } from "./state";
export function useQuery(ref: FunctionReference<"query">, args: unknown) {
  const state = useFixture();
  if (args === "skip") return undefined;
  if (getFunctionName(ref) === "allergies:getCurrent") return state.profile;
  if (getFunctionName(ref) === "catalogue:getCurrent") return catalogue;
  throw new Error(`Unexpected query: ${getFunctionName(ref)}`);
}
export function useMutation(ref: FunctionReference<"mutation">) {
  return async (args: {
    allergenIds: string[];
    shareWithHousehold: boolean;
    expectedRevision: number;
  }) => {
    if (getFunctionName(ref) !== "allergies:save")
      throw new Error("Unexpected mutation");
    counts.writes++;
    if (read().fail) throw new Error("Offline");
    update({
      profile: {
        ...args,
        effectiveIds: args.allergenIds,
        revision: args.expectedRevision + 1,
      },
    });
  };
}
