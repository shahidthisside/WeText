<div align="center">

<img src="apps/web/public/favicon.svg" alt="WeText logo" width="80" height="80" />

# WeText

**Say what's on your mind, with your name or without it.**
**Find people who think like you, then talk in real time.**

![Node](https://img.shields.io/badge/node-%E2%89%A522-3c873a)
![TypeScript](https://img.shields.io/badge/typescript-strict-3178c6)
![React](https://img.shields.io/badge/react-19-149eca)
![Fastify](https://img.shields.io/badge/fastify-5-000000)
![libSQL](https://img.shields.io/badge/sqlite%2FTurso-FTS5-003b57)
![Tests](https://img.shields.io/badge/tests-224%20passing-2ea44f)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red)](LICENSE)

[Live site](https://wetextapp.onrender.com) · [Features](#features) · [Quick start](#quick-start) · [Architecture](#architecture) · [API](#api-overview) · [Security](#security) · [Deployment](#deployment)

</div>

> **Proprietary software. All rights reserved.** The source code is published so it can be read. It may not be copied, modified, renamed, re-skinned, built, hosted, redistributed, or used to train or prompt AI models. See [LICENSE](LICENSE).

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

The interface follows a "paper and ink" design language: warm paper surfaces, ink-coloured type, one signal colour you choose, and a floating dock for navigation. It ships with three themes (Paper, Dusk, Ink) plus an option that follows your device, six accent colours, and is designed to be understandable on first visit.

The app keeps **no state on the server**. Accounts, posts, messages and photos all live in a SQLite-compatible database (a local file in development, [Turso](https://turso.tech) in production), so it runs comfortably on free hosting. A running instance is at <https://wetextapp.onrender.com>.

## Features

### Writing

| Feature | Details |
| --- | --- |
| Notes | Up to 500 characters, up to 4 photos, polls (2 to 4 options, open for 1 hour to 7 days), hashtags, @mentions, quotes, reposts, threaded replies, an edit window of one hour after posting, and a public edit history: click "edited" on a note to see every earlier version |
| Moods | Tag a note (Glowing, Calm, Curious, Fired up, Tender, Heavy, Silly, Tired), filter feeds by mood, and see the community mood pulse |
| Fading notes | Notes that delete themselves 24 hours after posting |
| Whispers | Anonymous notes shown as dark serif cards. The server never returns the author of a whisper, not even to the people who follow them |
| Daily prompt | One shared question per day, with a page of everyone's answers |

### People

| Feature | Details |
| --- | --- |
| Connect | A card deck matching you on interests (60%) and five personality sliders (40%): homebody or social, night owl or early bird, practical or imaginative, planner or spontaneous, listener or talker. Keyboard: `←` pass, `→` follow |
| Vibe check | Per-trait closeness between you and another person, without revealing their raw answers |
| Profiles | Avatar and banner, bio, location, website, interests, mutual followers, and followers and following lists |
| Chats | Full-screen, app-like chat on phones (a two-pane layout on desktop). Text, photos (several at once, with captions, paste or drag and drop), **voice messages** (record, play, 1x/1.5x/2x speed), and **notes shared into a chat**. Reply, **edit** (15 minutes), **forward** (up to 5 chats), **star**, copy, message info, 8 emoji reactions, **unsend for everyone** or **delete for me**. Pin (up to 3), archive, mute and mark as unread; in-chat search and a shared media gallery; **disappearing messages** (24 hours, 7 days or 90 days); per-chat drafts, typing and recording indicators, sent/seen receipts, unread dividers, a requests inbox for people you do not follow, and live presence. **Voice and video calls** (see below). **Group chats** of up to 50 people: a name, admins and members, system lines ("Ana added Ben"), sender names, "Seen by", people added later only see messages from when they joined, and every message feature above works in groups |

### Calls

One-to-one **voice and video calls** from the header of any chat, built to hold up on a poor connection.

| Feature | Details |
| --- | --- |
| Making and answering | Ringing on every open tab or phone, with a ringtone, a buzz and a flashing tab title. Answer in one place and the others stop. Two people calling each other at the same moment end up in one call. A video call can be answered with **voice only** |
| In the call | Mute, camera on and off (a voice call can add video later), flip camera, a timer, a connection-quality indicator, and a **Save data** button that switches both sides to voice only. Minimise the call to a small bar and keep using the app. The other person sees when you are muted, reconnecting or have a weak connection |
| Weak internet | The connection is measured every two seconds. When it gets worse the picture steps down (800 → 450 → 220 → 90 kbit/s, with a smaller frame and fewer frames a second), and if even the smallest picture does not fit, video pauses so the voice stays clear. It comes back by itself when the connection improves. The voice has priority, uses a small codec setting (mono, loss repair, silence not sent) and gets leaner still when things are bad. A dropped connection is repaired by restarting the search for a route, again and again, for up to 40 seconds, and a brief loss of the app's own connection does not end the call. On a slow or data-saving connection the call starts small |
| In the chat | Every call is written into the chat: "Outgoing video call · 2:31", "Missed voice call" (in red), "Declined", "Cancelled", "No answer", "Line busy", each with a **Call back** button. Missed calls count as unread; finished ones do not. Chats with disappearing messages apply the same timer to call lines |
| Who can call | One-to-one chats only. Not if either of you has blocked the other, and not unless the person called follows you or has already replied in the chat, so a stranger cannot ring you. Blocking someone ends a live call. People who hide their online status are rung silently and never reveal whether they are online |
| Reliability | Unanswered calls give up after 45 seconds. A closed or reloaded page ends its call within seconds, not minutes. One call at a time per person, with a limit on how fast someone can ring |

Sound and picture travel **directly between the two phones** (WebRTC, encrypted), not through your server, so the free host carries only the ringing and set-up messages. Roughly one call in seven cannot connect directly (strict office or mobile networks) and needs a relay; see `TURN_*` settings below. Calls need HTTPS (or `localhost`), a microphone, and a current browser.

### Around the app

- **Discover**: full-text search (SQLite FTS5) across notes, people, tags and media, plus trending tags.
- **Activity**: grouped notifications ("Ana and 3 others liked your note"), mentions, replies and follow requests.
- **Saved**: private bookmarks.
- **Command palette** (`Ctrl/⌘ + K`): jump anywhere, find people and tags, start a note or whisper, and switch theme.
- **Beginner friendly**: a dismissible getting-started checklist, a Help sheet with a plain-language glossary and shortcuts, labelled navigation and tools, and an invite button that copies or shares the site link.
- **Privacy controls**: private accounts with follow requests, a DM policy (everyone, people you follow, or no one), hidden online status, and mute, block and remove follower.
- **Accounts**: sign up with email and password, sign in with username or email, and reset a forgotten password by email.
- **Safety and control**: report a note or a person, download all your data as JSON, and block, mute or remove followers. The site owner can review reports through an admin-only endpoint.
- **Everyday polish**: alt text for photos, drafts that survive a reload, a "new notes" pill and pull to refresh, per-page titles, an offline banner, friendly error screens, and an installable web app manifest.
- **Settings**: username, email, password (signs out other sessions), active sessions, download your data, account deletion, themes, accent colours and text size.

## Tech stack

| Layer | Technology |
| --- | --- |
| Web | React 19, Vite 8, Tailwind CSS 4, React Router 8, TanStack Query 5, Radix UI primitives, lucide icons, sonner |
| API | Fastify 5, zod, Socket.IO 4, sharp, @libsql/client |
| Data | SQLite-compatible libSQL: a local file in development and [Turso](https://turso.tech) in production. FTS5 search, versioned migrations, and photos stored in the database |
| Auth | scrypt password hashes, random session tokens stored as SHA-256 hashes, and an httpOnly `SameSite=Lax` cookie |
| Email | [Brevo](https://www.brevo.com) transactional API for password-reset messages (optional) |
| Tests | Vitest (API, socket and database integration tests) |
| Fonts | Bricolage Grotesque, Geist and Instrument Serif, bundled locally with Fontsource |

## Quick start

> These instructions are for the author and for people with written permission. See [License](#license).

**Prerequisites:** Node.js 22 or newer, and npm.

```bash
git clone https://github.com/shahidthisside/WeText.git
cd WeText
npm install
npm run dev      # API on :4000, web app on :5173
```

Open <http://localhost:5173> and create an account. The database starts empty and is created automatically on first run, so there is no sample data: the first people to sign up are the first people on the platform. To try real-time chat locally, create two accounts in two different browser profiles (or one normal and one private window).

Without email settings, a password-reset link is printed in the server log instead of being sent.

## Scripts

Run these from the repository root.

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the API (tsx watch) and Vite, proxying `/api`, `/uploads` and `/socket.io` |
| `npm run build` | Builds the web app and compiles the server |
| `npm start` | Production: one Node process serves the API, websockets and the built web app |
| `npm test` | Runs the server test suite (224 tests) |
| `npm run typecheck` | Type-checks both workspaces |

## Configuration

All settings are optional environment variables read by the server. Defaults work for local development. A ready-to-copy list is in `.env.example`.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `apps/server/data/wetext.db` | A local file path, or a Turso URL such as `libsql://name-org.turso.io` |
| `DATABASE_AUTH_TOKEN` | | Turso access token (only for remote databases) |
| `PUBLIC_URL` | | Public address of the site without a trailing slash, used in password-reset emails. Set it in production |
| `BREVO_API_KEY` | | Brevo API key for password-reset email |
| `MAIL_FROM` | | Sender address verified in Brevo |
| `MAIL_FROM_NAME` | `WeText` | Sender name |
| `PHOTO_QUOTA_MB` | `150` | Photo and voice-message storage allowed per account |
| `ADMIN_USERNAME` | | Optional. The one account allowed to read `GET /api/admin/reports` |
| `TURN_API_URL` | | Optional relay for calls that cannot connect directly. A web address that returns a list of connection servers, for example Metered Open Relay: `https://YOURAPP.metered.live/api/v1/turn/credentials?apiKey=KEY` (free plan, 20 GB a month, needs a sign-up; check their terms for whether a card is asked). The key stays on the server |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | | Alternative to `TURN_API_URL` for a relay you run yourself (comma-separated URLs such as `turn:relay.example.com:3478`) |
| `PORT` | `4000` | HTTP port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` in containers and on hosts like Render |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed browser origin in development |
| `NODE_ENV` | | `production` enables `Secure` cookies, so serve over HTTPS |

Fixed limits: sessions last 30 days, uploads are capped at 8 MB, stored photos are recompressed to stay under 3.5 MB, and password-reset links work for 30 minutes.

## Architecture

```
WeText
├── apps
│   ├── server                 Fastify API, Socket.IO, libSQL
│   │   ├── src
│   │   │   ├── app.ts         App factory: security headers, sessions, CSRF guard, photo serving, SPA serving
│   │   │   ├── db.ts          Async libSQL adapter, schema, FTS5 index and versioned migrations
│   │   │   ├── realtime.ts    Socket.IO auth, presence and typing
│   │   │   ├── routes/        HTTP handlers: auth, me, users, posts, feed, discover,
│   │   │   │                  notifications, messages, uploads
│   │   │   ├── services/      Business logic: graph, posts, users, matching, notifications
│   │   │   └── lib/           Crypto, validation, mailer, catalogs (interests, moods, prompts)
│   │   └── test/              Vitest integration suites
│   └── web                    React single-page app
│       └── src
│           ├── components/    Design system, cards, composer, layout, command palette
│           ├── pages/         Home, Discover, Connect, Chats, Activity, Profile, Settings...
│           └── lib/           API client, cache helpers, realtime wiring, preferences
├── deploy/                    Optional scripts for running on your own Ubuntu/Debian VM
├── render.yaml                Render Blueprint for the free web service
└── package.json               npm workspace root
```

Routes stay thin and hand off to services. Every read path (feeds, threads, search, notifications, messages) goes through the same visibility rules in `services/graph.ts`, so blocks, private accounts and whisper anonymity are enforced in one place.

The database layer (`db.ts`) wraps `@libsql/client` behind a small `prepare().get/all/run/pluck` interface and `db.transaction()`. Reads run concurrently. Writes and transactions are queued so only one runs at a time, because SQLite allows a single writer. In production one Node process serves the API, websockets, uploaded photos and the built web app.

## API overview

All endpoints are JSON under `/api` and use the session cookie. This is a summary, not a full reference.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `GET /auth/username-available` · `POST /auth/forgot` · `POST /auth/reset-password` |
| Account | `PATCH /me` · `POST /me/username` · `POST /auth/password` · `POST /auth/email` · `GET /auth/sessions` · `POST /auth/delete-account` · `GET /me/bookmarks` · `GET /me/blocks` · `GET /me/mutes` |
| Posts | `POST /posts` · `GET /posts/:id` · `PATCH /posts/:id` · `DELETE /posts/:id` · `GET /posts/:id/replies` · `GET /posts/:id/history` · `POST /posts/:id/vote` |
| Feeds | `GET /feed/foryou` · `GET /feed/following` · `GET /feed/whispers` · `GET /feed/pulse` · `GET /feed/prompt` |
| People | `GET /users/:username` · `POST /users/:username/follow` · `GET /users/:username/vibe` · `POST /users/:username/block` · `POST /users/:username/mute` |
| Discover | `GET /search` · `GET /trending` · `GET /suggestions` · `GET /connect` · `POST /connect/:userId/pass` · `GET /tags/:tag` |
| Notifications | `GET /notifications` · `POST /notifications/read` · `GET /me/counts` · `GET /me/follow-requests` · `POST /me/follow-requests/:userId/:action` |
| Calls | `GET /calls/ice` (connection servers for the signed-in user). Ringing and set-up use the socket events below |
| Chats | `GET /conversations?tab=primary\|requests\|archived` · `POST /conversations` · `POST /conversations/group` · `POST /conversations/:id/members` · `DELETE /conversations/:id/members/:userId` (remove or leave) · `PATCH /conversations/:id/members/:userId` (admin role) · `PATCH /conversations/:id` (mute, pin, archive, mark unread, disappearing timer) · `GET /conversations/:id/messages` · `GET /conversations/:id/search` · `GET /conversations/:id/media` · `POST /conversations/:id/read` |
| Messages | `POST /conversations/:id/messages` (text, photo, voice, shared note, reply) · `PATCH /messages/:id` (edit) · `DELETE /messages/:id` (unsend) · `POST /messages/:id/hide` (delete for me) · `POST /messages/:id/forward` · `PUT /messages/:id/star` · `PUT /messages/:id/reaction` · `GET /me/starred-messages` |
| Safety | `POST /reports` · `GET /me/export` · `GET /admin/reports` (owner only) |
| Uploads | `POST /uploads?kind=avatar\|banner\|media\|audio`. Images are re-encoded to WebP; voice notes are checked by content, not by the name the client gives. Both are stored in the database and served from `/uploads/:userId/:file` (voice notes support range requests) |
| Health | `GET /health` |

Errors use a consistent shape: `{ "error": "Human-readable message", "code": "machine_code" }`.

## Real-time events

Socket.IO authenticates with the same session cookie. The server pushes these events to the relevant user's room:

| Event | Payload |
| --- | --- |
| `message:new` · `message:updated` | The message after it was sent, edited, reacted to, starred or unsent |
| `conversation:updated` · `conversation:members` | A chat setting, name or member list changed |
| `conversation:read` | Who read a conversation, used for seen receipts |
| `notification` | The new unread notification count |
| `presence` · `presence:snapshot` | Online state for people you are watching (respects the hide-online-status setting) |
| `call:incoming` · `call:accepted` · `call:signal` · `call:active` · `call:peer` · `call:ended` | The life of a call. The client sends `call:invite`, `call:accept`, `call:end`, `call:signal`, `call:connected`, `call:peer` and `call:sync`, each answered with an acknowledgement. Every browser tab names itself with a `deviceId` when it connects, so a call survives the socket reconnecting |
| `typing` · `recording` | Sent by the client while composing or recording a voice message, relayed to the other participant |

## Security

- All input is validated with zod. SQL uses bound parameters only, and the full-text query is built from sanitised tokens.
- State-changing API requests that carry a foreign `Origin` are rejected, in addition to `SameSite=Lax` cookies.
- Rate limits: 10 requests a minute on sign-up, sign-in and password endpoints, 5 a minute on forgot-password, 60 on uploads and 120 on sending messages. Login takes the same time whether or not the account exists.
- Helmet applies a strict Content Security Policy with no inline scripts.
- Uploads must be images or audio. Images are decoded with a pixel limit and re-encoded to WebP (which strips EXIF data); audio is identified from its content, not its declared type, and size-capped. Everything is stored in the database under the uploader's id, with a per-account storage cap, and posts and messages can only attach the sender's own uploads.
- Private accounts do not expose their interests or personality traits to people who cannot see their content, and the vibe check respects the same rule. If you block someone they can no longer read your conversation.
- Blocks, private accounts and whisper anonymity are enforced on the server for every read path. Whisper authors are never returned by the API.
- Passwords are stored only as scrypt hashes. Session tokens are stored as SHA-256 hashes, and changing or resetting a password signs out the other sessions.
- Password reset: the forgot-password endpoint answers identically whether or not an account exists, and sends at most one email a minute per account. Reset tokens are random, stored only as hashes, valid for 30 minutes and usable once. The emailed link is built from `PUBLIC_URL`, never from request headers.

## Testing

```bash
npm test
```

224 tests cover authentication, post visibility and privacy rules, search, matching, moods, prompts, fading notes, whispers, edit history, reports and data export, every chat feature (edit, forward, star, pin, archive, disappearing messages, voice uploads and range requests, shared notes), group chats (members, roles, history cutoff, leaving), calls (ringing, answering, declining, busy, offline, several tabs, reconnecting, dropped connections, permissions, and the logic that adapts to a weak connection), socket events, photo storage, the database adapter, concurrency races and password reset. They run against a temporary database and need no setup.

To run them against a real libSQL server instead (the same protocol Turso uses), start one and point the tests at it:

```bash
docker run -d -p 8080:8080 ghcr.io/tursodatabase/libsql-server:latest
TEST_DATABASE_URL=http://127.0.0.1:8080 npx vitest run --root apps/server test/auth.test.ts
```

Test files share one database on a server, so run one file per fresh server.

## Deployment

> These instructions are for the author and for people with written permission. See [License](#license).

WeText keeps **no state on the server**: users, posts, messages and photos all live in the database. The app can therefore run on a free host that sleeps, restarts or wipes its disk, as long as the database is hosted somewhere durable. The setup below costs nothing and needs no credit card:

| Piece | Service | Role |
| --- | --- | --- |
| Database and photos | [Turso](https://turso.tech) free plan | Hosted SQLite |
| Web app, API, websockets | [Render](https://render.com) free web service | Runs the Node server. Sleeps after 15 minutes without traffic |
| Password-reset email | [Brevo](https://www.brevo.com) free plan | 300 emails a day. Optional |
| Keep-awake pings | [UptimeRobot](https://uptimerobot.com) free plan | Optional |

Free plans change over time. Check each provider's pricing page for current limits.

Put the database and the web service in the same part of the world: query latency adds up, because each page makes a few database requests. The included `render.yaml` uses Render's Singapore region, which suits a Turso database in Mumbai. Change `region` to match yours.

### 1. Create the database (Turso)

1. Sign up at <https://turso.tech>.
2. Create a database in the region closest to your Render region.
3. Copy its URL (`libsql://your-db-your-org.turso.io`).
4. Create a token on the database page ("Create token", read and write) and copy it.

The schema is created automatically the first time the server starts.

### 2. Set up email (Brevo, optional)

1. Sign up at <https://www.brevo.com> and verify a sender address (Senders, domains and dedicated IPs).
2. Create an API key (SMTP and API, API keys).
3. Brevo can block API calls from unrecognised IP addresses. Render's free servers do not have a fixed IP, so turn that blocking off at <https://app.brevo.com/security/authorised_ips>.

Mail sent from a free address such as Gmail can land in spam. A domain you own delivers better. Without these settings everything else works, but "Forgot password" cannot send email.

### 3. Deploy the app (Render)

1. Push this repository to GitHub.
2. In Render choose New, then Blueprint, and select the repository. Render reads `render.yaml`.
3. Enter the values it asks for:
   - `DATABASE_URL`: the Turso URL
   - `DATABASE_AUTH_TOKEN`: the Turso token
   - `PUBLIC_URL`: the address Render gives the service, for example `https://your-service.onrender.com`, without a trailing slash. Service names are unique across Render, so the address may carry a suffix. Check it after the first deploy and correct `PUBLIC_URL` if needed.
   - `BREVO_API_KEY` and `MAIL_FROM` (optional): from step 2
4. Wait for the build, open the address and create the first account.

Render redeploys automatically on every push to the branch.

### 4. Keep it awake (UptimeRobot, optional)

Without visitors, the free Render service sleeps after 15 minutes, and the next visit takes noticeably longer while it wakes. A free uptime monitor that visits every few minutes prevents that.

1. Sign up at <https://uptimerobot.com>.
2. Add a monitor: type "HTTP(s)", URL set to your service address, interval 5 minutes (the shortest on the free plan).

Render shares its free monthly instance hours across all the free services in a workspace. A service kept awake around the clock uses most of them, so other free services in the same workspace may run out. Check Render's current free-tier terms.

### Good to know

- **Realtime chat** works while the service is awake. Messages are always saved, so anyone who opens the app later sees them.
- **Speed.** The free instance is small and the database is a network hop away, so pages load in a fraction of a second to about a second or two, which is fine for a small community but not for heavy traffic.
- **One instance.** Realtime state (who is online, typing) lives in memory, so run a single instance.
- **Photos** live in the database. Each account may store 150 MB by default (`PHOTO_QUOTA_MB`), and each photo is recompressed to stay under 3.5 MB.
- **Backups.** Turso keeps the data durable. For your own copy, use the Turso CLI to dump the database to a file.

### Other ways to run it

**Your own server or VM.** One Node process plus a local SQLite file works too. The `deploy/` folder has a script for an Ubuntu or Debian VM that installs Node and Caddy (automatic HTTPS), builds the app, runs it as a systemd service and schedules nightly backups:

```bash
git clone https://github.com/shahidthisside/WeText.git
sudo bash WeText/deploy/setup.sh your-domain.example
```

Later updates: `sudo bash /opt/wetext/deploy/update.sh`. The script creates `/etc/wetext.env` for `PUBLIC_URL` and the Brevo settings.

**Any Node host.**

```bash
npm install
npm run build
NODE_ENV=production HOST=0.0.0.0 PORT=4000 \
  DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... PUBLIC_URL=https://your.site npm start
```

Put it behind an HTTPS reverse proxy: production cookies are `Secure`, so plain HTTP will not keep you signed in. Serverless platforms such as Vercel and Netlify are not a fit, because the server holds long-lived websocket connections.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm install` fails on a native module | Use Node 22 or newer. The database client and the image library ship prebuilt binaries for macOS, Linux and Windows |
| Port 4000 or 5173 is already in use | Stop the other process, or set `PORT` for the API |
| Signed in but immediately signed out in production | You are serving over plain HTTP. Use HTTPS, since production cookies are `Secure` |
| Start over with an empty local database | Stop the dev server and delete `apps/server/data` |
| Realtime chat does not update | Check that your proxy forwards WebSocket upgrades on `/socket.io`. On a sleeping free host, reload and wait for it to wake |
| Reset links point at the wrong address | Set `PUBLIC_URL` to the real public address and restart |
| Password-reset emails never arrive | Check `BREVO_API_KEY`, that `MAIL_FROM` is a sender verified in Brevo, that Brevo's IP blocking is off, and your spam folder. The server log shows Brevo's error |
| The first visit after a quiet period is slow | The free host was asleep. A keep-awake monitor (step 4) avoids this |
| A photo upload is rejected as too large | Photos are recompressed to stay under 3.5 MB. Try a smaller image |

## Contributing

Issues are welcome: bug reports and ideas help. Code contributions are not accepted without prior written permission from the author (see [License](#license)). Before proposing a change, run `npm run typecheck` and `npm test`.

## License

**Copyright (c) 2026 Shahid Ansari. All rights reserved.**

WeText is proprietary software under the [WeText Proprietary License](LICENSE). It is **not** open source: the code is published for viewing only. You may read it on GitHub and use the official service as an end user. Copying, modifying, renaming, building, running or hosting it, redistributing it, and using it to train or prompt AI models are not allowed without prior written permission. Every file in this repository that is not a third-party library is covered by the license, and forks are covered too.

Third-party libraries and fonts remain under their own licenses. To ask for permission, contact Shahid Ansari through <https://github.com/shahidthisside>.
