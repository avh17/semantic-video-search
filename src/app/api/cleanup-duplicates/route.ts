import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth-user";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Remove duplicate videos from the database
 */
export async function POST() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await convex.mutation(api.cleanup.removeDuplicateVideos, {
      userId: userId as Id<"users">,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Cleanup duplicates error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cleanup duplicates" },
      { status: 500 }
    );
  }
}
