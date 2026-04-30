# Semantic Video Search

Search Instagram reels by what was said in the video.

This app fetches a creator's reels, transcribes them with OpenAI Whisper, stores the transcript and embedding in Convex, and lets you search or ask questions against that content.

## What it does

- Browse recent reels for a creator
- Transcribe reels into searchable text
- Search by keyword or meaning
- Ask questions and get answers with source videos
- Keep video and transcript data scoped to the signed-in user

## Stack

- Next.js
- Convex
- OpenAI Whisper
- OpenAI embeddings
- ScrapeCreators

## Local setup

```bash
git clone https://github.com/avh17/semantic-video-search.git
cd semantic-video-search
npm install
cp .env.local.example .env.local
npx convex dev
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Set these in `.env.local` for local development and in Vercel for deployment.

```env
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=
OPENAI_API_KEY=
NEXT_PUBLIC_OPENAI_API_KEY=
SCRAPECREATORS_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Required

- `NEXT_PUBLIC_CONVEX_URL`
- `OPENAI_API_KEY`
- `SCRAPECREATORS_API_KEY`

### Currently used by the client

- `NEXT_PUBLIC_OPENAI_API_KEY`

The search page currently passes this key from the browser when starting transcription. That works, but it is not ideal for a public production app.

## Main commands

```bash
npm run dev
npx convex dev
npm run build
npm run lint
```

## Main routes

- `/`
- `/auth/sign-in`
- `/dashboard`
- `/dashboard/creators`
- `/dashboard/search`
- `/dashboard/debug`

## Deployment

For Vercel:

- Framework preset: `Next.js`
- Root directory: `./`
- Build, install, and output settings: leave as defaults
- Add the same environment variables listed above
- Set `NEXT_PUBLIC_APP_URL` to your deployed Vercel URL

## Notes

- The creator reel browser currently supports Instagram
- Search quality depends on transcript quality
- Failed ingests will not be searchable until they are retried successfully
