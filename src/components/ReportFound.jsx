import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { computeDescriptor, matchAgainstRegistry } from '../lib/faceMatch';
import { queueReport, uploadPhoto, cachePersons, getCachedPersons } from '../lib/offlineQueue';
import MatchResult from './MatchResult';

export default function ReportFound({ onReportSuccess }) {
  const [form, setForm] = useState({
    location_name: '',
    location_lat: '',
    location_lng: '',
    description: '',
    reporter_contact: ''
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [faceStatus, setFaceStatus] = useState('idle'); // idle | processing | detected | error
  const [descriptor, setDescriptor] = useState(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  
  // Matching States
  const [showMatches, setShowMatches] = useState(false);
  const [candidateMatches, setCandidateMatches] = useState([]);
  const [createdReportId, setCreatedReportId] = useState(null);
  const [createdLocalReportId, setCreatedLocalReportId] = useState(null);
  const [createdPhotoUrl, setCreatedPhotoUrl] = useState(null);

  const fileInputRef = useRef(null);

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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageFile(file);
    setFaceStatus('processing');
    setDescriptor(null);
    setStatusMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);

      const img = new Image();
      img.src = event.target.result;
      img.onload = async () => {
        try {
          const desc = await computeDescriptor(img);
          if (desc) {
            setDescriptor(desc);
            setFaceStatus('detected');
          } else {
            setFaceStatus('error');
            setStatusMessage({ type: 'error', text: 'No face detected. Try a clearer photo for matching.' });
          }
        } catch (err) {
          console.error(err);
          setFaceStatus('error');
          setStatusMessage({ type: 'error', text: 'Error executing face embedding.' });
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!descriptor) {
      setStatusMessage({ type: 'error', text: 'A photo with a detected face is required to report a found person.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const isOnline = navigator.onLine;

    const latVal = form.location_lat ? parseFloat(form.location_lat) : null;
    const lngVal = form.location_lng ? parseFloat(form.location_lng) : null;

    try {
      if (isOnline) {
        setStatusMessage({ type: 'info', text: 'Uploading photo and reporting...' });
        const publicUrl = await uploadPhoto(imagePreview, imageFile.name);

        // 1. Submit report to Supabase
        const { data: insertedReport, error } = await supabase
          .from('reports')
          .insert({
            type: 'found',
            photo_url: publicUrl,
            face_descriptor: descriptor,
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

        // 2. Fetch registered persons and run face matching
        setStatusMessage({ type: 'info', text: 'Running face matching engine...' });
        const { data: persons, error: personsErr } = await supabase
          .from('persons')
          .select('*');

        if (!personsErr && persons) {
          cachePersons(persons).catch(err => console.error('Failed to cache persons:', err));
          const matches = matchAgainstRegistry(descriptor, persons);
          if (matches.length > 0) {
            setCandidateMatches(matches);
            setCreatedReportId(insertedReport.id);
            setCreatedLocalReportId(null);
            setCreatedPhotoUrl(publicUrl);
            setShowMatches(true);
          } else {
            setStatusMessage({ type: 'success', text: '🎉 Report submitted successfully! No matching faces found in database.' });
          }
        } else {
          setStatusMessage({ type: 'success', text: '🎉 Report submitted successfully!' });
        }

      } else {
        const localReportId = await queueReport({
          type: 'found',
          photoData: imagePreview,
          photoName: imageFile.name,
          face_descriptor: descriptor,
          location_name: form.location_name,
          location_lat: latVal,
          location_lng: lngVal,
          description: form.description,
          reporter_contact: form.reporter_contact,
          synced: false
        });

        // Matching runs entirely on-device against the persons cached the
        // last time we were online — no network needed to find a match.
        const cachedPersons = await getCachedPersons();
        const matches = matchAgainstRegistry(descriptor, cachedPersons);

        if (matches.length > 0) {
          setCandidateMatches(matches);
          setCreatedReportId(null);
          setCreatedLocalReportId(localReportId);
          setCreatedPhotoUrl(imagePreview);
          setShowMatches(true);
          setStatusMessage({
            type: 'success',
            text: '📡 Saved report offline. Match found on-device — review below. It will sync once connection returns.'
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
      setImageFile(null);
      setImagePreview(null);
      setFaceStatus('idle');
      setDescriptor(null);
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
      <h2>Report Found Person / পাওয়া গেছে এমন ব্যক্তি রিপোর্ট করুন</h2>
      <p className="card-subtitle">Report someone you have located at a shelter, hospital, or street corner.</p>

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group photo-upload-group">
          <label>Photo of Found Person *</label>
          <div className="file-dropzone" onClick={() => fileInputRef.current.click()}>
            {imagePreview ? (
              <div className="preview-container">
                <img src={imagePreview} alt="Preview" className="preview-img" />
                <div className="change-photo-badge">Change Photo</div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">📷</span>
                <span>Click to take/upload photo of found person</span>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {faceStatus !== 'idle' && (
            <div className={`face-status-badge ${faceStatus}`}>
              {faceStatus === 'processing' && (
                <>
                  <span className="spinner">⏳</span>
                  <span>Scanning photo for face structure...</span>
                </>
              )}
              {faceStatus === 'detected' && (
                <span>✅ Face successfully detected. Ready to match!</span>
              )}
              {faceStatus === 'error' && (
                <span>❌ No face detected. Please select a clearer photo.</span>
              )}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Location / আশ্রয়ের নাম বা স্থানের নাম *</label>
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
          disabled={submitting || faceStatus !== 'detected'}
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
          }}
        />
      )}
    </div>
  );
}
