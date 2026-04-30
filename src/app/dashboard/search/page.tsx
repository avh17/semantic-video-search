"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VideoCard } from "@/components/VideoCard";
import { Id } from "../../../../convex/_generated/dataModel";
import { Loader2, Plus, Send, Check } from "lucide-react";

type Creator = {
  _id: Id<"creators">;
  handle: string;
  platform: "instagram" | "tiktok";
  displayName: string;
};

type FetchedVideo = {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  directVideoUrl?: string; // direct CDN URL for audio extraction
};

type SearchResult = {
  score: number;
  matchedTerms?: string[];
  transcript: { firstTwoSentences: string; fullText: string };
  video: {
    _id?: Id<"videos">;
    videoUrl: string;
    thumbnailUrl?: string;
    platform: string;
    caption: string | undefined;
    processingStatus: string;
  };
  creator: { handle: string; platform: string; displayName: string } | null;
};

type SearchSource = {
  videoId?: Id<"videos">;
  videoUrl: string;
  thumbnailUrl?: string;
  creator?: string;
  platform: string;
  score: number;
  preview?: string;
  matchedTerms?: string[];
};

async function fetchCreatorReels(handle: string): Promise<FetchedVideo[]> {
  const res = await fetch("/api/fetch-creator-videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: "instagram", handle }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message =
      (errorBody as { error?: string }).error ??
      `Failed to fetch reels: ${res.status}`;
    throw new Error(message);
  }

  const data = (await res.json()) as { videos?: FetchedVideo[] };
  return data.videos ?? [];
}

// Extract video URL from Instagram reel page (no API key needed)
async function extractInstagramVideoUrl(reelUrl: string): Promise<string> {
  const res = await fetch("/api/extract-instagram-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reelUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Video extraction failed");
  }
  const { videoUrl } = await res.json();
  return videoUrl;
}

