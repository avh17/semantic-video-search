import { ExternalLink } from "lucide-react";

type VideoCardProps = {
  videoUrl: string;
  thumbnailUrl: string;
};

export function VideoCard({ videoUrl, thumbnailUrl }: VideoCardProps) {
  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block aspect-[9/16] overflow-hidden rounded-lg border bg-muted hover:border-primary transition-all duration-200"
    >
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt="Video thumbnail"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground text-xs text-center px-2">
          No thumbnail
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
