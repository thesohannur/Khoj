import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { queueReport, uploadPhoto } from '../lib/offlineQueue';
import PhotoSlots, { createSlot } from './PhotoSlots';

export default function ReportMissing({ onReportSuccess }) {
  const [form, setForm] = useState({
    name: '',
    location_name: '',
    last_seen_time: '',
    description: '',
    reporter_contact: ''
  });

  const [slots, setSlots] = useState([createSlot('Front photo (required) / সামনের ছবি', true)]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (slots[0].status !== 'detected') {
      setStatusMessage({ type: 'error', text: 'A front photo with a detected face is required to report a missing person.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const isOnline = navigator.onLine;
    const usableSlots = slots.filter(s => s.status === 'detected');
    const faceDescriptors = usableSlots.map(s => s.descriptor);
    const description = `Name: ${form.name}. ${form.description || ''} (Last seen: ${form.last_seen_time})`;

    try {
      if (isOnline) {
        setStatusMessage({ type: 'info', text: 'Uploading photos and reporting...' });
        const photoUrls = [];
        for (const slot of usableSlots) {
          photoUrls.push(await uploadPhoto(slot.preview, slot.file.name));
        }

        const { error } = await supabase.from('reports').insert({
          type: 'missing',
          photo_urls: photoUrls,
          face_descriptors: faceDescriptors,
          location_name: form.location_name,
          description,
          reporter_contact: form.reporter_contact,
          synced: true
        });

        if (error) throw error;
        setStatusMessage({ type: 'success', text: '🎉 Report submitted successfully to database!' });
      } else {
        await queueReport({
          type: 'missing',
          photosData: usableSlots.map(s => ({ data: s.preview, name: s.file.name })),
          face_descriptors: faceDescriptors,
          location_name: form.location_name,
          description,
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
      <h2>Report Missing Person / নিখোঁজ ব্যক্তি রিপোর্ট করুন</h2>
      <p className="card-subtitle">Report a family member or friend who is missing.</p>

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group">
          <label style={{ marginBottom: 0 }}>Photos of Missing Person / ছবি *</label>
          <p className="help-text" style={{ margin: '-0.25rem 0 0.25rem' }}>
            Upload up to 3 photos — a front photo is required; adding left/right side angles improves match accuracy.
          </p>
          <PhotoSlots slots={slots} onChange={setSlots} />
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
          <label>Last Seen Location / শেষবার কোথায় দেখা গেছে *</label>
          <input
            type="text"
            required
            placeholder="e.g. Feni Town / Noakhali College Shelter"
            value={form.location_name}
            onChange={e => setForm({ ...form, location_name: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Last Seen Time / শেষ দেখার সময়</label>
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
          disabled={submitting || slots[0].status !== 'detected'}
        >
          {submitting ? 'Submitting...' : 'Submit Missing Report'}
        </button>
      </form>
    </div>
  );
}
