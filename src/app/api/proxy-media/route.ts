import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for fetching Instagram CDN media files.
 * Instagram CDN URLs often block direct browser fetches (CORS), but can be
 * fetched freely from a server. This route fetches the media and streams it
 * back to the client so it can be uploaded to Convex storage.
 */
export async function POST(request: NextRequest) {
  try {
    const { mediaUrl } = await request.json();

    if (!mediaUrl || typeof mediaUrl !== "string") {
      return NextResponse.json(
        { error: "mediaUrl is required" },
        { status: 400 }
      );
    }

    // Only allow Instagram/Facebook CDN URLs for security
    const allowedHosts = [
      "cdninstagram.com",
      "fbcdn.net",
      "instagram.com",
    ];
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(mediaUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    const isAllowed = allowedHosts.some((host) =>
      parsedUrl.hostname.endsWith(host)
    );
    if (!isAllowed) {
      return NextResponse.json(
        { error: "URL not from an allowed domain" },
        { status: 403 }
      );
    }

    const mediaRes = await fetch(mediaUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.instagram.com/",
      },
    });

    if (!mediaRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch media: ${mediaRes.status}` },
        { status: mediaRes.status }
      );
    }

    const contentType =
      mediaRes.headers.get("content-type") ?? "video/mp4";
    const buffer = await mediaRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    console.error("Proxy media error:", error);
    return NextResponse.json(
      { error: "Failed to proxy media" },
      { status: 500 }
    );
  }
}
