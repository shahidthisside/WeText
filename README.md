<div align="center">

<img src="apps/web/public/favicon.svg" alt="WeText logo" width="80" height="80" />

# WeText

**Say what's on your mind, with your name or without it.**
**Find people who think like you, then talk in real time.**

![Node](https://img.shields.io/badge/node-%E2%89%A522-3c873a)
![TypeScript](https://img.shields.io/badge/typescript-strict-3178c6)
![React](https://img.shields.io/badge/react-19-149eca)
![Fastify](https://img.shields.io/badge/fastify-5-000000)
![SQLite](https://img.shields.io/badge/sqlite-FTS5-003b57)
![Tests](https://img.shields.io/badge/tests-29%20passing-2ea44f)

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
| API | Fastify 5, zod, Socket.IO 4, sharp |
| Data | SQLite via better-sqlite3 (WAL mode, FTS5, migrations versioned with `user_version`) |
| Auth | scrypt password hashes, random session tokens stored as SHA-256 hashes, httpOnly `SameSite=Lax` cookie |
| Tests | Vitest (API and socket integration tests) |
| Fonts | Bricolage Grotesque, Geist and Instrument Serif, bundled locally with Fontsource |

## Quick start

**Prerequisites:** Node.js 22 or newer, and npm.

```bash
git clone https://github.com/shahidthisside/WeText.git
cd WeText
npm install
npm run seed     # creates a demo community (wipes the dev database)
npm run dev      # API on :4000, web app on :5173
```

Open <http://localhost:5173> and sign in with **demo / wetext123**.

All 14 seeded accounts share the password `wetext123`. To try real-time chat, sign in as `demo` in one window and as `maya_k` in another.

## Scripts

Run these from the repository root.

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the API (tsx watch) and Vite, proxying `/api`, `/uploads` and `/socket.io` |
| `npm run build` | Builds the web app and compiles the server |
| `npm start` | Production: one Node process serves the API, websockets, uploads and the built app |
| `npm run seed` | Resets the database and fills it with demo data |
| `npm test` | Runs the server test suite (29 tests) |
| `npm run typecheck` | Type-checks both workspaces |

## Configuration

All settings are optional environment variables read by the server. Defaults work for local development.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` in containers |
| `DB_FILE` | `apps/server/data/wetext.db` | SQLite database path |
| `UPLOAD_DIR` | `apps/server/uploads` | Where processed images are stored |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed browser origin in development |
| `NODE_ENV` | | `production` enables `Secure` cookies, so serve over HTTPS |

Fixed limits: sessions last 30 days and uploads are capped at 8 MB.

## Architecture

```
WeText
├── apps
│   ├── server                 Fastify API, Socket.IO, SQLite
│   │   ├── src
│   │   │   ├── app.ts         App factory: security headers, sessions, CSRF guard, SPA serving
│   │   │   ├── db.ts          Schema, FTS5 index and versioned migrations
│   │   │   ├── realtime.ts    Socket.IO auth, presence and typing
│   │   │   ├── routes/        HTTP handlers: auth, me, users, posts, feed, discover,
│   │   │   │                  notifications, messages, uploads
│   │   │   ├── services/      Business logic: graph, posts, users, matching, notifications
│   │   │   └── seed.ts        Demo data
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
| Auth | `POST /auth/signup` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `GET /auth/username-available` |
| Account | `PATCH /me` · `POST /me/username` · `POST /auth/password` · `POST /auth/email` · `GET /auth/sessions` · `POST /auth/delete-account` · `GET /me/bookmarks` · `GET /me/blocks` · `GET /me/mutes` |
| Posts | `POST /posts` · `GET /posts/:id` · `PATCH /posts/:id` · `DELETE /posts/:id` · `GET /posts/:id/replies` · `POST /posts/:id/vote` |
| Feeds | `GET /feed/foryou` · `GET /feed/following` · `GET /feed/whispers` · `GET /feed/pulse` · `GET /feed/prompt` |
| People | `GET /users/:username` · `POST /users/:username/follow` · `GET /users/:username/vibe` · `POST /users/:username/block` · `POST /users/:username/mute` |
| Discover | `GET /search` · `GET /trending` · `GET /suggestions` · `GET /connect` · `POST /connect/:userId/pass` · `GET /tags/:tag` |
| Notifications | `GET /notifications` · `POST /notifications/read` · `GET /me/counts` · `GET /me/follow-requests` · `POST /me/follow-requests/:userId/:action` |
| Chats | `GET /conversations` · `POST /conversations` · `GET /conversations/:id/messages` · `POST /conversations/:id/read` · `PUT /messages/:id/reaction` · `DELETE /messages/:id` |
| Uploads | `POST /uploads` (images only, re-encoded to WebP) |

Errors use a consistent shape: `{ "error": { "code": "...", "message": "..." } }`.

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
- Uploads must be images. They are decoded with a pixel limit, re-encoded to WebP (which strips EXIF data) and stored in the uploader's own folder. Posts can only attach the author's own uploads.
- Blocks, private accounts and whisper anonymity are enforced on the server for every read path. Whisper authors are never returned by the API.
- Session tokens are stored as SHA-256 hashes, and changing your password signs out every other session.

## Testing

```bash
npm test
```

29 integration tests cover authentication, post visibility and privacy rules, search, matching, moods, prompts, fading notes, whispers, direct messages, socket events and uploads. They run against a temporary database and need no setup.

## Deployment

```bash
npm install
npm run build
NODE_ENV=production HOST=0.0.0.0 PORT=4000 npm start
```

- Put the app behind an HTTPS reverse proxy. Production cookies are `Secure`, so plain HTTP will not keep you signed in.
- Persist the directories set by `DB_FILE` and `UPLOAD_DIR`.
- SQLite means one server instance. Scaling out would need a shared database and a Socket.IO adapter.
- Do not run `npm run seed` against real data. It wipes the database.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `better-sqlite3` fails to install | Use Node 22 or newer, and make sure a C++ toolchain is available (Xcode command line tools on macOS, `build-essential` on Debian/Ubuntu) |
| Port 4000 or 5173 is already in use | Stop the other process, or set `PORT` for the API |
| Signed in but immediately signed out in production | You are serving over plain HTTP. Use HTTPS, since production cookies are `Secure` |
| Demo accounts are missing | Run `npm run seed` |
| Realtime chat does not update | Check that your proxy forwards WebSocket upgrades on `/socket.io` |

## Contributing

Issues and pull requests are welcome. Before opening a PR, run `npm run typecheck` and `npm test`, and keep changes focused on one thing at a time.

## License

No license has been chosen yet, so all rights are reserved by default. Add a `LICENSE` file to change that.
