"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
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
import { VideoCard } from "@/components/VideoCard";
import { Id } from "../../../../convex/_generated/dataModel";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type Creator = {
  _id: Id<"creators">;
  handle: string;
  platform: "instagram" | "tiktok";
  displayName: string;
  isActive: boolean;
  videoCount: number;
};

type FetchedVideo = {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  directVideoUrl?: string; // direct CDN URL for audio extraction
};

export default function CreatorsPage() {
  const { userId } = useSession();
  const creators = useQuery(api.creators.list, { userId });
  const createCreator = useMutation(api.creators.create);
  const softDelete = useMutation(api.creators.remove);
  const hardDelete = useMutation(api.creators.hardDelete);

  const [open, setOpen] = useState(false);
  const [platform] = useState<"instagram">("instagram");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Video loading state per creator
  const [expandedCreatorId, setExpandedCreatorId] = useState<string | null>(null);
  const [creatorVideos, setCreatorVideos] = useState<Record<string, FetchedVideo[]>>({});
  const [loadingVideos, setLoadingVideos] = useState<Record<string, boolean>>({});
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});

  async function fetchCreatorVideos(handle: string): Promise<FetchedVideo[]> {
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

  async function loadCreatorVideos(creator: Creator) {
    const id = creator._id;

    // Toggle off if already expanded
    if (expandedCreatorId === id) {
      setExpandedCreatorId(null);
      return;
    }

    setExpandedCreatorId(id);

    // Use cached videos if already loaded
    if (creatorVideos[id]) return;

    setLoadingVideos((prev) => ({ ...prev, [id]: true }));
    setVideoErrors((prev) => ({ ...prev, [id]: "" }));

    try {
      const videos = await fetchCreatorVideos(creator.handle);
      console.log(`Fetched ${videos.length} videos for @${creator.handle}`, videos);
      setCreatorVideos((prev) => ({ ...prev, [id]: videos }));
    } catch (err) {
      console.error(`Failed to load videos for @${creator.handle}:`, err);
      setVideoErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Failed to load videos",
      }));
    } finally {
      setLoadingVideos((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleAddCreator(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cleanHandle = handle.replace("@", "");
      const creatorId = await createCreator({
        userId,
        platform,
        handle: cleanHandle,
        displayName: displayName || cleanHandle,
      });
      setOpen(false);
      setHandle("");
      setDisplayName("");

      // Auto-load videos for newly added creator
      if (creatorId) {
        setExpandedCreatorId(creatorId);
        setLoadingVideos((prev) => ({ ...prev, [creatorId]: true }));
        setVideoErrors((prev) => ({ ...prev, [creatorId]: "" }));
        try {
          const videos = await fetchCreatorVideos(cleanHandle);
          setCreatorVideos((prev) => ({ ...prev, [creatorId]: videos }));
        } catch (err) {
          setVideoErrors((prev) => ({
            ...prev,
            [creatorId]: err instanceof Error ? err.message : "Failed to load videos",
          }));
        } finally {
          setLoadingVideos((prev) => ({ ...prev, [creatorId]: false }));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add creator");
    } finally {
      setLoading(false);
    }
  }

  async function handleSoftDelete(id: Id<"creators">) {
    if (!confirm("Remove this creator? Videos will be kept.")) return;
    await softDelete({ id });
    if (expandedCreatorId === id) setExpandedCreatorId(null);
  }

  async function handleHardDelete(id: Id<"creators">) {
    if (
      !confirm(
        "Permanently delete this creator and ALL their videos and transcripts? This cannot be undone."
      )
    )
      return;
    await hardDelete({ id });
    if (expandedCreatorId === id) setExpandedCreatorId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Creators</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Creator</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Creator</DialogTitle>
              <DialogDescription>
                Add a creator to track their videos
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddCreator} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Handle</label>
                <Input
                  placeholder="@username"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Display Name (optional)
                </label>
                <Input
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Adding..." : "Add Creator"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!creators ? (
        <p className="text-muted-foreground">Loading creators...</p>
      ) : creators.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No creators yet. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(creators as Creator[]).map((creator) => {
            const isExpanded = expandedCreatorId === creator._id;
            const videos = creatorVideos[creator._id];
            const isLoadingVids = loadingVideos[creator._id];
            const videoError = videoErrors[creator._id];

            return (
              <div key={creator._id} className="space-y-3">
                {/* Creator card */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        @{creator.handle}
                      </CardTitle>
                      <Badge
                        variant={
                          creator.platform === "instagram"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {creator.platform}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {creator.displayName}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {videos
                        ? `${videos.length} reels fetched · ${creator.videoCount} transcribed`
                        : `${creator.videoCount} transcribed`}
                    </p>
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadCreatorVideos(creator)}
                        disabled={isLoadingVids}
                      >
                        {isLoadingVids ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Loading...
                          </>
                        ) : isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Hide Videos
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            View Videos
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSoftDelete(creator._id)}
                      >
                        Remove
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleHardDelete(creator._id)}
                      >
                        Delete All
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Video cards */}
                {isExpanded && (
                  <div className="pl-4">
                    {videoError ? (
                      <p className="text-sm text-destructive">{videoError}</p>
                    ) : isLoadingVids ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading top videos...
                      </div>
                    ) : videos && videos.length > 0 ? (
                      <>
                        <p className="text-sm text-muted-foreground mb-3">
                          Top {videos.length} videos
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2">
                          {videos.map((video) => (
                            <VideoCard
                              key={video.id}
                              videoUrl={video.videoUrl}
                              thumbnailUrl={video.thumbnailUrl}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No videos found for this creator.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
