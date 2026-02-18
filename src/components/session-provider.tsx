"use client";

import { createContext, useContext, ReactNode } from "react";
import { Id } from "../../convex/_generated/dataModel";

type SessionContextType = {
  userId: Id<"users">;
};

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={{ userId: userId as Id<"users"> }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
