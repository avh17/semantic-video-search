import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const cleanupOldVideos = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const MAX_VIDEOS = 20;

    const videos = await ctx.db
      .query("videos")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    if (videos.length <= MAX_VIDEOS) return;

    const videosToDelete = videos.slice(MAX_VIDEOS);

    for (const video of videosToDelete) {
      // Delete associated transcripts
      const transcripts = await ctx.db
        .query("transcripts")
        .withIndex("by_videoId", (q) => q.eq("videoId", video._id))
        .collect();

      for (const transcript of transcripts) {
        await ctx.db.delete(transcript._id);
      }

      await ctx.db.delete(video._id);
    }
  },
});
