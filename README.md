# YouTube Playlist Manager

A Next.js app that signs in with your Google account, pulls your YouTube playlists, and helps organize them into categories (with AI-assisted categorization and rename detection via OpenAI).

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and fill in real values:

```bash
cp .env.example .env.local
```

You'll need:

- **Google OAuth credentials** — create an OAuth 2.0 Client ID in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), enable the **YouTube Data API v3** for the project, and add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI (add your production callback URL too, once deployed).
- **NEXTAUTH_SECRET** — generate one with `openssl rand -base64 32`.
- **OPENAI_API_KEY** — from [platform.openai.com](https://platform.openai.com/api-keys). Used for playlist categorization and title-similarity checks.
- **RATE_LIMIT_*** (optional) — throttles the "recategorize"/"refresh" actions per user. Disabled by default.

See `.env.example` for the full list and details.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- User preferences (playlist-to-category assignments, locks, etc.) are stored per-user as JSON files under `data/preferences/`, keyed by a SHA-256 hash of the user's email — this directory is gitignored and created automatically at runtime.
- The Google OAuth access token is kept server-side only (inside the encrypted NextAuth JWT) and is never sent to the browser.
