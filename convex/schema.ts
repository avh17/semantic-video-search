import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  creators: defineTable({
    userId: v.id("users"),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    handle: v.string(),
    displayName: v.string(),
    profileUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_platform_handle", ["userId", "platform", "handle"]),

  videos: defineTable({
    creatorId: v.id("creators"),
    userId: v.id("users"),
    platformVideoId: v.optional(v.string()),
    platform: v.union(v.literal("instagram"), v.literal("tiktok")),
    videoUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
    caption: v.optional(v.string()),
    postedAt: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    processingStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_creatorId", ["creatorId"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  transcripts: defineTable({
    videoId: v.id("videos"),
    userId: v.id("users"),
    fullText: v.string(),
    firstTwoSentences: v.string(),
    embedding: v.optional(v.array(v.float64())),
    confidenceScore: v.optional(v.float64()),
    languageDetected: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_videoId", ["videoId"])
    .index("by_userId", ["userId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),
});
