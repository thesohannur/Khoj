import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { matchAgainstRegistry } from '../lib/faceMatch';
import { queueReport, uploadPhoto, cacheMatchRegistry, getCachedMatchRegistry } from '../lib/offlineQueue';
import PhotoSlots, { createSlot } from './PhotoSlots';
import MatchResult from './MatchResult';

// Ask the server to re-verify these candidates against their real stored
// descriptors and, only for genuine matches, return display info + a
// short-lived signed photo URL. Never trust a client-computed confidence
// for what gets revealed — the server recomputes it independently.
async function revealCandidates(queryDescriptors, personIds) {
  const res = await fetch('/api/reveal-match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queryDescriptors, personIds }),
  });
  if (!res.ok) throw new Error(`Reveal failed: ${res.status}`);
  const { candidates } = await res.json();
  return candidates || [];
}

export default function ReportFound({ onReportSuccess }) {
  const [form, setForm] = useState({
    location_name: '',
    location_lat: '',
    location_lng: '',
    description: '',
    reporter_contact: ''
  });

  const [slots, setSlots] = useState([createSlot('Front photo (required) / সামনের ছবি', true)]);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Matching States
  const [showMatches, setShowMatches] = useState(false);
  const [candidateMatches, setCandidateMatches] = useState([]);
  const [pendingReveal, setPendingReveal] = useState(null); // { queryDescriptors, personIds } while offline
  const [createdReportId, setCreatedReportId] = useState(null);
  const [createdLocalReportId, setCreatedLocalReportId] = useState(null);
  const [createdPhotoUrl, setCreatedPhotoUrl] = useState(null);

  const runReveal = useCallback(async (queryDescriptors, personIds) => {
    try {
      const revealed = await revealCandidates(queryDescriptors, personIds);
      const byId = new Map(revealed.map(r => [r.id, r]));
      setCandidateMatches(prev => prev.map(c => byId.has(c.id) ? { ...c, ...byId.get(c.id), revealed: true } : c));
      setPendingReveal(null);
    } catch (err) {
      console.error('Failed to reveal match candidates:', err);
    }
  }, []);

  // If a match was found while offline, reveal identity/photo as soon as
  // connectivity returns (the component must stay mounted to catch this).
  useEffect(() => {
    if (!pendingReveal) return;
    function onOnline() {
      runReveal(pendingReveal.queryDescriptors, pendingReveal.personIds);
    }
    if (navigator.onLine) {
      onOnline();
      return;
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [pendingReveal, runReveal]);

  // Autofill current device coordinates
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm(prev => ({
          ...prev,
          location_lat: position.coords.latitude.toFixed(6),
          location_lng: position.coords.longitude.toFixed(6)
        }));
        setFetchingLocation(false);
      },
      (error) => {
        console.error('Error fetching geolocation:', error);
        alert(`Could not fetch location: ${error.message}`);
        setFetchingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (slots[0].status !== 'detected') {
      setStatusMessage({ type: 'error', text: 'A front photo with a detected face is required to report a found person.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const isOnline = navigator.onLine;

    const latVal = form.location_lat ? parseFloat(form.location_lat) : null;
    const lngVal = form.location_lng ? parseFloat(form.location_lng) : null;
    const usableSlots = slots.filter(s => s.status === 'detected');
    const queryDescriptors = usableSlots.map(s => s.descriptor);

    try {
      // Matching always runs on-device against the descriptor-only cache
      // (id + face_descriptors, no PII) — works fully offline. Online, we
      // refresh that cache first so brand-new registrations are included.
      let registry;
      if (isOnline) {
        const { data, error } = await supabase.rpc('get_match_registry');
        if (!error && data) {
          cacheMatchRegistry(data).catch(err => console.error('Failed to cache match registry:', err));
          registry = data;
        } else {
          registry = await getCachedMatchRegistry();
        }
      } else {
        registry = await getCachedMatchRegistry();
      }

      const localMatches = matchAgainstRegistry(queryDescriptors, registry);
      const candidates = localMatches.map(m => ({ id: m.entry.id, confidence: m.confidence, revealed: false }));
      const personIds = candidates.map(c => c.id);

      if (isOnline) {
        setStatusMessage({ type: 'info', text: 'Uploading photos and reporting...' });
        const photoUrls = [];
        for (const slot of usableSlots) {
          photoUrls.push(await uploadPhoto(slot.preview, slot.file.name));
        }

        const { data: insertedReport, error } = await supabase
          .from('reports')
          .insert({
            type: 'found',
            photo_urls: photoUrls,
            face_descriptors: queryDescriptors,
            location_name: form.location_name,
            location_lat: latVal,
            location_lng: lngVal,
            description: form.description,
            reporter_contact: form.reporter_contact,
            synced: true
          })
          .select()
          .single();

        if (error) throw error;

        if (candidates.length > 0) {
          setCandidateMatches(candidates);
          setCreatedReportId(insertedReport.id);
          setCreatedLocalReportId(null);
          setCreatedPhotoUrl(photoUrls[0]);
          setShowMatches(true);
          runReveal(queryDescriptors, personIds);
        } else {
          setStatusMessage({ type: 'success', text: '🎉 Report submitted successfully! No matching faces found in registry.' });
        }

      } else {
        const localReportId = await queueReport({
          type: 'found',
          photosData: usableSlots.map(s => ({ data: s.preview, name: s.file.name })),
          face_descriptors: queryDescriptors,
          location_name: form.location_name,
          location_lat: latVal,
          location_lng: lngVal,
          description: form.description,
          reporter_contact: form.reporter_contact,
          synced: false
        });

        if (candidates.length > 0) {
          setCandidateMatches(candidates);
          setCreatedReportId(null);
          setCreatedLocalReportId(localReportId);
          setCreatedPhotoUrl(usableSlots[0].preview);
          setShowMatches(true);
          setPendingReveal({ queryDescriptors, personIds });
          setStatusMessage({
            type: 'success',
            text: '📡 Saved report offline. Match found on-device — details will reveal once you\'re back online. It will sync automatically.'
          });
        } else {
          setStatusMessage({
            type: 'success',
            text: '📡 Saved report offline. No on-device match found. It will automatically sync once connection returns.'
          });
        }
      }

      // Reset form on success (keep matches state intact)
      setForm({
        location_name: '',
        location_lat: '',
        location_lng: '',
        description: '',
        reporter_contact: ''
      });
      setSlots([createSlot('Front photo (required) / সামনের ছবি', true)]);
      if (onReportSuccess) onReportSuccess();

    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Submission failed: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="registration-card">
      <h2>Report Found Person / পাওয়া গেছে এমন ব্যক্তি রিপোর্ট করুন</h2>
      <p className="card-subtitle">Report someone you have located at a shelter, hospital, or street corner.</p>

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group">
          <label style={{ marginBottom: 0 }}>Photos of Found Person / ছবি *</label>
          <p className="help-text" style={{ margin: '-0.25rem 0 0.25rem' }}>
            Upload up to 3 photos — a front photo is required; adding left/right side angles improves match accuracy.
          </p>
          <PhotoSlots slots={slots} onChange={setSlots} />
        </div>

        <div className="form-group">
          <label>Location / আশ্রয়ের নাম বা স্থানের নাম *</label>
          <input
            type="text"
            required
            placeholder="e.g. Mirpur 10 Shelter Home / Dhaka Medical"
            value={form.location_name}
            onChange={e => setForm({ ...form, location_name: e.target.value })}
          />
        </div>

        <div className="form-row">
          <div className="form-group half">
            <label>Latitude (Coordinates)</label>
            <input
              type="text"
              placeholder="e.g. 23.8103"
              value={form.location_lat}
              onChange={e => setForm({ ...form, location_lat: e.target.value })}
            />
          </div>

          <div className="form-group half">
            <label>Longitude (Coordinates)</label>
            <input
              type="text"
              placeholder="e.g. 90.4125"
              value={form.location_lng}
              onChange={e => setForm({ ...form, location_lng: e.target.value })}
            />
          </div>
        </div>

        <button
          type="button"
          className="secondary-btn"
          onClick={handleGetLocation}
          disabled={fetchingLocation}
          style={{ width: 'fit-content', marginTop: '-0.5rem' }}
        >
          {fetchingLocation ? 'Fetching GPS...' : '📍 Auto-fill Current GPS'}
        </button>

        <div className="form-group">
          <label>Physical Description / বর্ণনা</label>
          <textarea
            rows="3"
            placeholder="Describe clothing, age, physical status, marks, or any spoken details..."
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="form-group">
          <label>Reporter Contact / আপনার মোবাইল নং বা যোগাযোগের মাধ্যম *</label>
          <input
            type="text"
            required
            placeholder="Phone number, Telegram or contact details"
            value={form.reporter_contact}
            onChange={e => setForm({ ...form, reporter_contact: e.target.value })}
          />
        </div>

        {statusMessage && (
          <div className={`status-banner ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        <button
          type="submit"
          className="submit-btn"
          disabled={submitting || slots[0].status !== 'detected'}
        >
          {submitting ? 'Submitting...' : 'Submit Found Report'}
        </button>
      </form>

      {/* Render MatchResult Modal Overlay when matches exist */}
      {showMatches && (
        <MatchResult
          matches={candidateMatches}
          reportId={createdReportId}
          localReportId={createdLocalReportId}
          foundPhotoUrl={createdPhotoUrl}
          onClose={() => {
            setShowMatches(false);
            setCandidateMatches([]);
            setCreatedReportId(null);
            setCreatedLocalReportId(null);
            setCreatedPhotoUrl(null);
            setPendingReveal(null);
          }}
        />
      )}
    </div>
  );
}
