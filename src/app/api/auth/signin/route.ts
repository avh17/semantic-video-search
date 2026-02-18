import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex";
import { setSessionCookie } from "@/lib/session";
import { api } from "../../../../../convex/_generated/api";

export async function POST(request: NextRequest) {
  try {
    const { email, name } = await request.json();

    if (!email || !name) {
      return NextResponse.json(
        { error: "Email and name are required" },
        { status: 400 }
      );
    }

    const convex = getConvexClient();
    const userId = await convex.mutation(api.users.getOrCreate, { email, name });

    await setSessionCookie(userId);

    return NextResponse.json({ success: true, userId });
  } catch (error) {
    console.error("Sign in error:", error);
    return NextResponse.json(
      { error: "Failed to sign in" },
      { status: 500 }
    );
  }
}
