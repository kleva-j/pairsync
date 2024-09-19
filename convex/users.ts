import { internalMutation } from "./_generated/server";

// USER MUTATIONS
export const create = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) throw new Error("Mutation called without Authenticated user!");

    // Check if user is already stored
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existingUser !== null) return existingUser._id;

    const userId = await ctx.db.insert("users", {
      name: identity.name!,
      email: identity.email!,
      tokenIdentifier: identity.tokenIdentifier,
    });

    return userId;
  },
});
