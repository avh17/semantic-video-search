import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

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

export const removeDuplicateVideos = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    // Group videos by URL
    const urlMap = new Map<string, typeof videos>();
    for (const video of videos) {
      const existing = urlMap.get(video.videoUrl) || [];
      existing.push(video);
      urlMap.set(video.videoUrl, existing);
    }

    let deletedCount = 0;
    const duplicateUrls: string[] = [];

    // For each URL with duplicates, keep the most recent completed one and delete others
    for (const [url, duplicates] of urlMap.entries()) {
      if (duplicates.length <= 1) continue;

      duplicateUrls.push(url);

      // Sort by: completed status first, then by createdAt descending (keep newest completed)
      duplicates.sort((a, b) => {
        if (a.processingStatus === "completed" && b.processingStatus !== "completed") return -1;
        if (a.processingStatus !== "completed" && b.processingStatus === "completed") return 1;
        return b.createdAt - a.createdAt;
      });

      // Delete all but the first (best) one
      for (let i = 1; i < duplicates.length; i++) {
        const video = duplicates[i];

        // Delete associated transcripts first
        const transcripts = await ctx.db
          .query("transcripts")
          .withIndex("by_videoId", (q) => q.eq("videoId", video._id))
          .collect();

        for (const transcript of transcripts) {
          await ctx.db.delete(transcript._id);
        }

        // Delete the video
        await ctx.db.delete(video._id);
        deletedCount++;
      }
    }

    return {
      deletedCount,
      duplicateUrls,
      message: `Removed ${deletedCount} duplicate video(s) from ${duplicateUrls.length} unique URL(s)`
    };
  },
});
