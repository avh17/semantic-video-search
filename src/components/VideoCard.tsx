"use client";

import { ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

type VideoCardProps = {
  videoUrl: string;
  thumbnailUrl: string;
};

export function VideoCard({ videoUrl, thumbnailUrl }: VideoCardProps) {
  const [proxiedThumbnail, setProxiedThumbnail] = useState<{
    sourceUrl: string;
    objectUrl: string;
  } | null>(null);
  const [proxyFailureUrl, setProxyFailureUrl] = useState<string | null>(null);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const shouldProxy =
    !!thumbnailUrl &&
    (thumbnailUrl.includes("cdninstagram.com") ||
      thumbnailUrl.includes("fbcdn.net") ||
      thumbnailUrl.includes("instagram.com"));
  const currentProxiedThumbnail =
    proxiedThumbnail?.sourceUrl === thumbnailUrl ? proxiedThumbnail.objectUrl : "";
  const displayThumbnail = shouldProxy ? currentProxiedThumbnail : thumbnailUrl;
  const imageError =
    proxyFailureUrl === thumbnailUrl ||
    (displayThumbnail ? failedImageSrc === displayThumbnail : false);

  useEffect(() => {
    if (!shouldProxy || !thumbnailUrl) {
      return;
    }

    let isCancelled = false;
    let objectUrl = "";

    fetch("/api/proxy-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaUrl: thumbnailUrl }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to proxy thumbnail");
        }
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (isCancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setProxiedThumbnail({
          sourceUrl: thumbnailUrl,
          objectUrl,
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setProxyFailureUrl(thumbnailUrl);
        }
      });

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [shouldProxy, thumbnailUrl]);

  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block aspect-[9/16] overflow-hidden rounded-lg border bg-muted hover:border-primary transition-all duration-200"
    >
      {displayThumbnail && !imageError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayThumbnail}
          alt="Video thumbnail"
          className="h-full w-full object-cover"
          onError={() => setFailedImageSrc(displayThumbnail)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground text-xs text-center px-2">
          {imageError ? "Failed to load" : "Loading..."}
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-end p-2">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs rounded px-2 py-1 flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          Open
        </div>
      </div>
    </a>
  );
}
