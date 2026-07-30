import { supabase } from './supabase';

const DB_NAME = 'khoj-offline';
const DB_VERSION = 3;
const STORES = {
  reports: 'pending-reports',
  registrations: 'pending-registrations',
  matches: 'pending-matches',
  negativeFeedback: 'negative-feedback',
  personsCache: 'persons-cache',
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.reports)) {
        db.createObjectStore(STORES.reports, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.registrations)) {
        db.createObjectStore(STORES.registrations, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.matches)) {
        db.createObjectStore(STORES.matches, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.negativeFeedback)) {
        db.createObjectStore(STORES.negativeFeedback, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.personsCache)) {
        // keyed by the person's real Supabase id, so a re-cache just overwrites
        db.createObjectStore(STORES.personsCache, { keyPath: 'id' });
      }
    };

    request.onsuccess = event => resolve(event.target.result);
    request.onerror = reject;
  });
}

// Queue offline report. Returns the local queue id so callers can
// reference this not-yet-synced report (e.g. for an offline match).
export async function queueReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.reports, 'readwrite');
    const addRequest = tx.objectStore(STORES.reports).add({ ...report, queuedAt: Date.now() });
    addRequest.onsuccess = () => resolve(addRequest.result);
    tx.onerror = reject;
  });
}

// Queue offline registration
export async function queueRegistration(registration) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.registrations, 'readwrite');
    const addRequest = tx.objectStore(STORES.registrations).add({ ...registration, queuedAt: Date.now() });
    addRequest.onsuccess = () => resolve(addRequest.result);
    tx.onerror = reject;
  });
}

// Queue a confirmed match made while offline (or against a report that
// hasn't synced yet). If the report itself is still offline, pass
// localReportId instead of reportId — flushQueue() resolves it once the
// report syncs and gets a real id.
export async function queueMatch({ personId, confidence, reportId = null, localReportId = null }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.matches, 'readwrite');
    const addRequest = tx.objectStore(STORES.matches).add({
      person_id: personId,
      confidence,
      report_id: reportId,
      local_report_id: localReportId,
      queuedAt: Date.now(),
    });
    addRequest.onsuccess = () => resolve(addRequest.result);
    tx.onerror = reject;
  });
}

// Record a "not a match" decision locally (there is no negative_feedback
// table in the current Supabase schema, so this stays device-local).
export async function queueNegativeFeedback({ personId, confidence, reportId = null, localReportId = null }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.negativeFeedback, 'readwrite');
    tx.objectStore(STORES.negativeFeedback).add({
      person_id: personId,
      confidence,
      report_id: reportId,
      local_report_id: localReportId,
      queuedAt: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// Replace the local persons cache with the latest registry snapshot so
// face matching can run against it while offline.
export async function cachePersons(persons) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.personsCache, 'readwrite');
    const store = tx.objectStore(STORES.personsCache);
    store.clear();
    for (const person of persons) {
      if (person && person.id) store.put(person);
    }
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

export async function getCachedPersons() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORES.personsCache).objectStore(STORES.personsCache).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = reject;
  });
}

// Counts of everything still waiting to sync, for the SyncStatus banner.
// Always goes through openDB() so the schema is guaranteed to exist —
// never open this database with a second, ad-hoc indexedDB.open() call
// elsewhere, or you risk creating it before the real upgrade logic runs.
export async function getPendingCounts() {
  const db = await openDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.reports, STORES.registrations, STORES.matches], 'readonly');
      let reports = 0;
      let registrations = 0;
      let matches = 0;

      tx.objectStore(STORES.reports).count().onsuccess = e => { reports = e.target.result; };
      tx.objectStore(STORES.registrations).count().onsuccess = e => { registrations = e.target.result; };
      tx.objectStore(STORES.matches).count().onsuccess = e => { matches = e.target.result; };

      tx.oncomplete = () => resolve({ reports, registrations, matches });
      tx.onerror = () => resolve({ reports: 0, registrations: 0, matches: 0 });
    } catch (e) {
      resolve({ reports: 0, registrations: 0, matches: 0 });
    }
  });
}

