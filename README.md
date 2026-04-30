# Semantic Video Search

Search Instagram reels by what was said in the video.

This app fetches a creator's reels, transcribes them with OpenAI Whisper, stores the transcript and embedding in Convex, and lets you search or ask questions against that content.

## What it does

- Browse recent reels for a creator
- Transcribe reels into searchable text
- Search by keyword or meaning
- Ask questions and get answers with source videos
- Keep video and transcript data scoped to the signed-in user

  <img width="2700" height="1050" alt="image" src="https://github.com/user-attachments/assets/69d69c1a-98c8-4b91-b280-40525f107d8e" />
  <img width="2700" height="1610" alt="image" src="https://github.com/user-attachments/assets/d2427a09-8104-4856-9f08-442233dfc265" />

## Stack

- Next.js
- Convex
- OpenAI Whisper
- OpenAI embeddings
- ScrapeCreators

## Main routes

- `/`
- `/auth/sign-in`
- `/dashboard`
- `/dashboard/creators`
- `/dashboard/search`
- `/dashboard/debug`

## Notes

- The creator reel browser currently supports Instagram
- Search quality depends on transcript quality
- Failed ingests will not be searchable until they are retried successfully
