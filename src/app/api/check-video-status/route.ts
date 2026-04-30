import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth-user";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Check if a video has already been transcribed to avoid re-processing
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoUrl } = await request.json();

    if (!videoUrl || typeof videoUrl !== "string") {
      return NextResponse.json(
        { error: "Video URL is required" },
        { status: 400 }
      );
    }

    // Check if video already exists in database
    const existingVideo = await convex.query(api.videos.findByUrl, {
      userId: userId as Id<"users">,
      videoUrl,
    });

    if (existingVideo) {
      return NextResponse.json({
        exists: true,
        processingStatus: existingVideo.processingStatus,
        videoId: existingVideo._id,
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error("Check video status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check video status" },
      { status: 500 }
    );
  }
}