// Upload photo helper (used during sync or normal flows)
export async function uploadPhoto(fileData, fileName) {
  // fileData can be a Blob, File, or base64 string
  let body = fileData;

  if (typeof fileData === 'string' && fileData.startsWith('data:')) {
    // Convert base64 data URI to Blob
    const response = await fetch(fileData);
    body = await response.blob();
  }

  const cleanFileName = `${Date.now()}_${fileName || 'photo.jpg'}`;
  const { data, error } = await supabase.storage
    .from('photos')
    .upload(cleanFileName, body, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from('photos')
    .getPublicUrl(cleanFileName);

  return publicUrlData.publicUrl;
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName).objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = reject;
  });
}

function deleteFromStore(db, storeName, id) {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(id);
}

function putInStore(db, storeName, value) {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
}

// App.jsx's online listener and this module's own online listener can
// both fire flushQueue() for the same reconnect event. Without a guard,
// concurrent runs would each read the same not-yet-deleted pending items
// and sync them twice. Callers share the in-flight run instead of
// starting a second one.
let flushPromise = null;

export function flushQueue() {
  if (!navigator.onLine) return Promise.resolve();
  if (!flushPromise) {
    flushPromise = runFlush().finally(() => { flushPromise = null; });
  }
  return flushPromise;
}

async function runFlush() {
  const db = await openDB();

  // 1. Flush pending registrations
  const pendingRegistrations = await getAllFromStore(db, STORES.registrations);
  for (const reg of pendingRegistrations) {
    try {
      let photoUrl = reg.photo_url;
      if (reg.photoData) {
        photoUrl = await uploadPhoto(reg.photoData, reg.photoName || 'offline_registration.jpg');
      }

      const row = {
        name: reg.name,
        name_bn: reg.name_bn,
        age: reg.age,
        gender: reg.gender,
        district: reg.district,
        photo_url: photoUrl,
        face_descriptor: reg.face_descriptor,
        telegram_chat_id: reg.telegram_chat_id
      };

      const { error } = await supabase.from('persons').insert(row);
      if (!error) {
        deleteFromStore(db, STORES.registrations, reg.id);
      } else {
        console.error('Error syncing registration to Supabase:', error.message);
      }
    } catch (err) {
      console.error('Failed to sync registration:', err);
    }
  }

  // 2. Flush pending reports, resolving any matches queued against them
  const pendingReports = await getAllFromStore(db, STORES.reports);
  for (const report of pendingReports) {
    try {
      let photoUrl = report.photo_url;
      if (report.photoData) {
        photoUrl = await uploadPhoto(report.photoData, report.photoName || 'offline_report.jpg');
      }

      const row = {
        type: report.type,
        photo_url: photoUrl,
        face_descriptor: report.face_descriptor,
        location_lat: report.location_lat,
        location_lng: report.location_lng,
        location_name: report.location_name,
        description: report.description,
        reporter_contact: report.reporter_contact,
        synced: true
      };

      const { data: insertedReport, error } = await supabase.from('reports').insert(row).select().single();
      if (!error && insertedReport) {
        // Resolve any matches/negative feedback that were queued against
        // this report before it had a real id.
        const pendingMatches = await getAllFromStore(db, STORES.matches);
        for (const match of pendingMatches) {
          if (match.local_report_id === report.id) {
            putInStore(db, STORES.matches, { ...match, report_id: insertedReport.id, local_report_id: null });
          }
        }
        const pendingFeedback = await getAllFromStore(db, STORES.negativeFeedback);
        for (const fb of pendingFeedback) {
          if (fb.local_report_id === report.id) {
            putInStore(db, STORES.negativeFeedback, { ...fb, report_id: insertedReport.id, local_report_id: null });
          }
        }

        deleteFromStore(db, STORES.reports, report.id);
      } else {
        console.error('Error syncing report to Supabase:', error?.message);
      }
    } catch (err) {
      console.error('Failed to sync report:', err);
    }
  }

  // 3. Flush match confirmations that now have a resolved report_id
  const pendingMatches = await getAllFromStore(db, STORES.matches);
  for (const match of pendingMatches) {
    if (!match.report_id) continue; // still waiting on its report to sync
    try {
      const { error } = await supabase.from('matches').insert({
        person_id: match.person_id,
        report_id: match.report_id,
        confidence: match.confidence,
        notified: false
      });
      if (!error) {
        deleteFromStore(db, STORES.matches, match.id);
      } else {
        console.error('Error syncing match to Supabase:', error.message);
      }
    } catch (err) {
      console.error('Failed to sync match:', err);
    }
  }

  // Negative feedback stays purely local — nothing to push to Supabase.
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushQueue);
}
