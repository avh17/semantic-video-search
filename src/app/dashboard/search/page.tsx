"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Id } from "../../../../convex/_generated/dataModel";

type Creator = {
  _id: Id<"creators">;
  handle: string;
  platform: "instagram" | "tiktok";
  displayName: string;
};

type RecentVideo = {
  _id: Id<"videos">;
  videoUrl: string;
  platform: string;
  processingStatus: string;
  errorMessage?: string;
  caption?: string;
  creator: { handle: string; platform: string; displayName: string } | null;
  transcript: { firstTwoSentences: string; fullText: string } | null;
};

type SearchResult = {
  score: number;
  transcript: {
    firstTwoSentences: string;
    fullText: string;
  };
  video: {
    _id: Id<"videos">;
    videoUrl: string;
    platform: string;
    caption: string | undefined;
    processingStatus: string;
  };
  creator: {
    handle: string;
    platform: string;
    displayName: string;
  } | null;
};

export default function SearchPage() {
  const { userId } = useSession();
  const creators = useQuery(api.creators.list, { userId });
  const recentVideos = useQuery(api.searchHelpers.getRecentVideos, { userId });
  const createVideo = useMutation(api.videos.create);
  const processVideo = useAction(api.ingest.processVideo);
  const searchVideos = useAction(api.search.searchVideos);

  // Add video modal
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  async function handleAddVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCreatorId) {
      setAddError("Please select a creator");
      return;
    }
    setAddLoading(true);
    setAddError("");

    try {
      const creator = (creators as Creator[] | undefined)?.find((c: Creator) => c._id === selectedCreatorId);
      if (!creator) throw new Error("Creator not found");

      const videoId = await createVideo({
        creatorId: selectedCreatorId as Id<"creators">,
        userId,
        platform: creator.platform,
        videoUrl,
      });

      // Trigger the processing pipeline
      await processVideo({
        videoId,
        userId,
        videoUrl,
        appUrl: window.location.origin,
        openaiApiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || "",
      });

      setAddVideoOpen(false);
      setVideoUrl("");
      setSelectedCreatorId("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add video");
    } finally {
      setAddLoading(false);
    }
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
      setSearchError(
        err instanceof Error ? err.message : "Search failed"
      );
    } finally {
      setSearchLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Search Videos</h1>
        <Dialog open={addVideoOpen} onOpenChange={setAddVideoOpen}>
          <DialogTrigger asChild>
            <Button>Add Video</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Video</DialogTitle>
              <DialogDescription>
                Paste an Instagram Reel or TikTok URL to transcribe
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddVideo} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Creator</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={selectedCreatorId}
                  onChange={(e) => setSelectedCreatorId(e.target.value)}
                  required
                >
                  <option value="">Select a creator</option>
                  {(creators as Creator[] | undefined)?.map((c: Creator) => (
                    <option key={c._id} value={c._id}>
                      @{c.handle} ({c.platform})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Video URL</label>
                <Input
                  placeholder="https://www.instagram.com/reel/... or https://www.tiktok.com/..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  required
                />
              </div>
              {addError && (
                <p className="text-sm text-destructive">{addError}</p>
              )}
              <Button type="submit" className="w-full" disabled={addLoading}>
                {addLoading ? "Processing..." : "Add & Transcribe"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
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

      {searchError && (
        <p className="text-sm text-destructive">{searchError}</p>
      )}

      {/* Search Results */}
      {searchResults && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            Results ({searchResults.length})
          </h2>
          {searchResults.length === 0 ? (
            <p className="text-muted-foreground">
              No results found. Try a different search phrase.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {searchResults.map((result, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {result.creator && (
                          <>
                            <CardTitle className="text-base">
                              @{result.creator.handle}
                            </CardTitle>
                            <Badge
                              variant={
                                result.creator.platform === "instagram"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {result.creator.platform}
                            </Badge>
                          </>
                        )}
                      </div>
                      <Badge variant="outline">
                        {(result.score * 100).toFixed(1)}% match
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">
                      {result.transcript.firstTwoSentences}
                    </p>
                    <a
                      href={result.video.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Watch original video
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Videos */}
      {!searchResults && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Videos</h2>
          {!recentVideos ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : recentVideos.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No videos yet. Add one to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {(recentVideos as RecentVideo[]).map((video) => (
                <Card key={video._id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {video.creator && (
                          <>
                            <CardTitle className="text-base">
                              @{video.creator.handle}
                            </CardTitle>
                            <Badge
                              variant={
                                video.creator.platform === "instagram"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {video.creator.platform}
                            </Badge>
                          </>
                        )}
                      </div>
                      <Badge
                        variant={
                          video.processingStatus === "completed"
                            ? "default"
                            : video.processingStatus === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {video.processingStatus}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {video.transcript ? (
                      <p className="text-sm text-muted-foreground mb-2">
                        {video.transcript.firstTwoSentences}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mb-2 italic">
                        {video.processingStatus === "failed"
                          ? video.errorMessage || "Processing failed"
                          : "Transcription in progress..."}
                      </p>
                    )}
                    <a
                      href={video.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Watch original video
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
