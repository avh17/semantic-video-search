import { query } from "./_generated/server";

// Check for duplicate transcripts
export const findDuplicateTranscripts = query({
  handler: async (ctx) => {
    const transcripts = await ctx.db.query("transcripts").collect();
    const videoIdCount = new Map<string, number>();

    for (const transcript of transcripts) {
      const count = videoIdCount.get(transcript.videoId) || 0;
      videoIdCount.set(transcript.videoId, count + 1);
    }

    const duplicates = Array.from(videoIdCount.entries())
      .filter(([_, count]) => count > 1)
      .map(([videoId, count]) => ({ videoId, count }));

    return {
      totalTranscripts: transcripts.length,
      uniqueVideos: videoIdCount.size,
      duplicates,
    };
  },
});

// Debug query to view all transcription data
export const getAllTranscripts = query({
  handler: async (ctx) => {
    const transcripts = await ctx.db.query("transcripts").collect();

    const enriched = await Promise.all(
      transcripts.map(async (transcript) => {
        const video = await ctx.db.get(transcript.videoId);
        const user = await ctx.db.get(transcript.userId);

        let creator = null;
        if (video?.creatorId) {
          creator = await ctx.db.get(video.creatorId);
        }

        return {
          transcript: {
            id: transcript._id,
            fullText: transcript.fullText,
            firstTwoSentences: transcript.firstTwoSentences,
            languageDetected: transcript.languageDetected,
            confidenceScore: transcript.confidenceScore,
            createdAt: new Date(transcript.createdAt).toISOString(),
          },
          video: video ? {
            videoUrl: video.videoUrl,
            platform: video.platform,
            caption: video.caption,
            processingStatus: video.processingStatus,
          } : null,
          creator: creator ? {
            handle: creator.handle,
            displayName: creator.displayName,
            platform: creator.platform,
          } : null,
          user: user ? {
            email: user.email,
            name: user.name,
          } : null,
        };
      })
    );

    return enriched;
  },
});

export const getVideoStats = query({
  handler: async (ctx) => {
    const videos = await ctx.db.query("videos").collect();
    const transcripts = await ctx.db.query("transcripts").collect();

    const stats = {
      totalVideos: videos.length,
      byStatus: {
        pending: videos.filter(v => v.processingStatus === "pending").length,
        processing: videos.filter(v => v.processingStatus === "processing").length,
        completed: videos.filter(v => v.processingStatus === "completed").length,
        failed: videos.filter(v => v.processingStatus === "failed").length,
      },
      totalTranscripts: transcripts.length,
      videosByPlatform: {
        instagram: videos.filter(v => v.platform === "instagram").length,
        tiktok: videos.filter(v => v.platform === "tiktok").length,
      },
    };

    return stats;
  },
});

export const getAllVideos = query({
  handler: async (ctx) => {
    const videos = await ctx.db.query("videos").collect();

    const enriched = await Promise.all(
      videos.map(async (video) => {
        const creator = await ctx.db.get(video.creatorId);
        const transcript = await ctx.db
          .query("transcripts")
          .withIndex("by_videoId", (q) => q.eq("videoId", video._id))
          .first();

        return {
          id: video._id,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl,
          processingStatus: video.processingStatus,
          errorMessage: video.errorMessage,
          createdAt: new Date(video.createdAt).toISOString(),
          creator: creator
            ? {
                handle: creator.handle,
                displayName: creator.displayName,
                platform: creator.platform,
              }
            : null,
          hasTranscript: Boolean(transcript),
          transcriptPreview: transcript?.firstTwoSentences ?? null,
        };
      })
    );

    return enriched.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});
