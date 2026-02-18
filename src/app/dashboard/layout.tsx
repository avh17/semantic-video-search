import Link from "next/link";
import { getSessionUserId } from "@/lib/session";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { SessionProvider } from "@/components/session-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/auth/sign-in");
  }

  return (
    <SessionProvider userId={userId}>
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            <nav className="flex items-center gap-6">
              <Link href="/dashboard" className="font-bold text-lg">
                Search Brainrot
              </Link>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <Link
                href="/dashboard/creators"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Creators
              </Link>
              <Link
                href="/dashboard/search"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Search
              </Link>
            </nav>
            <SignOutButton />
          </div>
        </header>
        <main className="container mx-auto px-4 py-6">{children}</main>
      </div>
    </SessionProvider>
  );
}
