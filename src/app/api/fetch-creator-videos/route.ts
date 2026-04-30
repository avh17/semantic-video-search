import { NextRequest, NextResponse } from "next/server";

type VideoResult = {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  directVideoUrl?: string;
};

const SCRAPECREATORS_PROFILE_URL = "https://api.scrapecreators.com/v1/instagram/profile";

/**
 * Uses the ScrapeCreators API to fetch a creator's recent reels.
 * ScrapeCreators already powers direct reel downloads so this keeps everything under one provider/key.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const handle = (body?.handle as string | undefined)?.trim();
    const platform = (body?.platform as string | undefined) ?? "instagram";
    const limitInput = Number(body?.limit ?? 10);
    const limit = Number.isFinite(limitInput) ? limitInput : 10;

    if (!handle) {
      return NextResponse.json({ error: "Creator handle is required" }, { status: 400 });
    }

    if (platform !== "instagram") {
      return NextResponse.json({ error: "Only Instagram creators are supported" }, { status: 400 });
    }

    const apiKey = process.env.SCRAPECREATORS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "SCRAPECREATORS_API_KEY not configured. Add it to .env.local and restart the dev server." },
        { status: 500 }
      );
    }

    const cleanHandle = handle.replace("@", "");
    const url = new URL(SCRAPECREATORS_PROFILE_URL);
    // ScrapeCreators profile endpoint expects `handle` without the @ per docs.
    url.searchParams.set("handle", cleanHandle);
    // Asking for clips ensures reels/clips data is prioritised when available.
    url.searchParams.set("section", "clips");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      // ScrapeCreators responses are cacheable for a short period; let the edge cache handle it.
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("ScrapeCreators profile error:", response.status, text);
      if (response.status === 401) {
        return NextResponse.json(
          { error: "Invalid ScrapeCreators API key. Check SCRAPECREATORS_API_KEY in .env.local." },
          { status: 401 }
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: "ScrapeCreators rate limit exceeded. Wait a moment or upgrade your plan." },
          { status: 429 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Could not find reels for @${cleanHandle}.` },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: `ScrapeCreators API error: ${response.status}${text ? ` - ${text}` : ""}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const videos = parseScrapeCreatorsResponse(data, limit);

    return NextResponse.json({ videos });
  } catch (error) {
    console.error("Fetch creator videos error:", error);
    return NextResponse.json({ error: "Failed to fetch creator videos" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseScrapeCreatorsResponse(data: any, limit: number): VideoResult[] {
  const edges = extractMediaArray(data);

  return edges
    .map((edge) => normalizeMedia(edge))
    .filter((media) => media && isLikelyReel(media))
    .slice(0, limit)
    .map((media) => toVideoResult(media))
    .filter((video): video is VideoResult => Boolean(video));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMediaArray(data: any): any[] {
  const candidates = [
    data?.data?.user?.edge_clips_user?.edges,
    data?.data?.user?.edge_owner_to_timeline_media?.edges,
    data?.data?.user?.edge_felix_video_timeline?.edges,
    data?.data?.xdt_api__v1__clips__user__feed__connection?.edges,
    data?.data?.items,
    data?.items,
    data?.result?.edges,
    data?.clips,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }

  const reelsMedia = data?.data?.reels_media ?? data?.data?.user?.reels_media;
  if (Array.isArray(reelsMedia)) {
    return reelsMedia;
  }

  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMedia(edge: any) {
  return edge?.node ?? edge?.media ?? edge;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isLikelyReel(media: any): boolean {
  if (!media) return false;
  const productType = (media.product_type ?? media.__typename ?? "").toString().toLowerCase();

  return (
    media.is_reel_media === true ||
    productType.includes("clip") ||
    productType.includes("reel") ||
    media.media_type === 2 ||
    media.is_video === true ||
    Array.isArray(media.video_versions)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVideoResult(media: any): VideoResult | null {
  if (!media) return null;

  const pk = media.pk ?? media.id ?? media.media_id ?? media.code ?? Math.random();
  const code = media.code ?? media.shortcode;
  const permalink = media.permalink ?? media.link;
  const thumbnailCandidates = [
    media.thumbnail_url,
    media.thumbnail_src,
    media.display_url,
    media.cover_image,
    media.image_versions2?.candidates?.[0]?.url,
    media.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url,
  ];
  const thumbnailUrl = thumbnailCandidates.find((url) => typeof url === "string" && url.length > 0) ?? "";

  const directVideoUrl =
    media.video_url ??
    media.clip?.video_url ??
    media.video_versions?.[0]?.url ??
    media.download_link ??
    undefined;

  const videoUrl =
    permalink ??
    (code ? `https://www.instagram.com/reel/${code}/` : directVideoUrl ?? "");

  if (!videoUrl) {
    return null;
  }

  const result: VideoResult = {
    id: String(pk),
    videoUrl,
    thumbnailUrl,
  };

  if (directVideoUrl) {
    result.directVideoUrl = directVideoUrl;
  }

  return result;
}
