import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    userId: v.id("users"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    handle: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("creators")
      .withIndex("by_userId_platform_handle", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform).eq("handle", args.handle)
      )
      .first();

    if (existing) {
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, { isActive: true, displayName: args.displayName });
        return existing._id;
      }
      throw new Error("Creator already exists");
    }

    return await ctx.db.insert("creators", {
      userId: args.userId,
      platform: args.platform,
      handle: args.handle,
      displayName: args.displayName,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const creators = await ctx.db
      .query("creators")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const activeCreators = creators.filter((c) => c.isActive);

    const creatorsWithCounts = await Promise.all(
      activeCreators.map(async (creator) => {
        const videos = await ctx.db
          .query("videos")
          .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
          .collect();
        return {
          ...creator,
          videoCount: videos.length,
        };
      })
    );

    return creatorsWithCounts;
  },
});

export const get = query({
  args: { id: v.id("creators") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("creators") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isActive: false });
  },
});

export const hardDelete = mutation({
  args: { id: v.id("creators") },
  handler: async (ctx, args) => {
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_creatorId", (q) => q.eq("creatorId", args.id))
      .collect();

    for (const video of videos) {
      const transcripts = await ctx.db
        .query("transcripts")
        .withIndex("by_videoId", (q) => q.eq("videoId", video._id))
        .collect();
      for (const transcript of transcripts) {
        await ctx.db.delete(transcript._id);
      }
      await ctx.db.delete(video._id);
    }

    await ctx.db.delete(args.id);
  },
});
