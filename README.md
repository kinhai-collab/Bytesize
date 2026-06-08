# Bytesize

AI-powered YouTube video summarization app.

## Source Status

This branch syncs GitHub with the current Replit project export from `Video Summarizer`.

Live Replit app: https://video-summarizer.replit.app

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local `.env` from `.env.example` and fill in the required values:

```bash
cp .env.example .env
```

Required for the main app:

- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `RAPIDAPI_KEY`
- `YOUTUBE_API_KEY`

Required for audio/image integration routes:

- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`

Optional/Replit integration values:

- `AI_INTEGRATIONS_ANTHROPIC_API_KEY`
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`
- `SESSION_SECRET`

3. Sync the database schema:

```bash
npm run db:push
```

4. Run the app:

```bash
npm run dev
```

The Replit config runs the app on port `5000`.
