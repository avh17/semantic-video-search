import type { Session } from "next-auth";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { auth } from "@/auth";
import { getConvexClient } from "@/lib/convex";

function getSessionIdentity(session: Session | null) {
  const email = session?.user?.email?.trim().toLowerCase();
  const name = session?.user?.name?.trim();

  if (!email) {
    return null;
  }

  return {
    email,
    name: name || email,
  };
}

export async function getCurrentUserId(sessionArg?: Session | null): Promise<Id<"users"> | null> {
  const session = sessionArg ?? (await auth());
  const identity = getSessionIdentity(session);

  if (!identity) {
    return null;
  }

  const convex = getConvexClient();
  return await convex.mutation(api.users.getOrCreate, identity);
}
