import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { computeDescriptor } from '../lib/faceMatch';
import { queueReport, uploadPhoto } from '../lib/offlineQueue';

export default function ReportMissing({ onReportSuccess }) {
  const [form, setForm] = useState({
    name: '',
    location_name: '',
    last_seen_time: '',
    description: '',
    reporter_contact: ''
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [faceStatus, setFaceStatus] = useState('idle'); // idle | processing | detected | error
  const [descriptor, setDescriptor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const fileInputRef = useRef(null);

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
            setStatusMessage({ type: 'error', text: 'No face detected. Try a clearer photo of the person.' });
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
      setStatusMessage({ type: 'error', text: 'A photo with a detected face is required to report a missing person.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const isOnline = navigator.onLine;

    try {
      if (isOnline) {
        setStatusMessage({ type: 'info', text: 'Uploading photo and reporting...' });
        const publicUrl = await uploadPhoto(imagePreview, imageFile.name);

        const { error } = await supabase.from('reports').insert({
          type: 'missing',
          photo_url: publicUrl,
          face_descriptor: descriptor,
          location_name: form.location_name,
          description: `Name: ${form.name}. ${form.description || ''} (Last seen: ${form.last_seen_time})`,
          reporter_contact: form.reporter_contact,
          synced: true
        });

        if (error) throw error;
        setStatusMessage({ type: 'success', text: '🎉 Report submitted successfully to database!' });
      } else {
        await queueReport({
          type: 'missing',
          photoData: imagePreview,
          photoName: imageFile.name,
          face_descriptor: descriptor,
          location_name: form.location_name,
          description: `Name: ${form.name}. ${form.description || ''} (Last seen: ${form.last_seen_time})`,
          reporter_contact: form.reporter_contact,
          synced: false
        });

        setStatusMessage({
          type: 'success',
          text: '📡 Saved report offline. It will automatically sync once connection returns.'
        });
      }

      // Reset form
      setForm({
        name: '',
        location_name: '',
        last_seen_time: '',
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
      <h2>Report Missing Person / নিখোঁজ ব্যক্তি রিপোর্ট করুন</h2>
      <p className="card-subtitle">Report a family member or friend who is missing.</p>

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group photo-upload-group">
          <label>Photo of Missing Person *</label>
          <div className="file-dropzone" onClick={() => fileInputRef.current.click()}>
            {imagePreview ? (
              <div className="preview-container">
                <img src={imagePreview} alt="Preview" className="preview-img" />
                <div className="change-photo-badge">Change Photo</div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">📷</span>
                <span>Click to take/upload photo of missing person</span>
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
          <label>Person's Name / নিখোঁজ ব্যক্তির নাম *</label>
          <input
            type="text"
            required
            placeholder="e.g. Rahim Uddin"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Last Seen Location / শেষবার কোথায় দেখা গেছে *</label>
          <input
            type="text"
            required
            placeholder="e.g. Feni Town / Noakhali College Shelter"
            value={form.location_name}
            onChange={e => setForm({ ...form, location_name: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Last Seen Time / শেষ দেখার সময়</label>
          <input
            type="datetime-local"
            value={form.last_seen_time}
            onChange={e => setForm({ ...form, last_seen_time: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Additional Details / অতিরিক্ত বর্ণনা</label>
          <textarea
            rows="3"
            placeholder="Describe clothing, physical features, marks, or context..."
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
          {submitting ? 'Submitting...' : 'Submit Missing Report'}
        </button>
      </form>
    </div>
  );
}
