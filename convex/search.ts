"use node";

import { v } from "convex/values";
import { action, query } from "./_generated/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _internal: any;
async function getInternal() {
  if (!_internal) {
    _internal = (await import("./_generated/api")).internal;
  }
  return _internal;
}

export const searchVideos = action({
  args: {
    userId: v.id("users"),
    queryText: v.string(),
    openaiApiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, queryText, openaiApiKey } = args;
    const internal = await getInternal();

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: queryText,
    });

    const queryEmbedding = embeddingRes.data[0].embedding;

    const results = await ctx.vectorSearch("transcripts", "by_embedding", {
      vector: queryEmbedding,
      limit: 20,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filter: (q: any) => q.eq("userId", userId),
    });

    const enrichedResults = await Promise.all(
      results.map(async (result: { _id: string; _score: number }) => {
        const data = await ctx.runQuery(
          internal.searchHelpers.getSearchResultData,
          { transcriptId: result._id }
        );
        if (!data) return null;
        return {
          score: result._score,
          ...(data as Record<string, unknown>),
        };
      })
    );

    return enrichedResults.filter(Boolean);
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
