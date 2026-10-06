# WeText

Share what's on your mind, with your name or anonymously. Find people who share your interests, and talk to them in real time.

## Features

**Writing**
- **Notes**: 500 characters, up to 4 images, polls, hashtags, @mentions, quotes, reposts, threaded replies, and a one-hour edit window.
- **Moods**: tag a note as Glowing, Calm, Curious, Fired up, Tender, Heavy, Silly or Tired. Filter any feed by mood, and see the community's mood pulse.
- **Fading notes**: add an hourglass and the note deletes itself 24 hours after posting.
- **Whispers**: anonymous notes, shown as dark serif cards in their own feed. The server never reveals the author, not even to followers; you see your own whispers in a private tab on your profile.
- **Daily prompt**: one question a day for everyone, with a page of today's answers.

**People**
- **Connect**: a card deck that matches you on interests (60%) and five personality sliders (40%). Each card shows a score, shared interests, and a *vibe check*: per-trait closeness without exposing anyone's raw answers. Keyboard: ← pass, → follow.
- **Vibe check on profiles**: the same comparison appears beside any profile you visit.
- **Profiles**: avatar and banner uploads (re-encoded to WebP, EXIF stripped), bio, location, website, interests, followers/following, "Followed by people you follow".
- **Chats**: realtime over Socket.IO with typing indicators, "Seen", emoji reactions, replies, photos, unsend, mute, a separate requests inbox, and live presence.

**Around the app**
- **Beginner help**: a dismissible Getting-started checklist on Home, a Help sheet (the ? in the top bar) with a plain-language glossary and shortcuts, labelled navigation and composer tools.
- **Command palette** (⌘K / Ctrl+K): jump anywhere, find people and tags, start a note or whisper, toggle dark mode.
- **Discover**: full-text search (SQLite FTS5) across notes, people, tags and media, plus trending tags.
- **Activity**: grouped likes/reposts/follows ("Ana and 3 others liked your note"), mentions and replies, follow requests.
- **Saved**: private bookmarks.
- **Privacy and safety**: private accounts with follow requests, DM policy (everyone / people you follow / no one), hide your online status, mute, block, remove follower.
- **Settings**: username, email, password (signs out other sessions), active sessions, account deletion, and display: three themes (Paper, Dusk, Ink, or match your device), six signal colours, three text sizes.

## Design

WeText uses a "paper and ink" identity: warm paper surfaces with a faint notebook dot grid, ink-coloured type, and one signal colour. Notes are cards in a masonry grid; whispers invert the page. Navigation is a slim top bar plus a floating dock. Fonts (all bundled locally): Bricolage Grotesque for headings, Geist for text, Instrument Serif for whispers and the daily prompt.

## Stack

| Layer | Choice |
| --- | --- |
| Web | React 19, Vite 8, Tailwind CSS 4, React Router 8, TanStack Query 5, Radix primitives, lucide icons, sonner, Fontsource |
| API | Fastify 5, zod validation, Socket.IO 4, sharp |
| Data | SQLite via better-sqlite3 (WAL mode, FTS5 search, migrations versioned with `user_version`) |
| Auth | scrypt password hashes; random session tokens stored as SHA-256 hashes; httpOnly SameSite=Lax cookie |
| Tests | Vitest (API + socket integration) |

The project is an npm workspace with two apps: `apps/server` and `apps/web`.

## Getting started

You need Node 22 or newer.

```bash
npm install
npm run seed      # creates a demo community (wipes the dev DB)
npm run dev       # API on :4000, web on http://localhost:5173
```

Sign in as **demo / wetext123**. All 14 seeded accounts use the password `wetext123`; for example, sign in as `maya_k` in a second browser to test realtime DMs.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the API (tsx watch) and Vite with proxying for `/api`, `/uploads` and `/socket.io` |
| `npm test` | Runs the server test suite (29 tests: auth, posts, privacy, search, matching, moods/prompt/fading/whispers, DMs, sockets, uploads) |
| `npm run typecheck` | Type-checks both apps |
| `npm run build` | Builds the SPA and compiles the server |
| `npm start` | Production: one Node process serves the API, websockets, uploads and the built SPA on `PORT` |

## Configuration

| Env var | Default | Notes |
| --- | --- | --- |
| `PORT` / `HOST` | `4000` / `127.0.0.1` | Set `HOST=0.0.0.0` in containers |
| `DB_FILE` | `apps/server/data/wetext.db` | |
| `UPLOAD_DIR` | `apps/server/uploads` | |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed cross-origin source during development |
| `NODE_ENV` | | `production` enables `Secure` cookies; serve it behind HTTPS |

## Security notes

- Every input is validated with zod. All SQL uses bound parameters, and the FTS query is built from sanitised tokens.
- State-changing requests from a foreign `Origin` are rejected, in addition to the SameSite cookies.
- Login, signup, password and upload endpoints are rate limited. Login takes the same time whether or not the account exists.
- Helmet sets a strict CSP that disallows inline scripts.
- Uploads must be images. They're decoded with a pixel cap, re-encoded, and saved under the uploader's own folder. Posts can only attach the author's own uploads.
- Blocks, private accounts and anonymity (whispers) are enforced on the server for every read path: feeds, threads, search, notifications and DMs.

## Project layout

```
apps/server/src
  app.ts            Fastify setup, session resolution, error handling, static/SPA serving
  db.ts             schema + migrations
  realtime.ts       Socket.IO auth, presence, typing
  routes/           auth, me, users, posts, feed, discover, notifications, messages, uploads
  services/         graph (follows/blocks), posts (hydration), users, matching, notifications
  seed.ts           demo data
apps/server/test    vitest suites
apps/web/src
  components/       design system (ui.tsx), PostCard (notes + whispers), Composer, Layout (top bar + dock), CommandPalette, VibeCheck…
  pages/            Home, Explore (Discover), Connect, Notifications (Activity), Messages (Chats), Profile, Settings…
  lib/              api client, query cache helpers, realtime wiring, prefs
```
