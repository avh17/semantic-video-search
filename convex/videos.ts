import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    creatorId: v.id("creators"),
    userId: v.id("users"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    videoUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("videos", {
      creatorId: args.creatorId,
      userId: args.userId,
      platform: args.platform,
      videoUrl: args.videoUrl,
      thumbnailUrl: args.thumbnailUrl,
      caption: args.caption,
      processingStatus: "pending",
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    return videos;
  },
});

export const listByCreator = query({
  args: { creatorId: v.id("creators") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("videos")
      .withIndex("by_creatorId", (q) => q.eq("creatorId", args.creatorId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("videos") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("videos"),
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      processingStatus: args.processingStatus,
      errorMessage: args.errorMessage,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("videos") },
  handler: async (ctx, args) => {
    const transcripts = await ctx.db
      .query("transcripts")
      .withIndex("by_videoId", (q) => q.eq("videoId", args.id))
      .collect();
    for (const transcript of transcripts) {
      await ctx.db.delete(transcript._id);
    }
    await ctx.db.delete(args.id);
  },
});

export const getStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const totalVideos = videos.length;
    const processingVideos = videos.filter(
      (v) => v.processingStatus === "pending" || v.processingStatus === "processing"
    ).length;

    return { totalVideos, processingVideos };
  },
});

export const findByUrl = query({
  args: {
    userId: v.id("users"),
    videoUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("videoUrl"), args.videoUrl))
      .first();

    return video;
  },
});
