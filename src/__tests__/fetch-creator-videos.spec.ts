import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/fetch-creator-videos/route";

// Exercise the route without a browser, live credentials, or paid API calls.
const originalFetch = globalThis.fetch;
const originalApiKey = process.env.SCRAPECREATORS_API_KEY;

test.beforeEach(() => {
  process.env.SCRAPECREATORS_API_KEY = "test-api-key";
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.SCRAPECREATORS_API_KEY;
  } else {
    process.env.SCRAPECREATORS_API_KEY = originalApiKey;
  }
});

function request(body: Record<string, unknown> = { handle: "@baxate" }) {
  return new NextRequest("http://localhost/api/fetch-creator-videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reel(index = 1) {
  return {
    media: {
      pk: String(index),
      code: `reel-${index}`,
      media_type: 2,
      product_type: "clips",
      image_versions2: { candidates: [{ url: `https://cdn.example.com/${index}.jpg` }] },
      video_versions: [{ url: `https://cdn.example.com/${index}.mp4` }],
    },
  };
}

test("requests the reels feed for @baxate and returns media for browsing and ingestion", async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.scrapecreators.com");
    expect(url.pathname).toBe("/v1/instagram/user/reels");
    expect(url.searchParams.get("handle")).toBe("baxate");
    expect(url.searchParams.get("trim")).toBe("false");
    expect(url.searchParams.has("section")).toBe(false);
    expect(new Headers(init?.headers).get("x-api-key")).toBe("test-api-key");
    return Response.json({ success: true, items: [reel()] });
  };

  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    videos: [{
      id: "1",
      videoUrl: "https://www.instagram.com/reel/reel-1/",
      thumbnailUrl: "https://cdn.example.com/1.jpg",
      directVideoUrl: "https://cdn.example.com/1.mp4",
    }],
  });
});

test("uses the provider's permalink and display_uri when present", async () => {
  globalThis.fetch = async () => Response.json({
    items: [{ media: {
      pk: "2",
      media_type: 2,
      url: "https://www.instagram.com/reel/provider-link/",
      display_uri: "https://cdn.example.com/cover.jpg",
      video_versions: [{ url: "https://cdn.example.com/video.mp4" }],
    } }],
  });

  const response = await POST(request());
  expect((await response.json()).videos).toEqual([{
    id: "2",
    videoUrl: "https://www.instagram.com/reel/provider-link/",
    thumbnailUrl: "https://cdn.example.com/cover.jpg",
    directVideoUrl: "https://cdn.example.com/video.mp4",
  }]);
});

test("limits the returned reels to ten by default or the requested limit", async () => {
  globalThis.fetch = async () => Response.json({
    items: Array.from({ length: 12 }, (_, index) => reel(index)),
  });

  const defaultResponse = await POST(request());
  expect((await defaultResponse.json()).videos).toHaveLength(10);
  const limitedResponse = await POST(request({ handle: "baxate", limit: 3 }));
  expect((await limitedResponse.json()).videos).toHaveLength(3);
});

test("an empty reels feed is a successful empty result", async () => {
  globalThis.fetch = async () => Response.json({ success: true, items: [] });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ videos: [] });
});

for (const [status, message] of [
  [401, "Invalid ScrapeCreators API key"],
  [402, "ScrapeCreators is out of credits"],
  [404, "Could not load reels for @baxate. ScrapeCreators: upstream error"],
  [429, "ScrapeCreators rate limit exceeded"],
] as const) {
  test(`preserves actionable upstream ${status} errors`, async () => {
    globalThis.fetch = async () => Response.json({ error: "upstream error" }, { status });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect((await response.json()).error).toContain(message);
  });
}

test("keeps the provider's explanation of an unavailable profile", async () => {
  globalThis.fetch = async () => Response.json({
    error: "not_found", message: "Profile is unavailable on Instagram",
  }, { status: 404 });
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect((await response.json()).error).toContain("ScrapeCreators: Profile is unavailable on Instagram");
});

test("does not expose HTML error pages or API keys in provider explanations", async () => {
  globalThis.fetch = async () => new Response("<html>Not found</html>", { status: 404 });
  const htmlResponse = await POST(request());
  expect((await htmlResponse.json()).error).not.toContain("<html>");

  globalThis.fetch = async () => Response.json({ message: "Unknown key test-api-key" }, { status: 404 });
  const keyResponse = await POST(request());
  const error = (await keyResponse.json()).error;
  expect(error).not.toContain("test-api-key");
  expect(error).toContain("[redacted]");
});

test("a missing key is reported without contacting the provider", async () => {
  delete process.env.SCRAPECREATORS_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ items: [] });
  };
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect((await response.json()).error).toContain("SCRAPECREATORS_API_KEY not configured");
  expect(calls).toBe(0);
});
