import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { videoUrl } = await request.json();

    if (!videoUrl) {
      return NextResponse.json(
        { error: "videoUrl is required" },
        { status: 400 }
      );
    }

    const cobaltKey = process.env.COBALT_API_KEY;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (cobaltKey) {
      headers["Authorization"] = `Api-Key ${cobaltKey}`;
    }

    const response = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: videoUrl,
        downloadMode: "audio",
        audioFormat: "mp3",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Cobalt API error body:", errorBody);
      // Try to parse the body for a useful message
      let detail = response.statusText;
      try {
        const parsed = JSON.parse(errorBody);
        detail = parsed?.error?.code ?? parsed?.text ?? parsed?.error ?? detail;
      } catch {
        detail = errorBody || detail;
      }
      return NextResponse.json(
        { error: `Cobalt: ${detail}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.status === "error") {
      return NextResponse.json(
        { error: data.text || "Cobalt API returned an error" },
        { status: 400 }
      );
    }

    const audioUrl = data.url;
    if (!audioUrl) {
      return NextResponse.json(
        { error: "No audio URL returned from Cobalt" },
        { status: 500 }
      );
    }

    return NextResponse.json({ audioUrl });
  } catch (error) {
    console.error("Download audio error:", error);
    return NextResponse.json(
      { error: "Failed to download audio" },
      { status: 500 }
    );
  }
}
