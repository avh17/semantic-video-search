"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _internal: any;
async function getInternal() {
  if (!_internal) {
    _internal = (await import("./_generated/api")).internal;
  }
  return _internal;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

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

type CandidateScore = SearchCandidate & {
  score: number;
  lexicalScore: number;
  semanticScore: number;
  exactCoverage: number;
  fuzzyCoverage: number;
  matchedTerms: string[];
  preview: string;
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

function getQueryTerms(queryText: string): string[] {
  const filteredTerms = tokenize(queryText).filter(
    (word) => word.length > 1 && !STOP_WORDS.has(word)
  );

  if (filteredTerms.length > 0) {
    return Array.from(new Set(filteredTerms));
  }

  return Array.from(new Set(tokenize(queryText)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countWordOccurrences(text: string, word: string): number {
  if (!text || !word) return 0;
  const matches = text.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"));
  return matches?.length ?? 0;
}

// Calculate Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Check if a word matches with fuzzy tolerance
function fuzzyWordMatch(word: string, target: string, maxDistance: number = 2): boolean {
  const wordLower = word.toLowerCase();
  const targetLower = target.toLowerCase();

  // Exact match
  if (wordLower === targetLower) return true;

  // Fuzzy match (allows for misspellings)
  const distance = levenshteinDistance(wordLower, targetLower);
  const maxAllowedDistance = Math.min(maxDistance, Math.floor(targetLower.length * 0.3));

  return distance <= maxAllowedDistance;
}

function findFuzzyMatch(words: string[], queryWord: string): boolean {
  if (queryWord.length < 5) return false;

  return words.some((word) => {
    if (Math.abs(word.length - queryWord.length) > 2) return false;
    return fuzzyWordMatch(word, queryWord, 1);
  });
}

function findJoinedWordMatch(words: string[], queryWord: string): boolean {
  if (queryWord.length < 5 || words.length < 2) return false;

  for (let start = 0; start < words.length; start++) {
    let combined = "";

    for (let length = 1; length <= 3 && start + length <= words.length; length++) {
      combined += words[start + length - 1];

      if (combined === queryWord) {
        return true;
      }

      if (combined.length > queryWord.length + 2) {
        break;
      }

      if (
        combined.length >= queryWord.length - 1 &&
        fuzzyWordMatch(combined, queryWord, 2)
      ) {
        return true;
      }
    }
  }

  return false;
}

function buildPreview(fullText: string, queryText: string, matchedTerms: string[]): string {
  const text = fullText.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const searchTargets = [queryText, ...matchedTerms]
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const lowerText = text.toLowerCase();
  let matchIndex = -1;

  for (const target of searchTargets) {
    const index = lowerText.indexOf(target.toLowerCase());
    if (index !== -1) {
      matchIndex = index;
      break;
    }
  }

  if (matchIndex === -1) {
    return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
  }

  const start = Math.max(0, matchIndex - 90);
  const end = Math.min(text.length, matchIndex + 170);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function normalizeSemanticScores(
  matches: Array<{ _id: Id<"transcripts">; _score: number }>
): Map<string, number> {
  const scores = new Map<string, number>();
  if (matches.length === 0) {
    return scores;
  }

  const topScore = matches[0]._score;

  matches.forEach((match, index) => {
    const scoreRatio = topScore > 0 ? match._score / topScore : 0;
    const rankScore =
      matches.length === 1 ? 1 : 1 - index / (matches.length - 1);

    scores.set(
      String(match._id),
      Math.max(0, Math.min(1, scoreRatio * 0.65 + rankScore * 0.35))
    );
  });

  return scores;
}

function scoreCandidate(
  candidate: SearchCandidate,
  queryText: string,
  queryTerms: string[],
  semanticScore: number
): CandidateScore | null {
  const transcriptText = normalizeText(candidate.transcript.fullText || "");
  const captionText = normalizeText(candidate.video.caption || "");
  const creatorText = normalizeText(
    `${candidate.creator?.handle || ""} ${candidate.creator?.displayName || ""}`
  );
  const transcriptTokens = tokenize(transcriptText);
  const captionTokens = tokenize(captionText);
  const creatorTokens = tokenize(creatorText);
  const transcriptWords = Array.from(new Set(transcriptTokens));
  const captionWords = Array.from(new Set(captionTokens));
  const creatorWords = Array.from(new Set(creatorTokens));
  const searchableWords = Array.from(
    new Set([...transcriptWords, ...captionWords, ...creatorWords])
  );
  const normalizedQuery = normalizeText(queryText);
  const isKeywordSearch = queryTerms.length <= 2 && normalizedQuery.split(" ").length <= 3;

  const exactMatches = new Set<string>();
  const fuzzyMatches = new Set<string>();
  const joinedMatches = new Set<string>();
  let transcriptExactCount = 0;
  let captionExactCount = 0;
  let creatorExactCount = 0;

  for (const term of queryTerms) {
    const transcriptCount = countWordOccurrences(transcriptText, term);
    const captionCount = countWordOccurrences(captionText, term);
    const creatorCount = countWordOccurrences(creatorText, term);

    if (transcriptCount > 0 || captionCount > 0 || creatorCount > 0) {
      exactMatches.add(term);
      transcriptExactCount += transcriptCount;
      captionExactCount += captionCount;
      creatorExactCount += creatorCount;
      continue;
    }

    if (
      findJoinedWordMatch(transcriptTokens, term) ||
      findJoinedWordMatch(captionTokens, term) ||
      findJoinedWordMatch(creatorTokens, term)
    ) {
      joinedMatches.add(term);
      continue;
    }

    if (findFuzzyMatch(searchableWords, term)) {
      fuzzyMatches.add(term);
    }
  }

  const exactCoverage =
    queryTerms.length > 0 ? exactMatches.size / queryTerms.length : 0;
  const joinedCoverage =
    queryTerms.length > 0 ? joinedMatches.size / queryTerms.length : 0;
  const fuzzyCoverage =
    queryTerms.length > 0 ? fuzzyMatches.size / queryTerms.length : 0;
  const transcriptPhraseMatch =
    normalizedQuery.length > 3 && transcriptText.includes(normalizedQuery);
  const captionPhraseMatch =
    normalizedQuery.length > 3 && captionText.includes(normalizedQuery);
  const creatorPhraseMatch =
    normalizedQuery.length > 3 && creatorText.includes(normalizedQuery);
  const densityScore = Math.min(
    1,
    (transcriptExactCount + captionExactCount * 1.35 + creatorExactCount * 1.1) /
      Math.max(3, queryTerms.length * 3)
  );
  const lexicalScore = Math.min(
    1,
    exactCoverage * 0.52 +
      joinedCoverage * 0.16 +
      fuzzyCoverage * 0.08 +
      densityScore * 0.16 +
      (transcriptPhraseMatch ? 0.12 : 0) +
      (captionPhraseMatch ? 0.08 : 0) +
      (creatorPhraseMatch ? 0.04 : 0)
  );
  const score = Math.min(1, lexicalScore * 0.72 + semanticScore * 0.28);
  const matchedTerms = Array.from(
    new Set([...exactMatches, ...joinedMatches, ...fuzzyMatches])
  ).slice(0, 8);
  const hasUsefulSignal =
    transcriptPhraseMatch ||
    captionPhraseMatch ||
    creatorPhraseMatch ||
    exactMatches.size > 0 ||
    joinedMatches.size > 0 ||
    fuzzyMatches.size > 0 ||
    (!isKeywordSearch && semanticScore >= 0.45);

  if (!hasUsefulSignal || score < 0.12) {
    return null;
  }

  return {
    ...candidate,
    score,
    lexicalScore,
    semanticScore,
    exactCoverage,
    fuzzyCoverage,
    matchedTerms,
    preview: buildPreview(candidate.transcript.fullText || "", queryText, matchedTerms),
  };
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
    const trimmedQuery = queryText.trim();

    if (!trimmedQuery) {
      return [];
    }

    const allTranscripts = (await ctx.runQuery(
      internal.searchHelpers.getAllUserTranscripts,
      { userId }
    )) as SearchCandidate[];

    console.log(`Total transcripts for user: ${allTranscripts.length}`);

    if (allTranscripts.length === 0) {
      console.log("No transcripts found for user");
      return [];
    }

    const queryTerms = getQueryTerms(trimmedQuery);
    console.log(`Search query: "${trimmedQuery}", keywords: ${queryTerms.join(", ")}`);

    let semanticScores = new Map<string, number>();

    if (openaiApiKey) {
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const embeddingRes = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: trimmedQuery,
        });
        const semanticMatches = await ctx.vectorSearch("transcripts", "by_embedding", {
          vector: embeddingRes.data[0].embedding,
          limit: Math.min(30, allTranscripts.length),
          filter: (q) => q.eq("userId", userId),
        });

        semanticScores = normalizeSemanticScores(semanticMatches);
      } catch (error) {
        console.error("Semantic search failed, falling back to lexical ranking", error);
      }
    }

    const scoredResults = allTranscripts
      .map((candidate) =>
        scoreCandidate(
          candidate,
          trimmedQuery,
          queryTerms,
          semanticScores.get(String(candidate.transcriptId)) ?? 0
        )
      )
      .filter((result): result is CandidateScore => Boolean(result))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.exactCoverage !== a.exactCoverage) {
          return b.exactCoverage - a.exactCoverage;
        }
        return b.semanticScore - a.semanticScore;
      });

    // Deduplicate by video ID
    const videoIdMap = new Map<string, CandidateScore>();

    for (const result of scoredResults) {
      const videoId = String(result.video?._id);

      if (!videoId || videoId === "undefined") continue;

      const existing = videoIdMap.get(videoId);
      if (!existing || result.score > existing.score) {
        videoIdMap.set(videoId, result);
      }
    }

    const finalResults = Array.from(videoIdMap.values()).slice(0, 20);

    console.log(`Hybrid search results: ${finalResults.length} videos matched`);

    return finalResults;
  },
});
