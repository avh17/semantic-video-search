import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";

export const getSearchResultData = internalQuery({
  args: { transcriptId: v.id("transcripts") },
  handler: async (ctx, args) => {
    const transcript = await ctx.db.get(args.transcriptId);
    if (!transcript) return null;

    const video = await ctx.db.get(transcript.videoId);
    if (!video) return null;

    const creator = await ctx.db.get(video.creatorId);

    return {
      transcript: {
        firstTwoSentences: transcript.firstTwoSentences,
        fullText: transcript.fullText,
      },
      video: {
        _id: video._id,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        platform: video.platform,
        caption: video.caption,
        processingStatus: video.processingStatus,
      },
      creator: creator
        ? {
            handle: creator.handle,
            platform: creator.platform,
            displayName: creator.displayName,
          }
        : null,
    };
  },
});

export const getRecentVideos = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    const enriched = await Promise.all(
      videos.map(async (video) => {
        const creator = await ctx.db.get(video.creatorId);
        const transcript = await ctx.db
          .query("transcripts")
          .withIndex("by_videoId", (q) => q.eq("videoId", video._id))
          .first();
        return {
          ...video,
          creator: creator
            ? { handle: creator.handle, platform: creator.platform, displayName: creator.displayName }
            : null,
          transcript: transcript
            ? { firstTwoSentences: transcript.firstTwoSentences, fullText: transcript.fullText }
            : null,
        };
      })
    );

    return enriched;
  },
});
