"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

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

function buildEmbeddingInput(fullText: string, firstTwoSentences: string): string {
  const cleanedText = fullText.replace(/\s+/g, " ").trim();

  if (cleanedText.length <= 1800) {
    return cleanedText;
  }

  const start = cleanedText.slice(0, 600);
  const middleStart = Math.max(0, Math.floor(cleanedText.length / 2) - 300);
  const middle = cleanedText.slice(middleStart, middleStart + 600);
  const end = cleanedText.slice(-600);

  return [firstTwoSentences, start, middle, end]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2400);
}

export const processVideo = action({
  args: {
    videoId: v.id("videos"),
    userId: v.id("users"),
    videoUrl: v.string(),
    // Provide either audioUrl (public URL) or storageId (Convex storage)
    audioUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")), // uploaded by client; deleted after processing
    openaiApiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { videoId, userId, openaiApiKey } = args;
    const storageId = args.storageId;

    try {
      // Step 1: Mark as processing
      await ctx.runMutation(internal.ingestHelpers.updateVideoStatus, {
        id: videoId,
        processingStatus: "processing",
      });

      // Step 2: Resolve the media URL
      // If storageId is given, get the Convex storage URL; otherwise use audioUrl directly
      let resolvedUrl: string;
      if (storageId) {
        const url = await ctx.storage.getUrl(storageId);
        if (!url) throw new Error("Could not get storage URL for uploaded file");
        resolvedUrl = url;
      } else if (args.audioUrl) {
        resolvedUrl = args.audioUrl;
      } else {
        throw new Error("Either audioUrl or storageId must be provided");
      }

      // Step 3: Fetch the media file and send to Whisper
      const audioRes = await fetch(resolvedUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to fetch media file from URL: ${audioRes.status}`);
      }
      const audioBlob = await audioRes.blob();
      // Detect MIME type from response headers or URL extension
      const contentType = audioRes.headers.get("content-type") ?? "";
      let mimeType = "audio/mpeg";
      let fileName = "audio.mp3";
      if (
        contentType.includes("video/mp4") ||
        contentType.includes("video/") ||
        resolvedUrl.includes(".mp4")
      ) {
        mimeType = "video/mp4";
        fileName = "video.mp4";
      }
      const audioFile = new File([audioBlob], fileName, { type: mimeType });

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
        input: buildEmbeddingInput(fullText, firstTwoSentences),
      });

      const embedding = embeddingRes.data[0].embedding;

      // Step 6: Store transcript
      await ctx.runMutation(internal.ingestHelpers.createTranscript, {
        videoId,
        userId,
        fullText,
        firstTwoSentences,
        embedding,
      });

      // Step 7: Mark as completed
      await ctx.runMutation(internal.ingestHelpers.updateVideoStatus, {
        id: videoId,
        processingStatus: "completed",
      });

      // Step 8: Delete uploaded file from Convex storage (if applicable)
      if (storageId) {
        await ctx.runMutation(internal.ingestHelpers.deleteStorageFile, { storageId });
      }

      // Step 9: Cleanup old videos
      await ctx.runMutation(internal.cleanup.cleanupOldVideos, {
        userId,
      });
    } catch (error) {
      await ctx.runMutation(internal.ingestHelpers.updateVideoStatus, {
        id: videoId,
        processingStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      // Clean up storage even on failure
      if (storageId) {
        try {
          await ctx.runMutation(internal.ingestHelpers.deleteStorageFile, { storageId });
        } catch {
          // Best-effort cleanup
        }
      }
      throw error;
    }
  },
});
