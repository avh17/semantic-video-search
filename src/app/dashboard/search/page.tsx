"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { VideoCard } from "@/components/VideoCard";
import { Id } from "../../../../convex/_generated/dataModel";
import { Loader2, Plus } from "lucide-react";

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
  transcript: { firstTwoSentences: string; fullText: string };
  video: {
    _id: Id<"videos">;
    videoUrl: string;
    thumbnailUrl?: string;
    platform: string;
    caption: string | undefined;
    processingStatus: string;
  };
  creator: { handle: string; platform: string; displayName: string } | null;
};

async function fetchInstagramReels(handle: string, apiKey: string): Promise<FetchedVideo[]> {
  const body = new URLSearchParams({ username_or_url: handle, amount: "10" });
  const res = await fetch(
    "https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_reels.php",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "instagram-scraper-stable-api.p.rapidapi.com",
      },
      body: body.toString(),
    }
  );
  if (!res.ok) throw new Error(`Instagram API error: ${res.status}`);
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reels: any[] = data?.reels ?? [];
  return reels.slice(0, 10).map((item) => {
    const media = item?.node?.media ?? item;
    const directVideoUrl: string | undefined =
      media.video_versions?.[0]?.url ??
      media.video_url ??
      undefined;
    return {
      id: String(media.pk ?? media.code ?? Math.random()),
      videoUrl: `https://www.instagram.com/reel/${media.code}/`,
      thumbnailUrl:
        media.image_versions2?.candidates?.[0]?.url ?? media.thumbnail_url ?? "",
      directVideoUrl,
    };
  });
}

// Fallback: use Cobalt proxy when no direct CDN URL is available
async function downloadAudioViaCobalt(videoUrl: string): Promise<string> {
  const res = await fetch("/api/download-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Audio download failed");
  }
  const { audioUrl } = await res.json();
  return audioUrl;
}

export default function SearchPage() {
  const { userId } = useSession();
  const creators = useQuery(api.creators.list, { userId });
  const createVideo = useMutation(api.videos.create);
  const generateUploadUrl = useMutation(api.ingestHelpers.generateUploadUrl);
  const processVideo = useAction(api.ingest.processVideo);
  const searchVideos = useAction(api.search.searchVideos);

  // Creator video browser
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>("");
  const [creatorVideos, setCreatorVideos] = useState<FetchedVideo[]>([]);
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Transcription state
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [transcribingAll, setTranscribingAll] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeErrors, setTranscribeErrors] = useState<string[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  async function handleSelectCreator(creatorId: string) {
    setSelectedCreatorId(creatorId);
    setCreatorVideos([]);
    setFetchError("");
    setTranscribeErrors([]);
    if (!creatorId) return;

    const creator = (creators as Creator[] | undefined)?.find((c) => c._id === creatorId);
    if (!creator) return;

    setFetchingVideos(true);
    try {
      const apiKey = process.env.NEXT_PUBLIC_RAPIDAPI_KEY ?? "";
      const videos = await fetchInstagramReels(creator.handle, apiKey);
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

    let audioUrl: string | undefined;
    let storageId: Id<"_storage"> | undefined;

    if (video.directVideoUrl) {
      // 1a. Fetch the direct CDN video via server-side proxy (avoids CORS)
      const mediaRes = await fetch("/api/proxy-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaUrl: video.directVideoUrl }),
      });
      if (!mediaRes.ok) {
        const err = await mediaRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Failed to fetch video: ${mediaRes.status}`);
      }
      const mediaBlob = await mediaRes.blob();

      // 1b. Upload to Convex storage so the action can fetch it using ctx.storage.getUrl()
      const uploadUrl = await generateUploadUrl();
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": mediaBlob.type || "video/mp4" },
        body: mediaBlob,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload video to storage");
      const { storageId: sid } = await uploadRes.json();
      storageId = sid as Id<"_storage">;
    } else {
      // 1c. No direct URL — fall back to Cobalt proxy and pass audioUrl
      audioUrl = await downloadAudioViaCobalt(video.videoUrl);
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
      ...(storageId ? { storageId } : { audioUrl: audioUrl! }),
      openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
    });
  }

  async function handleTranscribeSingle(video: FetchedVideo) {
    setTranscribingId(video.id);
    try {
      await transcribeOne(video);
    } catch (err) {
      console.error("Transcribe error:", err);
    } finally {
      setTranscribingId(null);
    }
  }

  async function handleTranscribeAll() {
    setTranscribingAll(true);
    setTranscribeProgress(0);
    setTranscribeErrors([]);
    const errors: string[] = [];

    for (let i = 0; i < creatorVideos.length; i++) {
      const video = creatorVideos[i];
      try {
        await transcribeOne(video);
      } catch (err) {
        errors.push(`Reel ${i + 1}: ${err instanceof Error ? err.message : "failed"}`);
      }
      setTranscribeProgress(i + 1);
    }

    setTranscribeErrors(errors);
    setTranscribingAll(false);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError("");

    try {
      const results = await searchVideos({
        userId,
        queryText: searchQuery,
        openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
      });
      setSearchResults(results as SearchResult[]);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Creator video browser */}
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Search Videos</h1>

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
                    Transcribing {transcribeProgress}/{creatorVideos.length}...
                  </>
                ) : (
                  `Transcribe All ${creatorVideos.length} Reels`
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
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
              {creatorVideos.map((video) => (
                <div key={video.id} className="relative">
                  <VideoCard videoUrl={video.videoUrl} thumbnailUrl={video.thumbnailUrl} />
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search by what was spoken in a video..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={searchLoading}>
          {searchLoading ? "Searching..." : "Search"}
        </Button>
      </form>

      {searchError && <p className="text-sm text-destructive">{searchError}</p>}

      {/* Search Results — thumbnail cards */}
      {searchResults && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Results ({searchResults.length})</h2>
          {searchResults.length === 0 ? (
            <p className="text-muted-foreground">No results found. Try a different search phrase.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {searchResults.map((result, i) => (
                <div key={i} className="space-y-1">
                  <VideoCard
                    videoUrl={result.video.videoUrl}
                    thumbnailUrl={result.video.thumbnailUrl ?? ""}
                  />
                  <div className="flex items-center justify-between px-0.5">
                    {result.creator && (
                      <p className="text-xs text-muted-foreground truncate">
                        @{result.creator.handle}
                      </p>
                    )}
                    <Badge variant="outline" className="text-xs shrink-0">
                      {(result.score * 100).toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
