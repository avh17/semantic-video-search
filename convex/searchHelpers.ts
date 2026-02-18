import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

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