export default function SearchPage() {
  const { userId } = useSession();
  const creators = useQuery(api.creators.list, { userId });
  const createVideo = useMutation(api.videos.create);
  const processVideo = useAction(api.ingest.processVideo);

  // Creator video browser
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>("");
  const [creatorVideos, setCreatorVideos] = useState<FetchedVideo[]>([]);
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [videoStatuses, setVideoStatuses] = useState<Record<string, { status: string; videoId?: string }>>({});

  // Transcription state
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcribingAll, setTranscribingAll] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeErrors, setTranscribeErrors] = useState<string[]>([]);

  // Unified search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [aiDisplayedAnswer, setAiDisplayedAnswer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Check which videos have already been transcribed
  useEffect(() => {
    async function checkVideoStatuses() {
      if (creatorVideos.length === 0) return;

      const statuses: Record<string, { status: string; videoId?: string }> = {};

      for (const video of creatorVideos) {
        try {
          const res = await fetch("/api/check-video-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: video.videoUrl }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.exists) {
              statuses[video.id] = {
                status: data.processingStatus,
                videoId: data.videoId,
              };
            }
          }
        } catch {
          // Ignore errors, video just won't show status
        }
      }

      setVideoStatuses(statuses);
    }

    checkVideoStatuses();
  }, [creatorVideos]);

  // Streaming effect for AI answer
  useEffect(() => {
    if (!aiAnswer) {
      setAiDisplayedAnswer("");
      return;
    }

    let currentIndex = 0;
    setAiDisplayedAnswer("");

    const intervalId = setInterval(() => {
      if (currentIndex < aiAnswer.length) {
        setAiDisplayedAnswer(aiAnswer.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(intervalId);
      }
    }, 15); // 15ms per character for smooth streaming

    return () => clearInterval(intervalId);
  }, [aiAnswer]);

  async function handleSelectCreator(creatorId: string) {
    setSelectedCreatorId(creatorId);
    setCreatorVideos([]);
    setFetchError("");
    setTranscribeErrors([]);
    setVideoStatuses({});
    if (!creatorId) return;

    const creator = (creators as Creator[] | undefined)?.find((c) => c._id === creatorId);
    if (!creator) return;

    setFetchingVideos(true);
    try {
      const videos = await fetchCreatorReels(creator.handle);
      setCreatorVideos(videos);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load videos");
    } finally {
      setFetchingVideos(false);
    }
  }

  async function transcribeOne(video: FetchedVideo): Promise<void> {
    const creator = (creators as Creator[] | undefined)?.find((c) => c._id === selectedCreatorId);
    if (!creator) throw new Error("Creator not found");

    // 1a. Extract direct video URL from Instagram
    let directVideoUrl = video.directVideoUrl;

    if (!directVideoUrl) {
      try {
        directVideoUrl = await extractInstagramVideoUrl(video.videoUrl);
      } catch (err) {
        // If we get a 429 rate limit error, throw a more helpful message
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        if (errorMsg.includes("429")) {
          throw new Error("Video Downloader API rate limit exceeded. Please wait a few minutes or upgrade your ScrapeCreators plan.");
        }
        throw err;
      }
    }

    // 2. Create video record with thumbnail
    const videoId = await createVideo({
      creatorId: selectedCreatorId as Id<"creators">,
      userId,
      platform: creator.platform,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
    });

    // 3. Trigger Convex processing — pass storageId if we uploaded, else audioUrl
    await processVideo({
      videoId,
      userId,
      videoUrl: video.videoUrl,
      audioUrl: directVideoUrl,
      openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
    });
  }

  async function handleTranscribeSingle(video: FetchedVideo) {
    // Check if video is already transcribed
    const videoStatus = videoStatuses[video.id];
    if (videoStatus?.status === "completed") {
      console.log("Video already transcribed, skipping:", video.videoUrl);
      return;
    }

    setTranscribingId(video.id);
    setTranscribeErrors([]);
    try {
      await transcribeOne(video);
      // Update status after successful transcription
      setVideoStatuses(prev => ({
        ...prev,
        [video.id]: { status: "completed" }
      }));
    } catch (err) {
      console.error("Transcribe error:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to transcribe";
      setTranscribeErrors([errorMsg]);
    } finally {
      setTranscribingId(null);
    }
  }

  async function handleTranscribeAll() {
    setTranscribingAll(true);
    setTranscribeProgress(0);
    setTranscribeErrors([]);
    const errors: string[] = [];

    // Filter out already transcribed videos
    const videosToTranscribe = creatorVideos.filter(video => {
      const videoStatus = videoStatuses[video.id];
      return videoStatus?.status !== "completed";
    });

    for (let i = 0; i < videosToTranscribe.length; i++) {
      const video = videosToTranscribe[i];
      try {
        await transcribeOne(video);
        // Update status after successful transcription
        setVideoStatuses(prev => ({
          ...prev,
          [video.id]: { status: "completed" }
        }));
      } catch (err) {
        errors.push(`Reel ${i + 1}: ${err instanceof Error ? err.message : "failed"}`);
      }
      setTranscribeProgress(i + 1);
    }

    setTranscribeErrors(errors);
    setTranscribingAll(false);
  }

  async function handleUnifiedSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim() || isLoading) return;

    setIsLoading(true);
    setError("");
    setAiAnswer("");
    setSearchResults(null);

    try {
      // Get AI answer with sources
      const res = await fetch("/api/ask-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: searchQuery }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to get answer");
      }

      const data = (await res.json()) as { answer: string; sources: SearchSource[] };
      setAiAnswer(data.answer);

      // Convert sources to search results format
      const results = data.sources.map((source) => ({
        score: source.score,
        matchedTerms: source.matchedTerms || [],
        transcript: {
          firstTwoSentences: source.preview || "",
          fullText: "",
        },
        video: {
          _id: source.videoId,
          videoUrl: source.videoUrl,
          thumbnailUrl: source.thumbnailUrl,
          platform: source.platform,
          caption: "",
          processingStatus: "completed",
        },
        creator: source.creator
          ? {
              handle: source.creator,
              platform: source.platform,
              displayName: source.creator,
            }
          : null,
      }));

      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Creator video browser */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Browse by creator</label>
          <select
            className="flex h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={selectedCreatorId}
            onChange={(e) => handleSelectCreator(e.target.value)}
            disabled={transcribingAll}
          >
            <option value="">Select a creator...</option>
            {(creators as Creator[] | undefined)?.map((c) => (
              <option key={c._id} value={c._id}>
                @{c.handle} ({c.platform})
              </option>
            ))}
          </select>
        </div>

        {fetchingVideos && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reels...
          </div>
        )}

        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}

        {creatorVideos.length > 0 && (
          <div className="space-y-3">
            {/* Transcribe All button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleTranscribeAll}
                disabled={transcribingAll || !!transcribingId}
                size="sm"
              >
                {transcribingAll ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                    Transcribing {transcribeProgress}/{creatorVideos.filter(v => videoStatuses[v.id]?.status !== "completed").length}...
                  </>
                ) : (() => {
                  const untranscribedCount = creatorVideos.filter(v => videoStatuses[v.id]?.status !== "completed").length;
                  return untranscribedCount > 0
                    ? `Transcribe ${untranscribedCount} Reel${untranscribedCount !== 1 ? 's' : ''}`
                    : "All Transcribed";
                })()}
              </Button>
              <p className="text-xs text-muted-foreground">
                {Object.values(videoStatuses).filter(s => s.status === "completed").length > 0 && (
                  <span className="text-green-600 mr-2">
                    {Object.values(videoStatuses).filter(s => s.status === "completed").length} already transcribed
                  </span>
                )}
                or click <Plus className="inline h-3 w-3" /> on individual reels
              </p>
            </div>

            {transcribeErrors.length > 0 && (
              <div className="text-xs text-destructive space-y-0.5">
                {transcribeErrors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}

            {/* Video grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {creatorVideos.map((video) => {
                const videoStatus = videoStatuses[video.id];
                const isTranscribed = videoStatus?.status === "completed";
                const isProcessing = videoStatus?.status === "processing" || videoStatus?.status === "pending";

                return (
                  <div key={video.id} className="relative">
                    <VideoCard videoUrl={video.videoUrl} thumbnailUrl={video.thumbnailUrl} />

                    {/* Status indicator for already transcribed videos */}
                    {isTranscribed && (
                      <div
                        className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-1"
                        title="Already transcribed"
                      >
                        <Check className="h-3 w-3" />
                      </div>
                    )}

                    {/* Processing indicator */}
                    {isProcessing && !isTranscribed && (
                      <div
                        className="absolute top-1 right-1 bg-yellow-500 text-white rounded-full p-1"
                        title="Processing"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </div>
                    )}

                    {/* Transcribe button for videos not yet transcribed */}
                    {!isTranscribed && !isProcessing && (
                      <button
                        onClick={() => handleTranscribeSingle(video)}
                        disabled={transcribingId === video.id || transcribingAll}
                        className="absolute top-1 right-1 bg-black/70 hover:bg-black text-white rounded-full p-1 transition-opacity disabled:opacity-40"
                        title="Transcribe this reel"
                      >
                        {transcribingId === video.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Ask Anything Interface */}
      <div className="space-y-4">
        {/* Input Bar */}
        <form onSubmit={handleUnifiedSearch} className="flex gap-2 items-center">
          <Input
            placeholder="Ask Anything"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-lg h-14"
          />
          <Button
            type="submit"
            disabled={isLoading}
            className="h-14 px-8 text-lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Thinking
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Ask
              </>
            )}
          </Button>
        </form>

        {/* Errors */}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* AI Answer */}
      {aiAnswer && (
        <div className="space-y-4">
          <div
            className="p-8 rounded-2xl border-2 border-black shadow-lg"
            style={{
              background: "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(20px)",
            }}
          >
            <p className="text-lg text-gray-900 whitespace-pre-wrap leading-relaxed font-sans">
              {aiDisplayedAnswer.replace(/\*\*/g, '')}
              {aiDisplayedAnswer.length < aiAnswer.length && (
                <span className="inline-block w-1 h-5 bg-gray-900 ml-1 animate-pulse" />
              )}
            </p>
          </div>

          {searchResults && searchResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Sources ({searchResults.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {searchResults.map((result, i) => (
                  <div key={i} className="space-y-2 rounded-xl border bg-card p-2">
                    <VideoCard
                      videoUrl={result.video.videoUrl}
                      thumbnailUrl={result.video.thumbnailUrl ?? ""}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {result.creator ? `@${result.creator.handle}` : "Unknown creator"}
                      </p>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {(result.score * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    {result.transcript.firstTwoSentences && (
                      <p className="max-h-20 overflow-hidden text-xs leading-5 text-foreground/80">
                        {result.transcript.firstTwoSentences}
                      </p>
                    )}
                    {result.matchedTerms && result.matchedTerms.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.matchedTerms.slice(0, 4).map((term) => (
                          <Badge key={term} variant="secondary" className="text-[10px]">
                            {term}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
