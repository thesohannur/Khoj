# Khoj — খোজ
### Distributed Missing Persons System for Bangladesh

> *"In the 2024 floods, 2.3 million people were displaced. In the July Revolution crackdown, families waited days for news. Khoj gives every family a fighting chance to find each other — offline, in Bengali, for free."*

---

## The Problem

During every major crisis in Bangladesh — flood, cyclone, protest violence — families are separated. The existing solutions fail in three ways:

1. **They are reactive.** You can only search after the crisis, when panic has already set in.
2. **They require internet.** The Red Cross IRestoreFamily tool does not work offline, and internet is the first thing to go.
3. **They are not built for Bangladesh.** No Bengali language support. No local context. No face matching.

Khoj flips the model: register your family **before** any crisis. When disaster strikes, anyone who finds a lost person submits a photo. Khoj matches that photo against every registered face — on the device, in the browser, with no API — and sends a Bengali Telegram message to the family the moment a match is found.

---

## What Is Free and Why

Every service used in Khoj has a **zero-cost tier that requires no credit card**.

| Service | What It Does | Why It's Free |
|---|---|---|
| **Telegram Bot API** | Sends Bengali match notifications | No billing model. Completely free forever for bots. |
| **Supabase** (free tier) | Database, storage, realtime sync | Free tier: 500MB DB, 50MB storage, 2GB transfer. No credit card needed — sign up with GitHub. |
| **Vercel** (hobby) | Hosts the PWA + Telegram webhook | Free forever for hobby projects. Sign up with GitHub, no card. |
| **face-api.js** | On-device face detection and matching | Open-source MIT library. Runs entirely in the browser. Zero API calls. |
| **TensorFlow.js** | Runtime for face-api.js models | Open-source. Google-maintained. |
| **Leaflet + OpenStreetMap** | Shows shelter and "found" locations | OSM is free community map data. Leaflet is MIT licensed. |
| **React + Vite** | Frontend framework | Open-source. No cost. |
| **IndexedDB** | Offline report queue | Browser built-in. Always free. |
| **Service Worker** | Offline PWA capability | Browser built-in. Always free. |
| **Camera + Geolocation API** | Photo capture, location tagging | Browser built-in. Always free. |
| **Web Crypto API** | Hashing face descriptors | Browser built-in. Always free. |

**Total monthly cost to run Khoj: ৳0**

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User's Phone                       │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │  React PWA   │    │     face-api.js            │  │
│  │  (Vite)      │◄──►│  (runs in browser)        │  │
│  │              │    │  - detect faces            │  │
│  │  - Register  │    │  - compute embeddings      │  │
│  │  - Report    │    │  - compare descriptors     │  │
│  │  - Search    │    └───────────────────────────┘  │
│  └──────┬───────┘                                    │
│         │ offline queue                              │
│  ┌──────▼───────┐                                    │
│  │  IndexedDB   │  ← stores reports when offline    │
│  └──────┬───────┘                                    │
└─────────│───────────────────────────────────────────┘
          │ sync on reconnect
          ▼
┌─────────────────────┐      ┌──────────────────────┐
│     Supabase        │      │    Vercel             │
│  (free tier)        │─────►│  (Telegram webhook)  │
│                     │      │                      │
│  - persons table    │      │  on match found:     │
│  - reports table    │      │  → call Telegram API │
│  - matches table    │      │  → send Bengali msg  │
│  - realtime events  │      └──────────────────────┘
└─────────────────────┘                │
                                       ▼
                              ┌──────────────────────┐
                              │   Telegram Bot API   │
                              │   (completely free)  │
                              │                      │
                              │  "আপনার পরিবারের    │
                              │   সদস্য পাওয়া গেছে"  │
                              └──────────────────────┘
```

---

## Database Schema (Supabase)

```sql
-- People registered before crisis
create table persons (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_bn      text,                        -- Bengali name
  age          integer,
  gender       text,
  district     text,                        -- last known district
  photo_url    text,                        -- stored in Supabase Storage
  face_descriptor float8[],                -- 128-dim embedding from face-api.js
  telegram_chat_id text,                   -- family contact for notifications
  registered_by uuid,                      -- who registered them
  created_at   timestamptz default now()
);

