import { NextRequest, NextResponse } from "next/server";

type VideoResult = {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const handle = searchParams.get("handle");

  if (!platform || !handle) {
    return NextResponse.json(
      { error: "Missing platform or handle" },
      { status: 400 }
    );
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "RAPIDAPI_KEY not configured in environment" },
      { status: 500 }
    );
  }

  try {
    if (platform === "instagram") {
      return await fetchInstagramVideos(handle, apiKey);
    } else {
      return NextResponse.json(
        { error: "Only Instagram is supported" },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("Error fetching creator videos:", err);
    return NextResponse.json(
      { error: "Failed to fetch videos" },
      { status: 500 }
    );
  }
}

async function fetchInstagramVideos(
  handle: string,
  apiKey: string
): Promise<NextResponse> {
  const response = await fetch(
    `https://instagram-scraper-stable-api.p.rapidapi.com/ig/reels/?username_or_url=${encodeURIComponent(handle)}`,
    {
      headers: {
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": "instagram-scraper-stable-api.p.rapidapi.com",
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    console.error("Instagram API error:", response.status, text);
    return NextResponse.json(
      { error: `Instagram API error: ${response.status}` },
      { status: response.status }
    );
  }

  const data = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = data?.data?.items ?? data?.items ?? [];

  const videos: VideoResult[] = items.slice(0, 20).map((item) => ({
    id: String(item.pk ?? item.code ?? Math.random()),
    videoUrl: `https://www.instagram.com/reel/${item.code}/`,
    thumbnailUrl:
      item.image_versions2?.candidates?.[0]?.url ??
      item.thumbnail_url ??
      "",
  }));

  return NextResponse.json({ videos });
}

