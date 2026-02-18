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
import { Id } from "../../../../convex/_generated/dataModel";

type Creator = {
  _id: Id<"creators">;
  handle: string;
  platform: "instagram" | "tiktok";
  displayName: string;
  isActive: boolean;
  videoCount: number;
};

export default function CreatorsPage() {
  const { userId } = useSession();
  const creators = useQuery(api.creators.list, { userId });
  const createCreator = useMutation(api.creators.create);
  const softDelete = useMutation(api.creators.remove);
  const hardDelete = useMutation(api.creators.hardDelete);

  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAddCreator(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await createCreator({
        userId,
        platform,
        handle: handle.replace("@", ""),
        displayName: displayName || handle.replace("@", ""),
      });
      setOpen(false);
      setHandle("");
      setDisplayName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add creator");
    } finally {
      setLoading(false);
    }
  }

  async function handleSoftDelete(id: Id<"creators">) {
    if (!confirm("Remove this creator? Videos will be kept.")) return;
    await softDelete({ id });
  }

  async function handleHardDelete(id: Id<"creators">) {
    if (
      !confirm(
        "Permanently delete this creator and ALL their videos and transcripts? This cannot be undone."
      )
    )
      return;
    await hardDelete({ id });
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
                <label className="text-sm font-medium">Platform</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={platform === "instagram" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPlatform("instagram")}
                  >
                    Instagram
                  </Button>
                  <Button
                    type="button"
                    variant={platform === "tiktok" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPlatform("tiktok")}
                  >
                    TikTok
                  </Button>
                </div>
              </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(creators as Creator[]).map((creator) => (
            <Card key={creator._id}>
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
                  {creator.videoCount} video
                  {creator.videoCount !== 1 ? "s" : ""}
                </p>
                <div className="flex gap-2 mt-4">
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
          ))}
        </div>
      )}
    </div>
  );
}
