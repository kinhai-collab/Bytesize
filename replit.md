# Bytesize - AI Video Summarization

## Overview

Bytesize is a full-stack web application that summarizes YouTube videos using AI. Users paste a YouTube URL, the backend fetches the video transcript, sends it to Anthropic's Claude API for summarization, and displays the results. The app features a modern, polished UI with video playback, transcript viewing, and AI-generated summaries.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router) with two main routes: Home (`/`) and VideoDetail (`/video/:id`)
- **State Management**: TanStack React Query for server state (fetching, caching, mutations)
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives with Tailwind CSS
- **Animations**: Framer Motion for page transitions and micro-interactions
- **Video Playback**: react-player for embedding YouTube videos
- **Typography**: Outfit for headings (font-display), DM Sans for body text (font-sans)
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend
- **Framework**: Express.js running on Node.js with TypeScript (tsx for dev, esbuild for production)
- **API Design**: RESTful API under `/api/videos` with typed route definitions in `shared/routes.ts` using Zod schemas
- **AI Integration**: Anthropic Claude SDK for generating video summaries from transcripts
- **Transcript Extraction**: `youtube-transcript` package to fetch YouTube video transcripts
- **Development**: Vite dev server with HMR proxied through Express; production serves static built files

### Data Storage
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` — main table is `videos` with fields: id, url, title, thumbnailUrl, transcript, summary, processed, createdAt
- **Migrations**: Drizzle Kit with `drizzle-kit push` for schema syncing
- **Storage Pattern**: `IStorage` interface in `server/storage.ts` with `DatabaseStorage` implementation

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/videos` | List all videos, ordered by newest |
| POST | `/api/videos` | Submit a YouTube URL for processing |
| GET | `/api/videos/:id` | Get a single video with its summary |
| DELETE | `/api/videos/:id` | Delete a video |

### Shared Code
- `shared/schema.ts` — Drizzle table definitions and Zod insert schemas
- `shared/routes.ts` — API route definitions with Zod validation for inputs and responses, used by both client and server
- `shared/models/chat.ts` — Additional schema for conversations/messages (from Replit integrations)

### Replit Integrations
The project includes pre-built integration modules under `server/replit_integrations/` and `client/replit_integrations/`:
- **Chat**: Anthropic-powered conversation system with persistent storage
- **Audio**: Voice recording, playback, and speech-to-text via OpenAI
- **Image**: Image generation via OpenAI's gpt-image-1
- **Batch**: Rate-limited batch processing utilities

These are scaffolded but not all actively wired into the main application routes.

### Build System
- **Dev**: `tsx server/index.ts` runs the server with Vite middleware for HMR
- **Build**: Custom `script/build.ts` that runs Vite build for client and esbuild for server, outputting to `dist/`
- **Production**: `node dist/index.cjs` serves the built client as static files

## External Dependencies

### Required Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Anthropic API key for Claude summarization
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Anthropic API base URL (Replit proxy)
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI API key (for audio/image integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI API base URL (for audio/image integrations)

### Key Third-Party Services
- **PostgreSQL** — Primary database, provisioned via Replit
- **Anthropic Claude** — AI summarization of video transcripts
- **YouTube** — Source for video URLs and transcript extraction
- **OpenAI** — Used by optional audio (speech-to-text, text-to-speech) and image generation integrations

### Major NPM Dependencies
- `express` — HTTP server
- `drizzle-orm` / `drizzle-kit` — Database ORM and migration tooling
- `@anthropic-ai/sdk` — Anthropic Claude API client
- `youtube-transcript` — YouTube transcript fetching
- `react`, `react-dom` — UI framework
- `@tanstack/react-query` — Async state management
- `wouter` — Client-side routing
- `framer-motion` — Animations
- `react-player` — YouTube video embedding
- `zod` — Schema validation (shared between client and server)
- `tailwindcss` — Utility-first CSS
- `connect-pg-simple` — PostgreSQL session store (available but not actively used for auth)