import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";

type AuthContext = QueryCtx | MutationCtx;

export async function requireUserId(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Sign in to access personal Foodedo data.",
    });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();
  if (user === null) {
    throw new ConvexError({
      code: "ACCOUNT_NOT_SYNCED",
      message:
        "Your Foodedo account is still being prepared. Try again shortly.",
    });
  }

  return user._id;
}

export async function getCurrentUser(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();
}

export async function isAdministrator(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  return (
    identity !== null &&
    (process.env.FOODEDO_ADMIN_CLERK_USER_IDS ?? "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .includes(identity.subject)
  );
}

export async function requireAdministrator(ctx: AuthContext) {
  if (!(await isAdministrator(ctx))) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Administrator access required.",
    });
  }
  return (await ctx.auth.getUserIdentity())!.subject;
}
