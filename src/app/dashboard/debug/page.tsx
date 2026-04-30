"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function DebugPage() {
  const stats = useQuery(api.debug.getVideoStats);
  const transcripts = useQuery(api.debug.getAllTranscripts);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string>("");

  async function handleCleanupDuplicates() {
    setCleanupLoading(true);
    setCleanupResult("");
    try {
      const res = await fetch("/api/cleanup-duplicates", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setCleanupResult(data.message || `Removed ${data.deletedCount} duplicates`);
        // Refresh the page after 2 seconds to show updated data
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setCleanupResult(`Error: ${data.error}`);
      }
    } catch (error) {
      setCleanupResult(`Error: ${error instanceof Error ? error.message : "Failed"}`);
    } finally {
      setCleanupLoading(false);
    }
  }

  if (!stats || !transcripts) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Transcription Database</h1>
        <Button
          onClick={handleCleanupDuplicates}
          disabled={cleanupLoading}
          variant="destructive"
        >
          {cleanupLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Cleaning...
            </>
          ) : (
            "Remove Duplicates"
          )}
        </Button>
      </div>

      {cleanupResult && (
        <div className={`p-4 rounded-lg ${cleanupResult.startsWith("Error") ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
          {cleanupResult}
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Total Videos</p>
          <p className="text-2xl font-bold">{stats.totalVideos}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.byStatus.completed}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Processing</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.byStatus.processing}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats.byStatus.failed}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">Instagram Videos</p>
          <p className="text-xl font-bold">{stats.videosByPlatform.instagram}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">TikTok Videos</p>
          <p className="text-xl font-bold">{stats.videosByPlatform.tiktok}</p>
        </div>
      </div>

      {/* Transcripts List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">All Transcripts ({transcripts.length})</h2>

        {transcripts.length === 0 ? (
          <p className="text-muted-foreground">No transcripts found. Transcribe some videos to see data here.</p>
        ) : (
          <div className="space-y-4">
            {transcripts.map((item, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">
                      {item.creator ? `@${item.creator.handle}` : "Unknown Creator"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {item.video?.platform} • {item.transcript.createdAt}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {item.transcript.languageDetected && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {item.transcript.languageDetected}
                      </span>
                    )}
                    {item.transcript.confidenceScore && (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                        {(item.transcript.confidenceScore * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                </div>

                {/* Video URL */}
                {item.video?.videoUrl && (
                  <a
                    href={item.video.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline block truncate"
                  >
                    {item.video.videoUrl}
                  </a>
                )}

                {/* Caption */}
                {item.video?.caption && (
                  <p className="text-sm text-muted-foreground italic">
                    Caption: {item.video.caption}
                  </p>
                )}

                {/* First Two Sentences */}
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Preview:</p>
                  <p className="text-sm">{item.transcript.firstTwoSentences}</p>
                </div>

                {/* Full Transcript (Collapsible) */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View full transcript ({item.transcript.fullText.length} characters)
                  </summary>
                  <div className="mt-2 p-3 bg-gray-50 rounded whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {item.transcript.fullText}
                  </div>
                </details>

                {/* User Info */}
                {item.user && (
                  <p className="text-xs text-muted-foreground">
                    User: {item.user.name} ({item.user.email})
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