-- Reports submitted during crisis ("found this person")
create table reports (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('found', 'missing')),
  photo_url     text,
  face_descriptor float8[],               -- computed on device
  location_lat  float8,
  location_lng  float8,
  location_name text,                     -- e.g. "Mirpur 10 Shelter"
  description   text,
  reporter_contact text,
  synced        boolean default false,    -- false = came from offline queue
  created_at    timestamptz default now()
);

-- Confirmed matches between reports and registered persons
create table matches (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid references persons(id),
  report_id    uuid references reports(id),
  confidence   float8,                    -- 0.0 to 1.0
  notified     boolean default false,
  created_at   timestamptz default now()
);
```

---

## Project Structure

```
khoj/
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service worker
│   └── models/                  # face-api.js model weights (bundled)
│       ├── tiny_face_detector/
│       ├── face_landmark_68/
│       └── face_recognition/
│
├── src/
│   ├── lib/
│   │   ├── supabase.js          # Supabase client
│   │   ├── faceMatch.js         # face-api.js wrapper
│   │   ├── offlineQueue.js      # IndexedDB queue
│   │   └── telegramBot.js       # Bot message helpers
│   │
│   ├── components/
│   │   ├── RegisterPerson.jsx   # Pre-crisis family registration
│   │   ├── ReportFound.jsx      # "I found someone" flow
│   │   ├── ReportMissing.jsx    # "Someone is missing" flow
│   │   ├── MatchResult.jsx      # Show face match confidence
│   │   ├── CrisisMap.jsx        # Leaflet map of found locations
│   │   └── SyncStatus.jsx       # Offline/online indicator
│   │
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── Register.jsx
│   │   ├── Report.jsx
│   │   └── Search.jsx
│   │
│   ├── App.jsx
│   └── main.jsx
│
├── api/
│   └── telegram-webhook.js      # Vercel serverless function
│
├── .env.local                   # Supabase URL + anon key (safe to expose)
├── vite.config.js
└── package.json
```

---

## Core Code

### 1. Supabase Client (`src/lib/supabase.js`)

```javascript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

---

### 2. Face Matching (`src/lib/faceMatch.js`)

```javascript
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';
let modelsLoaded = false;

// Load models once on app start (~6MB total, cached by service worker)
export async function loadModels() {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

// Compute 128-dimension face embedding from an image element
export async function computeDescriptor(imageElement) {
  await loadModels();
  const detection = await faceapi
    .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!detection) return null;
  return Array.from(detection.descriptor); // float32[] → regular array for JSON
}

// Compare a found person's descriptor against all registered persons
// Returns array of { person, confidence } sorted by confidence desc
export function matchAgainstRegistry(foundDescriptor, registeredPersons) {
  const queryDescriptor = new Float32Array(foundDescriptor);

  return registeredPersons
    .filter(p => p.face_descriptor)
    .map(person => {
      const storedDescriptor = new Float32Array(person.face_descriptor);
      const distance = faceapi.euclideanDistance(queryDescriptor, storedDescriptor);
      // distance 0 = identical, 0.6+ = likely different person
      const confidence = Math.max(0, 1 - distance / 0.6);
      return { person, confidence };
    })
    .filter(r => r.confidence > 0.4)          // minimum threshold
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);                              // top 5 candidates
}
```

---

### 3. Offline Queue (`src/lib/offlineQueue.js`)

```javascript
const DB_NAME = 'khoj-offline';
const STORE = 'pending-reports';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE, {
        keyPath: 'id',
        autoIncrement: true,
      });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

export async function queueReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ ...report, queuedAt: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

export async function flushQueue() {
  if (!navigator.onLine) return;
  const db = await openDB();
  const pending = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });

  for (const report of pending) {
    const { error } = await supabase.from('reports').insert(report);
    if (!error) {
      // Remove from queue after successful sync
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(report.id);
    }
  }
}

// Auto-flush when connection returns
window.addEventListener('online', flushQueue);
```

---

### 4. Telegram Webhook (`api/telegram-webhook.js`)

