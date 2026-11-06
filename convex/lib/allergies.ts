import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireUserId } from "./auth";
import { type SpaceId } from "./spaces";
import { validAllergyIds } from "../../src/lib/domain/allergies";

export async function allergyProfile(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
) {
  return ctx.db
    .query("allergyProfiles")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}
/** Caller must authorise the space before reading member profiles. */
export async function effectiveAllergies(
  ctx: QueryCtx | MutationCtx,
  spaceId: SpaceId,
) {
  const actorId = await requireUserId(ctx);
  const own = await allergyProfile(ctx, actorId);
  if (actorId === spaceId) return validAllergyIds(own?.allergenIds ?? []);
  const members = await ctx.db
    .query("householdMembers")
    .withIndex("by_household", (q) =>
      q.eq("householdId", spaceId as Id<"households">),
    )
    .collect();
  const profiles = await Promise.all(
    members.map((member) => allergyProfile(ctx, member.userId)),
  );
  // The planner's own allergies always apply. Partners contribute only when shared.
  return validAllergyIds([
    ...(own?.allergenIds ?? []),
    ...profiles.flatMap((profile) =>
      profile?.shareWithHousehold ? profile.allergenIds : [],
    ),
  ]);
}
