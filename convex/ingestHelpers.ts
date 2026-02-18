import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const createTranscript = internalMutation({
  args: {
    videoId: v.id("videos"),
    userId: v.id("users"),
    fullText: v.string(),
    firstTwoSentences: v.string(),
    embedding: v.array(v.float64()),
    confidenceScore: v.optional(v.float64()),
    languageDetected: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("transcripts", {
      videoId: args.videoId,
      userId: args.userId,
      fullText: args.fullText,
      firstTwoSentences: args.firstTwoSentences,
      embedding: args.embedding,
      confidenceScore: args.confidenceScore,
      languageDetected: args.languageDetected,
      createdAt: Date.now(),
    });
  },
});

export const updateVideoStatus = internalMutation({
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
