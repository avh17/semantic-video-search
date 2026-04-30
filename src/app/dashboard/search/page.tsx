"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Loader2, Plus, Send } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/components/session-provider";
import { VideoCard } from "@/components/VideoCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  directVideoUrl?: string;
};

type SearchSource = {
  videoId?: Id<"videos">;
  videoUrl: string;
  thumbnailUrl?: string;
  creator?: string;
  platform: "instagram" | "tiktok";
  score: number;
  preview?: string;
  matchedTerms?: string[];
};

type VideoStatus = { status: string; videoId?: string };

async function postJson<T>(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`);
  }

  return data as T;
}

async function fetchCreatorReels(handle: string) {
  const data = await postJson<{ videos?: FetchedVideo[] }>("/api/fetch-creator-videos", {
    platform: "instagram",
    handle,
  });
  return data.videos ?? [];
}

async function extractInstagramVideoUrl(reelUrl: string) {
  const data = await postJson<{ videoUrl: string }>("/api/extract-instagram-video", { reelUrl });
  return data.videoUrl;
}

export default function SearchPage() {
  const { userId } = useSession();
  const creators = useQuery(api.creators.list, { userId }) as Creator[] | undefined;
  const createVideo = useMutation(api.videos.create);
  const processVideo = useAction(api.ingest.processVideo);

  const [selectedCreatorId, setSelectedCreatorId] = useState("");
  const [creatorVideos, setCreatorVideos] = useState<FetchedVideo[]>([]);
  const [videoStatuses, setVideoStatuses] = useState<Record<string, VideoStatus>>({});
  const [searchResults, setSearchResults] = useState<SearchSource[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [transcribeError, setTranscribeError] = useState("");
  const [error, setError] = useState("");
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcribingAll, setTranscribingAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!creatorVideos.length) {
      return;
    }

    let cancelled = false;

    Promise.all(
      creatorVideos.map(async (video) => {
        try {
          const data = await postJson<{
            exists: boolean;
            processingStatus: string;
            videoId?: string;
          }>("/api/check-video-status", { videoUrl: video.videoUrl });

          return data.exists
            ? [video.id, { status: data.processingStatus, videoId: data.videoId }] as const
            : null;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setVideoStatuses(
          Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, VideoStatus]>)
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [creatorVideos]);

  const pendingVideos = creatorVideos.filter(
    (video) => videoStatuses[video.id]?.status !== "completed"
  );
  const completedCount = Object.values(videoStatuses).filter(
    (video) => video.status === "completed"
  ).length;

  function markVideoCompleted(id: string) {
    setVideoStatuses((prev) => ({ ...prev, [id]: { status: "completed" } }));
  }

  async function handleSelectCreator(creatorId: string) {
    setSelectedCreatorId(creatorId);
    setCreatorVideos([]);
    setVideoStatuses({});
    setFetchError("");
    setTranscribeError("");

    const creator = creators?.find((item) => item._id === creatorId);
    if (!creator) {
      return;
    }

    setFetchingVideos(true);
    try {
      setCreatorVideos(await fetchCreatorReels(creator.handle));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load videos");
    } finally {
      setFetchingVideos(false);
    }
  }

  async function transcribeOne(video: FetchedVideo) {
    const creator = creators?.find((item) => item._id === selectedCreatorId);
    if (!creator) {
      throw new Error("Creator not found");
    }

    let directVideoUrl = video.directVideoUrl;

    if (!directVideoUrl) {
      try {
        directVideoUrl = await extractInstagramVideoUrl(video.videoUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Video extraction failed";
        if (message.includes("429")) {
          throw new Error(
            "Video Downloader API rate limit exceeded. Please wait a few minutes or upgrade your ScrapeCreators plan."
          );
        }
        throw err;
      }
    }

    const videoId = await createVideo({
      creatorId: selectedCreatorId as Id<"creators">,
      userId,
      platform: creator.platform,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
    });

    await processVideo({
      videoId,
      userId,
      videoUrl: video.videoUrl,
      audioUrl: directVideoUrl,
      openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
    });
  }

  async function handleTranscribeSingle(video: FetchedVideo) {
    if (videoStatuses[video.id]?.status === "completed") {
      return;
    }

    setTranscribingId(video.id);
    setTranscribeError("");

    try {
      await transcribeOne(video);
      markVideoCompleted(video.id);
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : "Failed to transcribe");
    } finally {
      setTranscribingId(null);
    }
  }

  async function handleTranscribeAll() {
    if (!pendingVideos.length) {
      return;
    }

    setTranscribingAll(true);
    setTranscribeError("");
    const errors: string[] = [];

    for (const [index, video] of pendingVideos.entries()) {
      try {
        await transcribeOne(video);
        markVideoCompleted(video.id);
      } catch (err) {
        errors.push(`Reel ${index + 1}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    setTranscribingAll(false);
    if (errors.length) {
      setTranscribeError(errors.join("\n"));
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!searchQuery.trim() || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    setAiAnswer("");
    setSearchResults(null);

    try {
      const data = await postJson<{ answer: string; sources: SearchSource[] }>("/api/ask-question", {
        question: searchQuery,
      });
      setAiAnswer(data.answer);
      setSearchResults(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Browse by creator</label>
          <select
            className="flex h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={selectedCreatorId}
            onChange={(event) => handleSelectCreator(event.target.value)}
            disabled={transcribingAll}
          >
            <option value="">Select a creator...</option>
            {creators?.map((creator) => (
              <option key={creator._id} value={creator._id}>
                @{creator.handle} ({creator.platform})
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
            <div className="flex items-center gap-3">
              <Button onClick={handleTranscribeAll} disabled={transcribingAll || !!transcribingId} size="sm">
                {transcribingAll
                  ? "Transcribing..."
                  : pendingVideos.length
                    ? `Transcribe ${pendingVideos.length} Reel${pendingVideos.length === 1 ? "" : "s"}`
                    : "All Transcribed"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {completedCount > 0 && <span className="mr-2 text-green-600">{completedCount} already transcribed</span>}
                or click <Plus className="inline h-3 w-3" /> on individual reels
              </p>
            </div>

            {transcribeError && (
              <p className="whitespace-pre-wrap text-xs text-destructive">{transcribeError}</p>
            )}

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
              {creatorVideos.map((video) => {
                const status = videoStatuses[video.id]?.status;
                const isCompleted = status === "completed";
                const isProcessing = status === "processing" || status === "pending";

                return (
                  <div key={video.id} className="relative">
                    <VideoCard videoUrl={video.videoUrl} thumbnailUrl={video.thumbnailUrl} />
                    {isCompleted && (
                      <div className="absolute top-1 right-1 rounded-full bg-green-500 p-1 text-white" title="Already transcribed">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    {isProcessing && (
                      <div className="absolute top-1 right-1 rounded-full bg-yellow-500 p-1 text-white" title="Processing">
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </div>
                    )}
                    {!isCompleted && !isProcessing && (
                      <button
                        onClick={() => handleTranscribeSingle(video)}
                        disabled={transcribingId === video.id || transcribingAll}
                        className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white transition-opacity hover:bg-black disabled:opacity-40"
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

      <div className="space-y-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            placeholder="Ask Anything"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-14 flex-1 text-lg"
          />
          <Button type="submit" disabled={isLoading} className="h-14 px-8 text-lg">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Thinking
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Ask
              </>
            )}
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {aiAnswer && (
        <div className="space-y-4">
          <div
            className="rounded-2xl border-2 border-black p-8 shadow-lg"
            style={{ background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(20px)" }}
          >
            <p className="whitespace-pre-wrap text-lg leading-relaxed text-gray-900">
              {aiAnswer.replace(/\*\*/g, "")}
            </p>
          </div>

          {!!searchResults?.length && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Sources ({searchResults.length})</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {searchResults.map((result, index) => (
                  <div key={index} className="space-y-2 rounded-xl border bg-card p-2">
                    <VideoCard videoUrl={result.videoUrl} thumbnailUrl={result.thumbnailUrl ?? ""} />
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-muted-foreground">
                        {result.creator ? `@${result.creator}` : "Unknown creator"}
                      </p>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {(result.score * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    {result.preview && (
                      <p className="max-h-20 overflow-hidden text-xs leading-5 text-foreground/80">
                        {result.preview}
                      </p>
                    )}
                    {!!result.matchedTerms?.length && (
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
