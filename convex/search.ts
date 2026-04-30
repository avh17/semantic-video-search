"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

const STOP_WORDS = new Set(
  "a an and are as at be by for from how i in is it me my of on or our that the their them they this to was we what when where who why with you your"
    .split(" ")
);

type SearchCandidate = {
  transcriptId: Id<"transcripts">;
  transcript: { firstTwoSentences: string; fullText: string };
  video: {
    _id: Id<"videos">;
    videoUrl: string;
    thumbnailUrl?: string;
    platform: string;
    caption?: string;
    processingStatus: string;
  };
  creator: { handle: string; platform: string; displayName: string } | null;
};

type SearchResult = SearchCandidate & {
  score: number;
  matchedTerms: string[];
  preview: string;
};

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const compactText = (text: string) => normalizeText(text).replace(/\s+/g, "");

function getQueryTerms(queryText: string) {
  const words = Array.from(new Set(normalizeText(queryText).split(" ").filter(Boolean)));
  const filtered = words.filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return filtered.length ? filtered : words;
}

function countWordOccurrences(text: string, word: string) {
  const matches = text.match(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
  return matches?.length ?? 0;
}

function buildPreview(fullText: string, queryText: string, matchedTerms: string[]) {
  const text = fullText.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const target = [queryText, ...matchedTerms].find(Boolean)?.toLowerCase();
  const index = target ? text.toLowerCase().indexOf(target) : -1;

  if (index === -1) {
    return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
  }

  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + 170);
  return `${start > 0 ? "..." : ""}${text.slice(start, end).trim()}${end < text.length ? "..." : ""}`;
}

function getSemanticScores(matches: Array<{ _id: Id<"transcripts">; _score: number }>) {
  return new Map(
    matches.map((match, index) => [
      String(match._id),
      1 - index / Math.max(matches.length, 1),
    ])
  );
}

function scoreCandidate(
  candidate: SearchCandidate,
  queryText: string,
  queryTerms: string[],
  semanticScore: number
): SearchResult | null {
  const fullText = candidate.transcript.fullText || "";
  const searchableText = normalizeText(
    [
      fullText,
      candidate.video.caption,
      candidate.creator?.handle,
      candidate.creator?.displayName,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (!searchableText) {
    return null;
  }

  const normalizedQuery = normalizeText(queryText);
  const compactSearch = searchableText.replace(/\s+/g, "");
  const matchedTerms = queryTerms.filter(
    (term) => countWordOccurrences(searchableText, term) > 0 || compactSearch.includes(term)
  );
  const phraseMatch =
    normalizedQuery.length > 2 && compactSearch.includes(compactText(queryText));
  const allowSemanticOnly = queryTerms.length > 1 || normalizedQuery.includes(" ");

  if (!phraseMatch && matchedTerms.length === 0 && (!allowSemanticOnly || semanticScore < 0.5)) {
    return null;
  }

  const coverage = queryTerms.length ? matchedTerms.length / queryTerms.length : 0;
  const density = Math.min(
    1,
    matchedTerms.reduce(
      (total, term) => total + Math.min(2, countWordOccurrences(searchableText, term)),
      0
    ) / Math.max(queryTerms.length * 2, 1)
  );
  const score = Math.min(
    1,
    coverage * 0.7 +
      density * 0.15 +
      (phraseMatch ? 0.1 : 0) +
      (allowSemanticOnly ? semanticScore * 0.2 : 0)
  );

  if (score < 0.12) {
    return null;
  }

  return {
    ...candidate,
    score,
    matchedTerms: matchedTerms.slice(0, 8),
    preview: buildPreview(fullText, queryText, matchedTerms),
  };
}

export const searchVideos = action({
  args: {
    userId: v.id("users"),
    creatorId: v.optional(v.id("creators")),
    queryText: v.string(),
    openaiApiKey: v.string(),
  },
  handler: async (ctx, { userId, creatorId, queryText, openaiApiKey }) => {
    const trimmedQuery = queryText.trim();
    if (!trimmedQuery) {
      return [];
    }

    const transcripts = (await ctx.runQuery(internal.searchHelpers.getAllUserTranscripts, {
      userId,
      creatorId,
    })) as SearchCandidate[];
    if (!transcripts.length) {
      return [];
    }

    const queryTerms = getQueryTerms(trimmedQuery);
    let semanticScores = new Map<string, number>();

    if (openaiApiKey) {
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const embedding = (
          await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: trimmedQuery,
          })
        ).data[0].embedding;

        semanticScores = getSemanticScores(
          await ctx.vectorSearch("transcripts", "by_embedding", {
            vector: embedding,
            limit: Math.min(30, transcripts.length),
            filter: (q) => q.eq("userId", userId),
          })
        );
      } catch (error) {
        console.error("Semantic search failed", error);
      }
    }

    const ranked = transcripts
      .map((candidate) =>
        scoreCandidate(
          candidate,
          trimmedQuery,
          queryTerms,
          semanticScores.get(String(candidate.transcriptId)) ?? 0
        )
      )
      .filter((result): result is SearchResult => Boolean(result))
      .sort((a, b) => b.score - a.score);

    const deduped = new Map<string, SearchResult>();
    for (const result of ranked) {
      const key = String(result.video._id);
      if (!deduped.has(key)) {
        deduped.set(key, result);
      }
    }

    return Array.from(deduped.values()).slice(0, 20);
  },
});
