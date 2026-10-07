<div align="center">

<img src="apps/web/public/favicon.svg" alt="WeText logo" width="80" height="80" />

# WeText

**Say what's on your mind, with your name or without it.**
**Find people who think like you, then talk in real time.**

![Node](https://img.shields.io/badge/node-%E2%89%A522-3c873a)
![TypeScript](https://img.shields.io/badge/typescript-strict-3178c6)
![React](https://img.shields.io/badge/react-19-149eca)
![Fastify](https://img.shields.io/badge/fastify-5-000000)
![SQLite](https://img.shields.io/badge/sqlite%2FTurso-FTS5-003b57)
![Tests](https://img.shields.io/badge/tests-45%20passing-2ea44f)

[Features](#features) · [Quick start](#quick-start) · [Architecture](#architecture) · [API](#api-overview) · [Security](#security) · [Deployment](#deployment)

</div>

---

## Contents

- [About](#about)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API overview](#api-overview)
- [Real-time events](#real-time-events)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## About

WeText is a full-stack social platform built around short **notes**, anonymous **whispers** and real-time **chat**. It pairs a microblog-style feed with an interest and personality based matching system called **Connect**, so you can meet people you are likely to get along with, not only follow people you already know.

The interface follows a "paper and ink" design language: warm paper surfaces, ink-coloured type, one signal colour you choose, and a floating dock for navigation. It ships with three themes (Paper, Dusk, Ink) and six accent colours, and is designed to be understandable on first visit.

## Features

### Writing

| Feature | Details |
| --- | --- |
| Notes | Up to 500 characters, 4 images, polls, hashtags, @mentions, quotes, reposts, threaded replies, one-hour edit window |
| Moods | Tag a note (Glowing, Calm, Curious, Fired up, Tender, Heavy, Silly, Tired), filter feeds by mood, see the community mood pulse |
| Fading notes | Notes that delete themselves 24 hours after posting |
| Whispers | Anonymous notes shown as dark serif cards. The server never exposes the author, not even to followers |
| Daily prompt | One shared question per day, with a page of everyone's answers |

### People

| Feature | Details |
| --- | --- |
| Connect | A card deck matching you on interests (60%) and five personality sliders (40%). Keyboard: `←` pass, `→` follow |
| Vibe check | Per-trait closeness between you and another user, without revealing their raw answers |
| Profiles | Avatar and banner upload, bio, location, website, interests, mutual followers |
| Chats | Typing indicators, seen receipts, emoji reactions, replies, photos, unsend, mute, a separate requests inbox and live presence |

### Around the app

- **Discover**: full-text search (SQLite FTS5) across notes, people, tags and media, plus trending tags.
- **Activity**: grouped notifications ("Ana and 3 others liked your note"), mentions, replies and follow requests.
- **Saved**: private bookmarks.
- **Command palette** (`Ctrl/⌘ + K`): jump anywhere, find people and tags, start a note or whisper, switch theme.
- **Beginner friendly**: a dismissible getting-started checklist, a Help sheet with a plain-language glossary, and labelled navigation and tools.
- **Privacy controls**: private accounts with follow requests, DM policy (everyone, people you follow, no one), hidden online status, mute, block and remove follower.
- **Settings**: username, email, password (signs out other sessions), active sessions, account deletion, themes, accent colours and text size.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web | React 19, Vite 8, Tailwind CSS 4, React Router 8, TanStack Query 5, Radix UI primitives, lucide icons, sonner |
| API | Fastify 5, zod, Socket.IO 4, sharp, @libsql/client |
| Data | SQLite-compatible libSQL: a local file in development, [Turso](https://turso.tech) (hosted, free tier) in production. FTS5 search, versioned migrations, photos stored in the database |
| Auth | scrypt password hashes, random session tokens stored as SHA-256 hashes, httpOnly `SameSite=Lax` cookie |
| Tests | Vitest (API and socket integration tests) |
| Fonts | Bricolage Grotesque, Geist and Instrument Serif, bundled locally with Fontsource |

## Quick start

**Prerequisites:** Node.js 22 or newer, and npm.

```bash
git clone https://github.com/shahidthisside/WeText.git
cd WeText
npm install
npm run dev      # API on :4000, web app on :5173
```

Open <http://localhost:5173> and create an account. The database starts empty and is created automatically on first run, so there is no sample data: the first people to sign up are the first people on the platform. To try real-time chat locally, create two accounts in two different browser profiles (or one normal and one private window).

## Scripts

Run these from the repository root.

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the API (tsx watch) and Vite, proxying `/api`, `/uploads` and `/socket.io` |
| `npm run build` | Builds the web app and compiles the server |
| `npm start` | Production: one Node process serves the API, websockets, uploads and the built app |
| `npm test` | Runs the server test suite (45 tests) |
| `npm run typecheck` | Type-checks both workspaces |

## Configuration

All settings are optional environment variables read by the server. Defaults work for local development.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `apps/server/data/wetext.db` | A local file path, or a Turso URL such as `libsql://name-org.turso.io` |
| `DATABASE_AUTH_TOKEN` | | Turso access token (only for remote databases) |
| `PUBLIC_URL` | | Public address of the site, used in password-reset emails. Required in production |
| `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | | Password-reset email through Brevo's free plan. Without them the reset link is printed in the server log |
| `PORT` | `4000` | HTTP port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` in containers and on hosts like Render |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed browser origin in development |
| `PHOTO_QUOTA_MB` | `150` | Photo storage allowed per account |
| `NODE_ENV` | | `production` enables `Secure` cookies, so serve over HTTPS |

A ready-to-copy list is in `.env.example`.

Fixed limits: sessions last 30 days, uploads are capped at 8 MB, and stored photos are recompressed to stay under 3.5 MB.

## Architecture

```
WeText
├── apps
│   ├── server                 Fastify API, Socket.IO, SQLite
│   │   ├── src
│   │   │   ├── app.ts         App factory: security headers, sessions, CSRF guard, SPA serving
│   │   │   ├── db.ts          Async libSQL adapter, schema, FTS5 index and versioned migrations
│   │   │   ├── realtime.ts    Socket.IO auth, presence and typing
│   │   │   ├── routes/        HTTP handlers: auth, me, users, posts, feed, discover,
│   │   │   │                  notifications, messages, uploads
│   │   │   ├── services/      Business logic: graph, posts, users, matching, notifications
│   │   └── test/              Vitest integration suites
│   └── web                    React single-page app
│       └── src
│           ├── components/    Design system, cards, composer, layout, command palette
│           ├── pages/         Home, Discover, Connect, Chats, Activity, Profile, Settings...
│           └── lib/           API client, cache helpers, realtime wiring, preferences
└── package.json               npm workspace root
```

Routes stay thin and hand off to services. Every read path (feeds, threads, search, notifications, messages) goes through the same visibility rules in `services/graph.ts`, so blocks, private accounts and whisper anonymity are enforced in one place. In production a single Node process serves the API, websockets, uploaded images and the built web app.

## API overview

All endpoints are JSON under `/api` and use the session cookie. This is a summary, not a full reference.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `GET /auth/username-available` · `POST /auth/forgot` · `POST /auth/reset-password` |
| Account | `PATCH /me` · `POST /me/username` · `POST /auth/password` · `POST /auth/email` · `GET /auth/sessions` · `POST /auth/delete-account` · `GET /me/bookmarks` · `GET /me/blocks` · `GET /me/mutes` |
| Posts | `POST /posts` · `GET /posts/:id` · `PATCH /posts/:id` · `DELETE /posts/:id` · `GET /posts/:id/replies` · `POST /posts/:id/vote` |
| Feeds | `GET /feed/foryou` · `GET /feed/following` · `GET /feed/whispers` · `GET /feed/pulse` · `GET /feed/prompt` |
| People | `GET /users/:username` · `POST /users/:username/follow` · `GET /users/:username/vibe` · `POST /users/:username/block` · `POST /users/:username/mute` |
| Discover | `GET /search` · `GET /trending` · `GET /suggestions` · `GET /connect` · `POST /connect/:userId/pass` · `GET /tags/:tag` |
| Notifications | `GET /notifications` · `POST /notifications/read` · `GET /me/counts` · `GET /me/follow-requests` · `POST /me/follow-requests/:userId/:action` |
| Chats | `GET /conversations` · `POST /conversations` · `GET /conversations/:id/messages` · `POST /conversations/:id/read` · `PUT /messages/:id/reaction` · `DELETE /messages/:id` |
| Uploads | `POST /uploads` (images only, re-encoded to WebP) |

Errors use a consistent shape: `{ "error": "Human-readable message", "code": "machine_code" }`.

## Real-time events

Socket.IO authenticates with the same session cookie. The server pushes these events to the relevant user's room:

| Event | Payload |
| --- | --- |
| `message:new` · `message:updated` | The message after it was sent, reacted to or unsent |
| `conversation:read` | Who read a conversation, used for seen receipts |
| `presence` · `presence:snapshot` | Online state for people you are watching (respects the hide-online-status setting) |
| `typing` | Sent by the client while composing, relayed to the other participant |

## Security

- All input is validated with zod. SQL uses bound parameters only, and the full-text query is built from sanitised tokens.
- State-changing requests from a foreign `Origin` are rejected, in addition to `SameSite` cookies.
- Login, signup, password and upload endpoints are rate limited. Login takes the same time whether or not the account exists.
- Helmet applies a strict Content Security Policy with no inline scripts.
- Uploads must be images. They are decoded with a pixel limit, re-encoded to WebP (which strips EXIF data) and stored in the database under the uploader's id, with a per-account storage cap. Posts can only attach the author's own uploads.
- Blocks, private accounts and whisper anonymity are enforced on the server for every read path. Whisper authors are never returned by the API.
- Session tokens are stored as SHA-256 hashes, and changing your password signs out every other session.

## Testing

```bash
npm test
```

45 integration tests cover authentication, post visibility and privacy rules, search, matching, moods, prompts, fading notes, whispers, direct messages, socket events and uploads. They run against a temporary database and need no setup. Set `TEST_DATABASE_URL=http://127.0.0.1:8080` to run them against a real libSQL server instead (for example `docker run -p 8080:8080 ghcr.io/tursodatabase/libsql-server`).

## Deployment

WeText keeps **no state on the server**: users, posts, messages and photos all live in the database. That means the app can run on a free host that sleeps, restarts or wipes its disk, as long as the database is hosted somewhere durable. The recommended zero-cost setup needs **no credit card**:

| Piece | Service | Why |
| --- | --- | --- |
| Database and photos | [Turso](https://turso.tech) free plan | Hosted SQLite (about 5 GB free), no card |
| Web app, API, websockets | [Render](https://render.com) free web service | Runs the Node server, no card. It sleeps after 15 minutes of no traffic and wakes in 30 to 50 seconds |
| Password-reset email | [Brevo](https://www.brevo.com) free plan | 300 emails a day. Optional |

Choose the same region for Turso and Render (for example both in the US east or both in Europe) so database queries stay fast.

### 1. Create the database (Turso)

1. Sign up at <https://turso.tech> with GitHub.
2. Create a database (any name, for example `wetext`) in the region closest to your Render region.
3. Copy its URL (`libsql://wetext-yourname.turso.io`).
4. Create a token: database page, "Create token" (read and write). Copy it.

The schema is created automatically the first time the server starts.

### 2. Deploy the app (Render)

1. Push this repository to GitHub.
2. In Render choose New, then Blueprint, and select the repository. Render reads `render.yaml`.
3. When asked, enter:
   - `DATABASE_URL`: the Turso URL
   - `DATABASE_AUTH_TOKEN`: the Turso token
   - `PUBLIC_URL`: `https://wetext.onrender.com` (use the address Render shows for your service, without a trailing slash)
   - `BREVO_API_KEY` and `MAIL_FROM`: optional, see below
4. Wait for the build, then open the service address and create the first account.

### 3. Password-reset email (Brevo, optional)

1. Sign up at <https://www.brevo.com>, then verify a sender address (Senders, domains and dedicated IPs, Senders).
2. Create an API key (SMTP and API, API keys).
3. In Render, set `BREVO_API_KEY` to the key and `MAIL_FROM` to the verified sender address, then redeploy.

Mail from a free address such as Gmail can land in spam; a custom domain delivers better. Without these settings everything else works, but "Forgot password" cannot send email.

### 4. Keep it awake (UptimeRobot, optional)

Render's free service sleeps after 15 minutes without visitors. A free uptime monitor that visits the site every few minutes keeps it awake, so nobody waits for a cold start.

1. Sign up at <https://uptimerobot.com> (free plan).
2. Add New Monitor: type "HTTP(s)", friendly name `WeText`, URL `https://<your-service>.onrender.com/api/health`.
3. Set the monitoring interval to 5 minutes (the free plan's shortest) and save. UptimeRobot can also email you if the site ever goes down.

Check Render's current free-tier terms: if they ever change how idle services or monthly hours work, the monitor may need adjusting.

### Good to know

- **Cold starts.** Without the UptimeRobot monitor, the free Render service sleeps after 15 idle minutes and the next visit takes 30 to 50 seconds to wake. Either way no data is lost, because it lives in Turso.
- **Realtime chat** works while the service is awake. Messages are always saved, so anyone who opens the app later sees them.
- **Limits.** Turso's free plan has monthly read and write allowances that are far above what a small community uses. Each account may store 150 MB of photos by default.
- **Backups.** Turso keeps your data durable; for an extra copy, `turso db shell wetext .dump > backup.sql`.
- **One instance.** Realtime state (who is online, typing) lives in memory, so run a single instance.

### Other ways to run it

**Your own server or VM.** One Node process plus a local SQLite file works too. The `deploy/` folder has a script for an Ubuntu VM (Caddy for HTTPS, a systemd service, nightly backups):

```bash
git clone https://github.com/shahidthisside/WeText.git
sudo bash WeText/deploy/setup.sh your-domain.example
```

**Any Node host.**

```bash
npm install
npm run build
NODE_ENV=production HOST=0.0.0.0 PORT=4000 DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... PUBLIC_URL=https://your.site npm start
```

Put it behind an HTTPS reverse proxy: production cookies are `Secure`, so plain HTTP will not keep you signed in. Serverless platforms (Vercel, Netlify) are not a fit, because the server holds long-lived websocket connections.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm install` fails on a native module | Use Node 22 or newer. The database client and image library ship prebuilt binaries for macOS, Linux and Windows |
| Port 4000 or 5173 is already in use | Stop the other process, or set `PORT` for the API |
| Signed in but immediately signed out in production | You are serving over plain HTTP. Use HTTPS, since production cookies are `Secure` |
| Start over with an empty local database | Stop the dev server and delete `apps/server/data` |
| Realtime chat does not update | Check that your proxy forwards WebSocket upgrades on `/socket.io`. On Render's free plan the service may be asleep: reload and wait for it to wake |
| Password-reset emails never arrive | Check `BREVO_API_KEY`, that `MAIL_FROM` is a sender verified in Brevo, and your spam folder. The server log shows Brevo's error |

## Contributing

Issues and pull requests are welcome. Before opening a PR, run `npm run typecheck` and `npm test`, and keep changes focused on one thing at a time.

## License

No license has been chosen yet, so all rights are reserved by default. Add a `LICENSE` file to change that.
