import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type SearchActionResult = {
  score: number;
  preview?: string;
  matchedTerms?: string[];
  transcript?: {
    firstTwoSentences?: string;
    fullText?: string;
  };
  video?: {
    _id?: Id<"videos">;
    videoUrl?: string;
    thumbnailUrl?: string;
  };
  creator?: {
    handle?: string;
    platform?: "instagram" | "tiktok";
  } | null;
};

/**
 * RAG endpoint: answer questions against stored video transcripts.
 * 1. Retrieve the strongest transcript matches.
 * 2. Build grounded context from those transcripts.
 * 3. Generate an answer with citations.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { question, creatorId } = await request.json();

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    if (creatorId && typeof creatorId !== "string") {
      return NextResponse.json({ error: "creatorId must be a string" }, { status: 400 });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Import OpenAI dynamically
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Step 1: Retrieve the strongest transcript matches.
    const searchAction = (await convex.action(api.search.searchVideos, {
      userId: userId as Id<"users">,
      creatorId: creatorId as Id<"creators"> | undefined,
      queryText: question,
      openaiApiKey,
    })) as SearchActionResult[];

    const RELEVANCE_THRESHOLD = 0.16;
    const relevantResults = searchAction.filter(
      (result) => result.score >= RELEVANCE_THRESHOLD
    );

    // Get top 5 most relevant transcripts
    const topResults = relevantResults.slice(0, 5);

    if (topResults.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find any relevant information in the transcribed videos for this question. The content you're asking about may not exist in your videos, or you may need to transcribe more videos first.",
        sources: [],
      });
    }

    // Step 2: Build context from retrieved transcripts.
    const context = topResults
      .map((result, index: number) => {
        const creator = result.creator?.handle || "Unknown";
        const transcript = result.transcript?.fullText || "";
        return `[Video ${index + 1} from @${creator}]:\n${transcript}`;
      })
      .join("\n\n---\n\n");

    // Step 3: Generate answer using GPT.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that answers questions based on video transcripts.
Use the provided transcripts to answer the user's question accurately and concisely.
If the transcripts don't contain relevant information, say so.
Always cite which video(s) you're referencing (e.g., "According to Video 1 from @username...").`,
        },
        {
          role: "user",
          content: `Context from video transcripts:\n\n${context}\n\n---\n\nQuestion: ${question}\n\nAnswer:`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = completion.choices[0].message.content || "No answer generated.";

    // Return answer with sources
    const sources = topResults.map((result) => ({
      videoId: result.video?._id,
      videoUrl: result.video?.videoUrl,
      thumbnailUrl: result.video?.thumbnailUrl,
      creator: result.creator?.handle,
      platform: result.creator?.platform,
      score: result.score,
      preview: result.preview || result.transcript?.firstTwoSentences,
      matchedTerms: result.matchedTerms || [],
    }));

    return NextResponse.json({
      answer,
      sources,
    });
  } catch (error) {
    console.error("Ask question error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process question" },
      { status: 500 }
    );
  }
}
