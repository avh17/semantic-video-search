"use node";

import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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

function extractFirstTwoSentences(text: string): string {
  const sentenceRegex = /[^.!?]*[.!?]+/g;
  const sentences: string[] = [];
  let match;
  while ((match = sentenceRegex.exec(text)) !== null && sentences.length < 2) {
    sentences.push(match[0].trim());
  }
  if (sentences.length === 0) {
    return text.slice(0, 200);
  }
  return sentences.join(" ");
}

export const processVideo = action({
  args: {
    videoId: v.id("videos"),
    userId: v.id("users"),
    videoUrl: v.string(),
    appUrl: v.string(),
    openaiApiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { videoId, userId, videoUrl, appUrl, openaiApiKey } = args;

    try {
      // Step 1: Mark as processing
      await ctx.runMutation(internal.ingest.updateVideoStatus, {
        id: videoId,
        processingStatus: "processing",
      });

      // Step 2: Download audio via our API route
      const downloadRes = await fetch(`${appUrl}/api/download-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl }),
      });

      if (!downloadRes.ok) {
        const errorData = await downloadRes.json().catch(() => ({}));
        throw new Error(
          `Audio download failed: ${(errorData as { error?: string }).error || downloadRes.statusText}`
        );
      }

      const { audioUrl } = (await downloadRes.json()) as { audioUrl: string };

      // Step 3: Fetch the audio file and send to Whisper
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        throw new Error("Failed to fetch audio file from URL");
      }
      const audioBlob = await audioRes.blob();
      const audioFile = new File([audioBlob], "audio.mp3", { type: "audio/mpeg" });

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      });

      const fullText = transcription.text;
      if (!fullText || fullText.trim().length === 0) {
        throw new Error("Transcription returned empty text");
      }

      // Step 4: Extract first two sentences
      const firstTwoSentences = extractFirstTwoSentences(fullText);

      // Step 5: Generate embedding
      const embeddingRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: firstTwoSentences,
      });

      const embedding = embeddingRes.data[0].embedding;

      // Step 6: Store transcript
      await ctx.runMutation(internal.ingest.createTranscript, {
        videoId,
        userId,
        fullText,
        firstTwoSentences,
        embedding,
      });

      // Step 7: Mark as completed
      await ctx.runMutation(internal.ingest.updateVideoStatus, {
        id: videoId,
        processingStatus: "completed",
      });

      // Step 8: Cleanup old videos
      await ctx.runMutation(internal.cleanup.cleanupOldVideos, {
        userId,
      });
    } catch (error) {
      await ctx.runMutation(internal.ingest.updateVideoStatus, {
        id: videoId,
        processingStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});
