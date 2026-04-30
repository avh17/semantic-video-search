import { NextRequest, NextResponse } from "next/server";

/**
 * Extracts the direct video URL from an Instagram reel using ScrapeCreators API.
 * ScrapeCreators pricing: 100 free credits, then $10 for 5,000 credits (never expire)
 * Cost: 1 credit per request
 */
export async function POST(request: NextRequest) {
  try {
    const { reelUrl } = await request.json();

    if (!reelUrl || typeof reelUrl !== "string") {
      return NextResponse.json(
        { error: "reelUrl is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.SCRAPECREATORS_API_KEY ?? "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "SCRAPECREATORS_API_KEY not configured. Sign up at https://app.scrapecreators.com" },
        { status: 500 }
      );
    }

    // Use ScrapeCreators Instagram Post API to get the direct video URL
    const url = new URL("https://api.scrapecreators.com/v1/instagram/post");
    url.searchParams.append("url", reelUrl);
    url.searchParams.append("trim", "false");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ScrapeCreators API error:", errorText);

      if (response.status === 401) {
        return NextResponse.json(
          { error: "Invalid ScrapeCreators API key. Check your .env.local file." },
          { status: 401 }
        );
      }

      if (response.status === 429) {
        return NextResponse.json(
          { error: "ScrapeCreators rate limit exceeded. Wait a moment or upgrade your plan." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `ScrapeCreators API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("ScrapeCreators API response:", data);

    // Extract video URL from ScrapeCreators response
    // Response structure: data.xdt_shortcode_media.video_url
    const videoUrl = data?.data?.xdt_shortcode_media?.video_url;

    if (!videoUrl) {
      console.error("No video URL in ScrapeCreators response:", data);
      return NextResponse.json(
        { error: "Could not find video URL in API response. This might not be a video post." },
        { status: 404 }
      );
    }

    return NextResponse.json({ videoUrl });
  } catch (error) {
    console.error("Extract Instagram video error:", error);
    return NextResponse.json(
      { error: "Failed to extract video URL" },
      { status: 500 }
    );
  }
}
