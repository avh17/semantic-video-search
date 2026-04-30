# Semantic Video Search

https://semantic-video-search-rouge.vercel.app/auth/sign-in

Search Instagram Reels and TikToks by what was actually **said** in them — not hashtags, not captions. Paste a video URL, and the app transcribes the audio, embeds the speech semantically, and makes it instantly searchable via natural language.

> Type *"how to fix sourdough that won't rise"* and find the exact video where a creator said those words.

---

## The Problem

Short-form video content is effectively unsearchable. Creators bury useful information in speech, but platforms only index captions and hashtags. If you didn't save the video the moment you saw it, it's gone.

This app solves that by turning spoken audio into a queryable knowledge base — your own private, semantic search index over videos you care about.

---

## How It Works

```
Video URL → Video Extraction → Whisper Transcription → Embedding → Vector Index → Search
```

1. **Select a creator** — Browse Instagram reels from any creator
2. **Video is extracted** via ScrapeCreators API (direct MP4 URL)
3. **OpenAI Whisper** transcribes the speech to text
4. **text-embedding-3-small** converts the transcript into a 1536-dimensional semantic vector
5. **Convex** stores and indexes the embedding with real-time status updates throughout
6. **Search** — type any phrase, embed it the same way, run vector similarity search, get ranked results

---

## Features

- **Semantic search** — finds conceptually similar content, not just exact keyword matches
- **Multi-platform** — supports Instagram Reels and TikTok
- **Real-time pipeline status** — live UI updates as each processing step completes (no polling)
- **Creator organization** — group videos by creator handle with per-creator search filtering
- **Per-user isolation** — all data scoped to the authenticated user; vector search filtered by `userId`
- **Auto-cleanup** — enforces a 10-video limit per user; oldest videos are pruned automatically on ingest

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Convex (serverless functions, real-time DB, vector index, file storage) |
| Transcription | OpenAI Whisper (`whisper-1`) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) |
| Video Extraction | ScrapeCreators API (pay-as-you-go, 1 credit per video) |
| Auth | httpOnly cookie session (email + name, 7-day TTL) |

---

## Architecture

### Ingestion Pipeline

```
1. Extract video URL    →  ScrapeCreators API → direct MP4 download link
2. Proxy & upload       →  /api/proxy-media → Convex storage (temp file)
3. Create video record  →  processingStatus: "pending"
4. Transcribe           →  OpenAI Whisper → fullText
5. Extract preview      →  first two sentences from fullText
6. Embed                →  OpenAI embeddings API → float64[1536]
7. Store transcript     →  Convex: fullText + embedding + metadata
8. Cleanup              →  delete temp video file from Convex storage
```

Each step updates `processingStatus` in Convex. The frontend subscribes via `useQuery` hooks, so status changes propagate to the UI in real time without a single polling call.

### Vector Search

```
Query text
  → text-embedding-3-small → 1536-dim vector
  → Convex vectorSearch on transcripts table
  → filtered by userId (+ optional creatorId list)
  → top 10 results ranked by cosine similarity
  → return: creator handle, platform, similarity score, transcript preview, original URL
```

### Database Schema (Convex)

```
users         — id, email, name, createdAt
creators      — userId, platform, handle, displayName, isActive
videos        — creatorId, userId, videoUrl, processingStatus, durationSeconds, ...
transcripts   — videoId, userId, fullText, firstTwoSentences, embedding (float64[1536]),
                confidenceScore, languageDetected
                └── vector index on embedding, filterFields: [userId]
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Convex](https://convex.dev) account
- OpenAI API key
- [ScrapeCreators](https://app.scrapecreators.com) API key (100 free credits, then $10 for 5,000)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/avh17/search-brainrot
cd search-brainrot
npm install

# 2. Configure environment variables
cp .env.local.example .env.local
# Fill in: CONVEX_DEPLOYMENT, NEXT_PUBLIC_CONVEX_URL, OPENAI_API_KEY, NEXT_PUBLIC_APP_URL

# 3. Deploy Convex schema and functions
npx convex dev

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

```env
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
OPENAI_API_KEY=
NEXT_PUBLIC_OPENAI_API_KEY=
SCRAPECREATORS_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SCRAPECREATORS_API_KEY` now powers both the reel browser and the direct video downloader. If it's missing, creators/search pages will display clear errors instead of hitting RapidAPI.

---

## App Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/auth/sign-in` | Email + name sign-in |
| `/dashboard` | Stats: total creators, videos, processing queue |
| `/dashboard/creators` | Add / manage creators by platform and handle |
| `/dashboard/search` | Add videos, search transcripts, view results |

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/signin` | POST | Create session cookie, upsert user in Convex |
| `/api/auth/signout` | POST | Clear session cookie |
| `/api/fetch-creator-videos` | POST | Use ScrapeCreators to list a creator’s latest reels |
| `/api/extract-instagram-video` | POST | Extract direct video URL from Instagram reel (ScrapeCreators) |
| `/api/proxy-media` | POST | Fetch video via server-side proxy to avoid CORS |

---

## Design Decisions

**Why Convex instead of a traditional backend?**
Convex's reactive query model means processing status updates flow to the UI the moment they change in the database — no websocket setup, no polling endpoints, no additional infrastructure.

**Why embed only the first two sentences?**
Short-form video creators front-load the core topic. Embedding the full transcript introduces noise from filler speech and tangents. The first two sentences yield higher-precision search results with lower embedding cost.

**Why a 10-video hard limit?**
This is a cost-control guardrail. Each video ingestion costs ~$0.006 in OpenAI API calls (Whisper + embeddings). The limit keeps the app sustainable for personal use without rate-limit surprises.

---

## Limitations

- Requires publicly accessible Instagram reels (private/authenticated content is not supported)
- Video extraction depends on ScrapeCreators API availability
- Whisper accuracy varies with background music, heavy accents, and low-quality audio
- ScrapeCreators cost: 1 credit per video extraction (100 free, then $10 for 5,000 credits)
