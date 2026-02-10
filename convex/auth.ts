import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { DEFAULT_STAGES } from "./schema";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [Google],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // Handle existing user
      if (args.existingUserId) {
        // Update user info if needed
        const existingUser = await ctx.db.get(args.existingUserId);
        if (existingUser && args.profile?.email) {
          await ctx.db.patch(args.existingUserId, {
            name: args.profile.name ?? existingUser.name,
            updatedAt: Date.now(),
          });
        }
        return args.existingUserId;
      }

      // New user flow
      const email = args.profile?.email;
      const name = args.profile?.name ?? "Unknown User";

      if (!email) {
        throw new Error("Email is required for registration");
      }

      // Check if user was invited (has pending invitation)
      const existingUserByEmail = await (ctx.db as any)
        .query("users")
        .withIndex("by_email", (q: any) => q.eq("email", email))
        .first();

      if (existingUserByEmail) {
        // User was invited - activate them
        await ctx.db.patch(existingUserByEmail._id, {
          name,
          isActive: true,
          updatedAt: Date.now(),
        });
        return existingUserByEmail._id;
      }

      // First-time user - create new tenant and user
      const now = Date.now();

      // Create tenant with default settings
      const tenantId = await ctx.db.insert("tenants", {
        name: `${name}'s Workspace`,
        settings: {
          opportunityStages: [...DEFAULT_STAGES],
          defaultCurrency: "USD",
          timezone: "UTC",
        },
        createdAt: now,
        updatedAt: now,
      });

      // Create user as admin of new tenant
      const userId = await ctx.db.insert("users", {
        tenantId,
        email,
        name,
        role: "admin",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      return userId;
    },
  },
});
