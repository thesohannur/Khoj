# Khoj — খোজ

**Offline-first, on-device face matching to reunite families during a crisis in Bangladesh — free, in Bengali.**

> *"In the 2024 floods, 2.3 million people were displaced. In the July Revolution crackdown, families waited days for news. Khoj gives every family a fighting chance to find each other — offline, in Bengali, for free."*

## The Problem

During a flood, cyclone, or civil unrest, families get separated, and existing tools fall short:

- **They're reactive.** You can only search after the crisis, once panic has already set in.
- **They require internet.** The first thing to go down.
- **They aren't built for Bangladesh.** No Bengali language support, no local context, no face matching.

Khoj flips the model: families register **before** a crisis. When one hits, anyone who finds a lost person submits a photo. Khoj matches it against every registered face — on the device, in the browser, with no internet required — and notifies the family the moment a real match is found.

## Features

- 👤 **Family registration** — sign up, register your relatives with a photo in advance; a 128-dimension face embedding is computed on-device and stored.
- 🔍 **Found/missing reporting** — anyone can report a found or missing person, no account required.
- 📡 **Fully offline-capable** — reports queue in IndexedDB and sync automatically on reconnect; face matching runs entirely on-device against a cached descriptor registry, so it works with zero connectivity.
- 🎯 **On-device face matching** — [face-api.js](https://github.com/justadudewhohacks/face-api.js) computes and compares descriptors client-side; a shortlist of candidates is returned with a confidence score, not a definitive answer.
- 🔒 **Privacy-scoped matching** — matching never exposes a registered person's name, photo, or contact info in bulk. A server endpoint independently re-verifies a match against the real stored descriptor before ever revealing identity, and only via a short-lived signed photo URL.
- 🔔 **Bengali Telegram notifications** — the family gets a Bengali-language Telegram message (with photo and the reporter's contact number) the moment a match is confirmed.
- ⚡ **Live in-app banner** — a same-tab notification if the family happens to have the app open when the match lands.
- 🗺️ **Crisis map** — a public Leaflet/OpenStreetMap view of found-person reports.
- 📱 **PWA** — installable, offline-caching service worker and manifest.

## How It Works

1. **Register (requires an account).** A family signs up, uploads a photo of their relative, and face-api.js computes a descriptor on-device. The row is stored owned by that account — nobody else can read it.
2. **Report (no account needed).** A volunteer at a shelter reports a found person's photo. They get a frictionless anonymous session automatically — no signup required to help.
3. **Match, entirely offline.** The reporter's browser already holds a descriptor-only cache (id + face embedding, no photos or names) synced the last time it was online. Matching runs as a local vector comparison — no network call needed to find a candidate.
4. **Reveal, only for a real match.** Once online, the app asks a server endpoint to reveal a candidate's identity. The server independently recomputes the match confidence against the real stored descriptor — a client can't just ask "who is person X" and get an answer without actually having a matching photo — and returns a short-lived signed photo URL only if the match holds up.
5. **Notify.** Confirming a match inserts a row that a Postgres trigger picks up (via `pg_net`), which calls a Vercel function that sends a Bengali Telegram message — including the reporter's contact number — to the family.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        User's Browser                        │
│                                                                │
│  ┌──────────────┐        ┌──────────────────────────────┐    │
│  │  React PWA   │◄──────►│  face-api.js (on-device)     │    │
│  │  (Vite)      │        │  detect → embed → compare     │    │
│  └──────┬───────┘        └──────────────────────────────┘    │
│         │ offline queue + descriptor cache (IndexedDB)        │
└─────────│──────────────────────────────────────────────────────┘
          │ sync on reconnect
          ▼
┌────────────────────────────┐      ┌───────────────────────────┐
│         Supabase           │      │          Vercel           │
│  Postgres + Auth + Storage │─────►│  /api/reveal-match         │
│  + Realtime                │      │   re-verifies + signs URL  │
│                             │      │  /api/telegram-webhook     │
│  RLS: persons scoped to    │      │   sends Bengali message    │
│  registered_by = auth.uid  │      └──────────────┬────────────┘
│  Private person-photos     │                     │
│  bucket (signed URLs only) │                     ▼
│  get_match_registry() RPC  │           ┌───────────────────┐
│  (id + descriptor only)    │           │  Telegram Bot API  │
└────────────┬────────────────┘           └───────────────────┘
             │ pg_net trigger on matches INSERT
             └─────────────────────────────────────────┘
```

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite, PWA (manifest + service worker) |
| Face detection/matching | face-api.js (tinyFaceDetector, ssdMobilenetv1 fallback, faceRecognitionNet) — 100% client-side |
| Database | Supabase Postgres, Row Level Security |
| Auth | Supabase Auth — email/password for families, anonymous sessions for reporters |
| Storage | Supabase Storage — private `person-photos` bucket (signed URLs), public `photos` bucket for report photos |
| Realtime | Supabase Realtime (in-app match notifications) |
| Offline | IndexedDB (report/registration/match queue + descriptor cache) |
| Map | Leaflet + OpenStreetMap |
| Serverless functions | Vercel (`api/reveal-match.js`, `api/telegram-webhook.js`) |
| Notifications | Telegram Bot API |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Telegram bot](https://t.me/BotFather) token
- A [Vercel](https://vercel.com) account (for deployment)

### Install

```bash
git clone https://github.com/thesohannur/Khoj.git
cd Khoj
npm install
```

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Where to get it | Exposed to client? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API (anon/publishable key) | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase → Project Settings → API (service role key) | No — server only |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database | No — server only |
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/newbot` | No — server only |

### Supabase setup

Run in the Supabase SQL editor:

```sql
-- Schema
create table persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_bn text,
  age integer,
  gender text,
  district text,
  photo_url text,               -- path in the private person-photos bucket
  face_descriptor float8[],
  telegram_chat_id text,
  registered_by uuid,           -- auth.uid() of the registering account
  created_at timestamptz default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('found', 'missing')),
  photo_url text,                -- public URL in the photos bucket
  face_descriptor float8[],
  location_lat float8,
  location_lng float8,
  location_name text,
  description text,
  reporter_contact text,
  synced boolean default false,
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references persons(id),
  report_id uuid references reports(id),
  confidence float8,
  notified boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security
alter table persons enable row level security;
create policy "owner select persons" on persons for select to authenticated using (auth.uid() = registered_by);
create policy "owner insert persons" on persons for insert to authenticated with check (auth.uid() = registered_by);
create policy "owner update persons" on persons for update to authenticated using (auth.uid() = registered_by);
create policy "owner delete persons" on persons for delete to authenticated using (auth.uid() = registered_by);

alter table reports enable row level security;
create policy "authenticated read reports" on reports for select to authenticated using (true);
create policy "authenticated insert reports" on reports for insert to authenticated with check (true);

alter table matches enable row level security;
create policy "authenticated select matches" on matches for select to authenticated using (true);
create policy "authenticated insert matches" on matches for insert to authenticated with check (true);

-- Narrow RPC for offline matching — id + descriptor only, no PII
create or replace function public.get_match_registry()
returns table (id uuid, face_descriptor float8[])
language sql security definer set search_path = public
as $$ select id, face_descriptor from persons where face_descriptor is not null; $$;
revoke all on function public.get_match_registry() from public, anon;
grant execute on function public.get_match_registry() to authenticated;

-- Private bucket for registration photos
insert into storage.buckets (id, name, public) values ('person-photos', 'person-photos', false);
create policy "authenticated upload person-photos" on storage.objects for insert to authenticated with check (bucket_id = 'person-photos');
create policy "owner read person-photos" on storage.objects for select to authenticated using (bucket_id = 'person-photos' and owner_id = (auth.uid())::text);

-- Public bucket for report photos (crisis map)
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "public read photos" on storage.objects for select using (bucket_id = 'photos');
create policy "public upload photos" on storage.objects for insert with check (bucket_id = 'photos');

-- Realtime for the in-app notification banner
alter publication supabase_realtime add table matches;
```

Then, in **Authentication → Sign In / Providers**:
- Enable **"Allow anonymous sign-ins"** — required for the no-account reporting flow.
- Disable **"Confirm email"** — this is a zero-cost MVP with no real email-verification need; leaving it on will hit Supabase's default email rate limit almost immediately.

### Telegram bot setup

1. Message [@BotFather](https://t.me/BotFather), `/newbot`, save the token.
2. After deploying (below), register the webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://<your-app>.vercel.app/api/telegram-webhook"
   ```
3. Create a Postgres trigger so a confirmed match calls that webhook (requires the `pg_net` extension):
   ```sql
   create extension if not exists pg_net;

   create or replace function public.notify_match_webhook()
   returns trigger as $$
   begin
     perform net.http_post(
       url := 'https://<your-app>.vercel.app/api/telegram-webhook',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := jsonb_build_object('type', 'INSERT', 'table', 'matches', 'schema', 'public', 'record', to_jsonb(NEW), 'old_record', null),
       timeout_milliseconds := 15000
     );
     return NEW;
   end;
   $$ language plpgsql security definer;

   create trigger matches_notify_webhook after insert on matches for each row execute function public.notify_match_webhook();
   ```
4. A family member sends `/start` to the bot to get their `chat_id`, which they enter during registration.

### Run locally

```bash
npm run dev
```

## Deployment

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SERVICE_KEY production
vercel env add TELEGRAM_BOT_TOKEN production
vercel --prod
```

## Security & Privacy Model

Registered persons are sensitive data — photos and identities of vulnerable people during a crisis — so Khoj is deliberately designed to minimize what any given request can see:

- **Families own their registrations.** RLS scopes `persons` to `registered_by = auth.uid()`; nobody else can read another family's registered members through the normal API.
- **Reporting needs no account.** A silent, anonymous Supabase Auth session is created automatically so volunteers can report and match without signing up — but this still requires *some* session, closing off anonymous bulk scraping via a bare API key.
- **Matching never bulk-exposes PII.** The offline-matching cache comes from `get_match_registry()`, a `security definer` RPC that returns only `{id, face_descriptor}` — no names, photos, or contact info, for anyone with a session.
- **Identity reveal is server-verified, not client-trusted.** `/api/reveal-match` independently recomputes match confidence against the real stored descriptor before signing a photo URL — a client can't just ask "who is person X" without actually holding a genuinely matching photo.
- **Photos are private by default.** Registration photos live in a private bucket; only the owner can generate a signed URL for their own uploads, and match candidates' photos are only ever revealed via the short-lived signed URL from the reveal step.

## Known Limitations

| Limitation | Honest framing |
|---|---|
| Face matching accuracy drops in poor lighting or photos-of-photos | Khoj is a shortlist tool — it narrows a large registry to a few candidates for a human to confirm, not a definitive identification. |
| Supabase free tier pauses after a week of inactivity | Fine for a demo; production would need a paid plan or self-hosting. |
| Telegram required for notifications | The in-app banner only helps if the family has the tab open — Telegram is the primary channel. |
| Anonymous sessions can technically self-register | Registration is UI-gated to real accounts, but not hard-blocked at the database level for an anonymous session hitting the API directly. |

## Roadmap

- Admin dashboard for NGO workers reviewing pending matches
- Bulk CSV import of existing missing-persons lists
- QR codes for shelter volunteers to scan found persons
- SMS/WhatsApp fallback for families without Telegram
- Government/Red Cross data-sharing integration

## Contributing

Issues and pull requests are welcome. This project prioritizes low-friction, low-cost infrastructure — please keep that in mind when proposing new dependencies or paid services.

## License

[MIT](LICENSE)