```javascript
// Vercel serverless function — triggered by Supabase database webhook
// when a new match is inserted into the matches table

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { record } = req.body; // Supabase webhook payload

  // Fetch full match details
  const { data: match } = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/matches?id=eq.${record.id}&select=*,persons(*),reports(*)`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_KEY } }
  ).then(r => r.json());

  if (!match?.[0]) return res.status(404).end();

  const { persons: person, reports: report, confidence } = match[0];
  const chatId = person.telegram_chat_id;
  if (!chatId) return res.status(200).json({ skipped: 'no telegram' });

  const confidencePct = Math.round(confidence * 100);
  const message = `
🔍 *খোজ — সম্ভাব্য মিল পাওয়া গেছে*

আপনার নিবন্ধিত পরিবারের সদস্য *${person.name_bn || person.name}* এর সাথে একটি রিপোর্টের ${confidencePct}% মিল পাওয়া গেছে।

📍 *স্থান:* ${report.location_name || 'অজানা'}
📞 *রিপোর্টকারীর যোগাযোগ:* ${report.reporter_contact || 'প্রদান করা হয়নি'}
🕐 *সময়:* ${new Date(report.created_at).toLocaleString('bn-BD')}

এটি একটি স্বয়ংক্রিয় বার্তা। নিশ্চিত করতে দয়া করে যোগাযোগ করুন।
  `.trim();

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });

  // Mark as notified
  await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/matches?id=eq.${record.id}`,
    {
      method: 'PATCH',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notified: true }),
    }
  );

  res.status(200).json({ ok: true });
}
```

---

### 5. Environment Variables (`.env.local`)

```bash
# Supabase — get from supabase.com dashboard, Project Settings → API
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here        # safe to expose in frontend

# Server-side only (Vercel env vars, never in frontend)
SUPABASE_SERVICE_KEY=your_service_role_key_here   # keep secret
TELEGRAM_BOT_TOKEN=your_bot_token_here            # from @BotFather
```

---

## Phase Breakdown

---

### Phase 0 — Setup (Hours 0–2) completed

**Goal:** Everything scaffolded, connected, and running locally.

**Tasks:**
- [ ] `npm create vite@latest khoj -- --template react` 
- [ ] Install dependencies:
  ```bash
  npm install @supabase/supabase-js face-api.js leaflet react-leaflet
  ```
