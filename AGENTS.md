# Repository Guidelines

## Project Structure & Module Organization
- `src/app` hosts App Router code: layout/globals, dashboard routes, and API handlers like `/api/auth/*`, `/api/proxy-media`, and `/api/extract-instagram-video`.
- `src/components` covers shadcn primitives (`components/ui/*`), `VideoCard`, and shared providers (`convex-client-provider`, `session-provider`).
- `src/lib` holds shared utilities (`convex.ts`, `session.ts`, `utils.ts`), while `convex/` contains every schema, query, mutation, and helper (`ingest.ts`, `search.ts`, `cleanup.ts`, etc.).
- Static assets live in `public/`; root configs (`eslint.config.mjs`, `next.config.ts`, `tsconfig*.json`, `components.json`) keep tooling aligned.

## Build, Test, and Development Commands
- `npx convex dev` starts the Convex dev deployment, applies schema updates, and reloads functions.
- `npm run dev` launches Next.js on port 3000; run it alongside Convex.
- `npm run build` creates the production bundle; `npm start` serves it for smoke testing.
- `npm run lint` runs ESLint (Next config) and should be clean before opening a PR.

## Coding Style & Naming Conventions
- TypeScript + React function components, two-space indentation, PascalCase component filenames, camelCase helpers/hooks.
- Prefer Tailwind utilities in `globals.css` and extend shadcn primitives.
- Keep Convex queries deterministic; factor common logic into `convex/*Helpers.ts` and update `convex/schema.ts` with every table or index change.
- ESLint controls import order, hook usage, and accessibility checks—run it frequently.

## Testing Guidelines
- Automated tests are absent, so document manual QA in each PR (ingest, search, cleanup).
- When adding automated coverage, place UI specs in `src/__tests__` (Vitest + @testing-library/react) and keep helper tests beside their modules.
- Extract deterministic Convex logic into helper modules so it can be tested without a running deployment.

## Commit & Pull Request Guidelines
- Follow the existing log style: imperative subjects with optional `feat:`, `fix:`, or `chore:` prefixes plus brief context when needed.
- Keep PRs scoped, list affected routes or Convex modules, and attach screenshots or logs for UX/ingestion tweaks.
- Before requesting review run `npm run lint && npm run build` and note any follow-up work in the PR description.

## External APIs & Configuration
- Populate `.env.local` with `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `OPENAI_API_KEY`, `NEXT_PUBLIC_OPENAI_API_KEY`, and `NEXT_PUBLIC_APP_URL`; never commit the file.
- Instagram browsing now uses the ScrapeCreators profile API via `/api/fetch-creator-videos`, so the only required key is `SCRAPECREATORS_API_KEY`. Per the docs, always send the creator `handle` (no `@`) and request the `clips` section to grab the top ~10 reels. Missing keys bubble clear errors in the creators/search pages to avoid silent failures.
- Direct reel downloads use ScrapeCreators via `/api/extract-instagram-video`; set `SCRAPECREATORS_API_KEY` to avoid 401/500 responses during ingestion.
- Convex tables/indexes must filter on `userId`; keep that guardrail for any new data to prevent cross-user transcript leaks.
