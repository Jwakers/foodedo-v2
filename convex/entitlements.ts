import { mutation } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { accountEntitlements, entitlementValidator } from "./lib/entitlements";

/** Server-clock snapshot for UI hints; feature enforcement stays in backend writes. */
export const current = mutation({
  args: {},
  returns: entitlementValidator,
  handler: async (ctx) =>
    accountEntitlements(ctx, await requireUserId(ctx), Date.now()),
});