- [ ] Create Supabase project at [supabase.com](https://supabase.com) (GitHub login, no card)
- [ ] Run the SQL schema above in Supabase SQL editor
- [ ] Enable Supabase Storage bucket `photos` (public read)
- [ ] Create Telegram bot via [@BotFather](https://t.me/BotFather) → `/newbot` → save token
- [ ] Connect Vercel to your GitHub repo (GitHub login, no card)
- [ ] Add all environment variables to Vercel dashboard
- [ ] Download face-api.js model weights into `/public/models/`:
  ```bash
  # Download from github.com/justadudewhohacks/face-api.js/tree/master/weights
  # Need: tiny_face_detector, face_landmark_68_tiny, face_recognition
  ```
- [ ] Confirm: `npm run dev` shows blank React app connected to Supabase

**Done when:** You can `supabase.from('persons').select('*')` from the browser console and get `[]`.

---

### Phase 1 — Family Registration (Hours 2–6) completed

**Goal:** A family can register a person with a photo before any crisis. Face embedding is computed and stored.

**Tasks:**
- [ ] Build `RegisterPerson.jsx`:
  - Name (English + Bengali)
  - Age, gender, home district
  - Photo upload (Camera API or file picker)
  - Telegram username/chat ID for notifications
- [ ] On photo select: run `computeDescriptor()` from `faceMatch.js`
  - Show feedback: "Face detected ✓" or "No face found — please try again"
- [ ] Upload photo to Supabase Storage → get public URL
- [ ] Insert person row to Supabase `persons` table with `face_descriptor`
- [ ] Also save to IndexedDB (so registrations work offline)
- [ ] Build simple person list view showing all registered family members

**Key decision:** Store face descriptors as `float8[]` in Postgres. At 128 floats per person, 10,000 registered people = ~10MB. Well within Supabase free tier.

**Done when:** You register a person with a photo, check Supabase dashboard, see the row with a 128-element array in `face_descriptor`.

---

### Phase 2 — Crisis Reporting (Hours 6–10)

**Goal:** Anyone at a shelter, hospital, or on the street can report a found person — even with no internet.

**Tasks:**
- [ ] Build `ReportFound.jsx`:
  - Photo of found person (camera)
  - Location (Geolocation API auto-fill + manual text field)
  - Brief description (clothing, condition)
  - Reporter's contact (phone or Telegram)
- [ ] Build `ReportMissing.jsx`:
  - Name, last seen location, last seen time
  - Photo (from camera or gallery)
- [ ] On submit: check `navigator.onLine`
  - Online → insert directly to Supabase `reports` table
  - Offline → save to IndexedDB queue via `queueReport()`
- [ ] Show `SyncStatus` indicator: "3 reports waiting to sync" with offline badge
- [ ] Register `window.addEventListener('online', flushQueue)` in `App.jsx`
- [ ] Build `CrisisMap.jsx` using Leaflet + OSM showing pins for all found reports

**Done when:** Submit a found report in airplane mode → turn airplane mode off → report appears in Supabase dashboard automatically.

---

### Phase 3 — Face Matching (Hours 10–14)

**Goal:** When a found report is submitted, it automatically checks against all registered persons and creates match records.

**Tasks:**
- [ ] In `ReportFound.jsx`, after computing `face_descriptor` of found person:
  - Fetch all `persons` from Supabase (or local IndexedDB if offline)
  - Run `matchAgainstRegistry(foundDescriptor, persons)`
  - Display top matches with confidence bars in `MatchResult.jsx`
- [ ] Build `MatchResult.jsx`:
  - Side-by-side: found photo | registered photo
  - Confidence percentage with colour: green (>75%), amber (50–75%), red (<50%)
  - "Confirm Match" and "Not a Match" buttons
- [ ] On "Confirm Match" → insert row into `matches` table
- [ ] On "Not a Match" → log negative sample (helps improve accuracy)
- [ ] Also run matching on the server side via Supabase Edge Function (stretch goal — see Phase 5)

**Accuracy note:** face-api.js with `faceRecognitionNet` achieves ~99.38% accuracy on the LFW benchmark. In real crisis conditions (low light, photos of photos) expect 70–85%. Frame this in your pitch as a "shortlist tool" — it narrows 10,000 candidates to 3 for a human to confirm.

**Done when:** Register a person with your photo → submit a "found" report with a slightly different photo of the same face → match appears with >70% confidence.

---

### Phase 4 — Telegram Notifications (Hours 14–18)

**Goal:** Family receives a Bengali Telegram message the moment a match is confirmed.

**Tasks:**
- [ ] Set up Supabase database webhook on `matches` table:
  - Supabase dashboard → Database → Webhooks → New webhook
  - Trigger: `INSERT` on `matches`
  - URL: `https://your-app.vercel.app/api/telegram-webhook`
- [ ] Deploy `api/telegram-webhook.js` to Vercel
- [ ] Test full flow: confirm a match → check Telegram
- [ ] Add `/start` command handler to bot so families can get their `chat_id`:
  ```javascript
  // In telegram-webhook.js, handle /start command
  // User sends /start → bot replies with their chat_id
  // They paste this chat_id into their Khoj profile
  ```
- [ ] Bengali message templates (translate all notification text)
- [ ] Add photo to Telegram notification using `sendPhoto` instead of `sendMessage`:
  ```javascript
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
    method: 'POST',
    body: JSON.stringify({
      chat_id: chatId,
      photo: report.photo_url,
      caption: bengaliMessage,
      parse_mode: 'Markdown'
    })
  });
  ```

**Done when:** Confirm a match in the app → Telegram bot sends a Bengali message with the found person's photo within 5 seconds.

---

### Phase 5 — Polish + Demo Prep (Hours 18–24)

**Goal:** App is presentable, the demo runs perfectly, the story lands.

**Tasks:**

**PWA + Offline:**
- [ ] Add `manifest.json` with Bengali app name: `"name": "খোজ"`
- [ ] Write `sw.js` service worker caching:
  - Cache face-api.js models (6MB — one-time download)
  - Cache all registered person data
  - Cache app shell for offline use
- [ ] Test: install PWA → airplane mode → app fully works

**Bengali UI:**
- [ ] Add `i18n` strings for all UI labels (keep it simple — just a `strings.js` file)
- [ ] Critical Bengali strings:
  - "পরিবারের সদস্য নিবন্ধন করুন" (Register family member)
  - "নিখোঁজ ব্যক্তি খুঁজুন" (Search for missing person)
  - "পাওয়া গেছে রিপোর্ট করুন" (Report a found person)
  - "মিল পাওয়া গেছে" (Match found)

**Demo data:**
- [ ] Pre-seed 50 registered persons with real-looking data
- [ ] Prepare two photos of the same face for the live demo match
- [ ] Test the full end-to-end flow 5 times until it runs in under 3 minutes

**Stretch goals (if time allows):**
- [ ] Supabase Edge Function for server-side matching (catches reports submitted by people who don't have the app)
- [ ] QR code for each registered person that volunteers can scan at shelters
- [ ] Basic admin view showing all pending matches for human review
- [ ] SMS fallback using a free SMS gateway for those without Telegram

---

## Demo Script (3 Minutes)

**Setup:** Two phones. Judge's Telegram open on their phone.

| Time | Action |
|---|---|
| 0:00 | Open Khoj. Show the home screen in Bengali. "This is Khoj — it means Search." |
| 0:20 | Tap Register. Add a family member using the judge's photo. Show the "Face detected ✓" indicator. Hit save. "This family registered before the flood came." |
| 0:50 | Turn on airplane mode. Show the offline badge. "Internet is down. The city is flooded." |
| 1:10 | Tap Report Found. Take a photo of the same judge from a different angle. Add location: "Mirpur 10 Shelter." Hit submit. Show the "3 reports waiting to sync" indicator. |
| 1:40 | Show the match result on screen — side-by-side photos, "82% match." "Face-api.js matched this in 1.8 seconds. On the device. No internet." |
| 2:00 | Turn airplane mode off. Reports sync. Hit Confirm Match. |
| 2:15 | The judge's Telegram lights up — Bengali message with photo: "আপনার পরিবারের সদস্য মিরপুর ১০ আশ্রয়কেন্দ্রে পাওয়া গেছে।" |
| 2:40 | "In the 2024 floods, 2.3 million people were displaced. In the July crackdown, parents waited days. Khoj would have given them an answer in minutes — offline, in Bengali, for free." |

---

## Supabase Setup Checklist

```
□ Create project at supabase.com (GitHub login — no card)
□ SQL Editor → run schema above
□ Storage → New bucket → name: "photos" → set to Public
□ Authentication → disabled (app uses anonymous sessions for now)
□ Database → Webhooks → New webhook on matches table INSERT
□ Project Settings → API → copy URL and anon key to .env.local
□ Project Settings → API → copy service role key to Vercel env vars
```

## Telegram Bot Setup Checklist

```
□ Open Telegram → search @BotFather
□ Send /newbot → choose name "Khoj Bot" → username "khoj_bd_bot"
□ Copy the token → add to Vercel env vars as TELEGRAM_BOT_TOKEN
□ Send /setdescription → "খোজ — নিখোঁজ পরিবার খুঁজে পেতে সাহায্য করে"
□ Send /setuserpic → upload the Khoj logo
□ Test: send /start to your bot → webhook should return your chat_id
```

## Vercel Deployment Checklist

```
□ Push code to GitHub
□ vercel.com → Import Project → select repo (GitHub login — no card)
□ Add environment variables:
    SUPABASE_SERVICE_KEY = ...
    TELEGRAM_BOT_TOKEN = ...
□ Deploy → copy production URL
□ Paste production URL into Supabase webhook URL field
□ Test full flow end-to-end on production
```

---

## Known Limitations (Be Honest in the Pitch)

| Limitation | Honest framing |
|---|---|
| Face matching accuracy drops in poor lighting | "Khoj is a shortlist tool. It narrows 10,000 people to 3 candidates for a human to confirm — not a definitive answer." |
| Supabase free tier pauses after 1 week of inactivity | "For the hackathon, this is fine. In production, we'd upgrade to a paid plan or self-host." |
| Telegram required for notifications | "85% of Bangladeshi students have Telegram. For others, we fall back to email." |
| Photos of photos (low quality) reduce accuracy | "We show confidence scores. Low confidence = flag for human review, not auto-notify." |

---

## What Gets Built in 24 Hours vs Later

### Hackathon MVP (24 hours)
- Family registration with face embedding ✓
- Found person reporting with offline queue ✓
- On-device face matching with confidence score ✓
- Telegram Bengali notification on match ✓
- Basic map of found locations ✓
- Offline sync ✓

### Post-Hackathon (v1.0)
- Admin dashboard for NGO workers to manage reports
- Bulk import of existing missing persons lists (CSV)
- Server-side matching via Supabase Edge Functions
- QR codes for shelter volunteers to scan found persons
- Integration with DGDA (Directorate General of Drug Administration) hospital records API
- Multi-language: Bengali, Chittagonian, Sylheti

### Future (v2.0)
- IVR (phone call) interface for feature phones
- Partnership with Red Cross IRestoreFamily for data sharing
- Government API integration for official missing persons registry
- Crowd-sourced shelter capacity tracking
