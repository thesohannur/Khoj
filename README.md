# Khoj (খোজ)

Khoj is an offline-capable Progressive Web App for registering missing persons in advance and matching them against found-person reports using on-device face recognition. It targets low-connectivity, crisis conditions in Bangladesh, with a Bengali-first UI and Telegram-based notifications.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running Locally](#running-locally)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Security Model](#security-model)
- [Notes and Limitations](#notes-and-limitations)
- [License](#license)

## Overview

The app has two user flows:

- **Registration** (requires an account): a user signs up and registers a family member with a photo. A 128-dimension face descriptor is computed client-side with face-api.js and stored, owned by that account.
- **Reporting** (no account required): anyone can report a found or missing person. Reporting gets a transparent anonymous session so no signup is needed. The found person's photo is compared, entirely on-device, against a descriptor-only cache of the registry. If face-api.js finds a candidate match, a server endpoint independently re-verifies it against the real stored descriptor and, only then, reveals the registered person's identity and a time-limited signed photo URL.

Confirming a match triggers a Postgres trigger that calls a Vercel function, which sends a Bengali-language Telegram message to the family, including the reporter's contact number. If the family has the app open at that moment, they also get a live in-app banner via Supabase Realtime.

Reports and registrations submitted offline are queued in IndexedDB and synced automatically once connectivity returns.

## Features

- Face detection and descriptor computation entirely in-browser (face-api.js / TensorFlow.js), no external API calls
- Descriptor-based matching against a registry, with a confidence score and a 5-candidate shortlist
- Offline queueing (IndexedDB) for reports, registrations, and match confirmations, with automatic sync on reconnect
- Email/password accounts for registering family members; anonymous sessions for reporting
- Row Level Security scoping registered persons to the account that registered them
- Server-side re-verification of a match before any identity or photo is revealed to a reporter
- Private storage bucket with signed URLs for registration photos; public bucket for report photos shown on the crisis map
- Bengali Telegram notifications on confirmed match, including the reporter's contact number
- Live in-app notification banner via Supabase Realtime
- Leaflet/OpenStreetMap view of found-person report locations
- PWA manifest and a service worker for asset caching

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Face detection/recognition | face-api.js |
| Maps | Leaflet, react-leaflet, OpenStreetMap tiles |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password + anonymous sessions) |
| File storage | Supabase Storage |
| Realtime | Supabase Realtime (Postgres change feeds) |
| Offline storage | IndexedDB |
| Serverless functions | Vercel Functions (Node.js) |
| Notifications | Telegram Bot API |
| Hosting | Vercel |

## Project Structure

```
Khoj/
├── api/
│   ├── reveal-match.js        Vercel function: re-verifies a match, signs a photo URL
│   └── telegram-webhook.js    Vercel function: handles /start and match-notify webhook
├── public/
│   ├── manifest.json          PWA manifest
│   ├── sw.js                  Service worker (app-shell caching)
│   └── models/                face-api.js model weights, served statically
├── src/
│   ├── components/
│   │   ├── AuthGate.jsx               Sign up / log in form
│   │   ├── RegisterPerson.jsx         Family member registration form
│   │   ├── ReportFound.jsx            Found-person report form + matching
│   │   ├── ReportMissing.jsx          Missing-person report form
│   │   ├── MatchResult.jsx            Match review/confirm modal
│   │   ├── MatchNotificationBanner.jsx  Live in-app match banner (Realtime)
│   │   ├── CrisisMap.jsx              Leaflet map of found reports
│   │   └── SyncStatus.jsx             Offline-queue status banner
│   ├── lib/
│   │   ├── supabase.js         Supabase client
│   │   ├── auth.js             Session helpers (anonymous fallback, sign up/in/out)
│   │   ├── faceMatch.js        Model loading + descriptor computation
│   │   ├── matching.js         Pure descriptor-comparison math (no face-api dependency)
│   │   ├── offlineQueue.js     IndexedDB queues, sync logic, photo upload
│   │   └── telegramBot.js      Telegram message formatting/sending
│   ├── App.jsx                 App shell, tab navigation, session bootstrap
│   └── main.jsx                Entry point
├── supabase/
│   └── schema.sql              Tables, RLS policies, RPC, storage buckets, notify trigger
├── index.html
├── vite.config.js
└── package.json
```

## Prerequisites

- Node.js 18 or later
- A [Supabase](https://supabase.com) project
- A [Telegram](https://t.me/BotFather) bot token
- A [Vercel](https://vercel.com) account, for deployment

## Setup

```bash
git clone https://github.com/thesohannur/Khoj.git
cd Khoj
npm install
cp .env.local.example .env.local   # fill in Supabase and Telegram credentials
```

- Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) — it sets up the tables, Row Level Security, the offline-matching RPC, storage buckets, and the Telegram notification trigger (see [Security Model](#security-model)).
- Enable anonymous sign-ins in Supabase Auth, since reporting doesn't require an account.
- Create a Telegram bot and point its webhook at your deployment's `/api/telegram-webhook`.

## Running Locally

```bash
npm run dev
```

## Deployment

The project deploys to Vercel, which builds the Vite app and serves `api/` as serverless functions. Set the environment variables from `.env.local` in the Vercel project, then deploy.

## API Reference

### `POST /api/reveal-match`

Re-verifies a client-side match and, if it holds up, returns display data and a signed photo URL.

Request body:
```json
{ "queryDescriptor": [/* 128 floats */], "personIds": ["uuid", "..."] }
```

Response:
```json
{ "candidates": [{ "id": "uuid", "name": "...", "name_bn": "...", "age": 0, "gender": "...", "district": "...", "confidence": 0.0, "signedPhotoUrl": "..." }] }
```

Candidates are only included if the server's own recomputed confidence, using the person's real stored descriptor, exceeds the match threshold. `telegram_chat_id` and `registered_by` are never included in the response.

### `POST /api/telegram-webhook`

Handles two payload shapes:

- A Telegram update containing a `/start` message — replies with the sender's `chat_id`.
- A Supabase database webhook payload for an `INSERT` on `matches` — fetches the matched person and report, signs a photo URL, sends the Telegram notification, and marks the match as notified.

## Security Model

- `persons` rows are only readable/writable by the account that created them (`registered_by = auth.uid()`), enforced by Row Level Security.
- Reporting uses an anonymous Supabase session rather than an unauthenticated request, so all table/RPC access requires at least a session.
- The offline-matching cache is populated from `get_match_registry()`, a `security definer` function that returns only `id` and `face_descriptor` — no names, photos, or contact details.
- A registered person's identity and photo are only ever returned by `/api/reveal-match`, which recomputes the match confidence server-side against the actual stored descriptor before responding.
- Registration photos are stored in a private bucket; only the uploading account can generate a signed URL for its own files. Report photos (shown on the public crisis map) are stored in a separate public bucket.

## Notes and Limitations

- Face matching accuracy depends on lighting and photo quality; it is intended to produce a shortlist for human confirmation, not a definitive identification.
- Supabase's free tier pauses projects after a period of inactivity.
- The in-app notification banner only reaches a user while the app is open; Telegram is the primary notification channel.
- The PWA manifest references icon files (`icon-192.png`, `icon-512.png`) that are not currently included in `public/`, and the service worker is not yet registered from the app entry point.
- Registration is gated to authenticated (non-anonymous) accounts in the UI, but this is not additionally enforced at the database level for an anonymous session calling the API directly.

## License

[MIT](LICENSE)
