import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

// Generate a short-lived upload URL for the client to POST a media file to Convex storage
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Delete a file from Convex storage (cleanup after transcription)
export const deleteStorageFile = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await ctx.storage.delete(args.storageId);
  },
});

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
