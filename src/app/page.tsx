import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Semantic Video Search
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Search Instagram Reels by what was spoken in them.
          Add creators, and we&apos;ll transcribe their reels so you can find
          any video by its spoken content.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <Link href="/auth/sign-in">
            <Button size="lg">Get Started</Button>
          </Link>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
        <div className="text-center p-4">
          <div className="text-2xl font-bold">1. Add Creators</div>
          <p className="text-sm text-muted-foreground mt-2">
            Add Instagram creators to track their reels
          </p>
        </div>
        <div className="text-center p-4">
          <div className="text-2xl font-bold">2. Auto-Transcribe</div>
          <p className="text-sm text-muted-foreground mt-2">
            AI extracts and transcribes spoken words
          </p>
        </div>
        <div className="text-center p-4">
          <div className="text-2xl font-bold">3. Search</div>
          <p className="text-sm text-muted-foreground mt-2">
            Find videos by what was said in them
          </p>
        </div>
      </div>
    </div>
  );
}
