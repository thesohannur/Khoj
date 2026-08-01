import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { queueRegistration, uploadPhoto } from '../lib/offlineQueue';
import PhotoSlots, { createSlot } from './PhotoSlots';

export default function RegisterPerson({ onRegisterSuccess, session }) {
  const [form, setForm] = useState({
    name: '',
    name_bn: '',
    age: '',
    gender: 'Male',
    district: '',
    telegram_chat_id: ''
  });

  const [slots, setSlots] = useState([createSlot('Front photo (required) / সামনের ছবি', true)]);
  const [displayId, setDisplayId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (slots[0].status !== 'detected') {
      setStatusMessage({ type: 'error', text: 'Please upload a front photo with a valid face first.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const isOnline = navigator.onLine;
    const registeredBy = session?.user?.id;
    const usableSlots = slots.filter(s => s.status === 'detected');
    const displayIndex = Math.max(0, usableSlots.findIndex(s => s.id === displayId));
    const faceDescriptors = usableSlots.map(s => s.descriptor);

    try {
      if (isOnline) {
        setStatusMessage({ type: 'info', text: 'Uploading photos and registering...' });
        // Upload every usable photo to the private person-photos bucket —
        // returns storage paths, not public URLs (only the owner can sign
        // them later).
        const photoUrls = [];
        for (const slot of usableSlots) {
          photoUrls.push(await uploadPhoto(slot.preview, slot.file.name, 'person-photos'));
        }

        const { error } = await supabase.from('persons').insert({
          name: form.name,
          name_bn: form.name_bn,
          age: form.age ? parseInt(form.age, 10) : null,
          gender: form.gender,
          district: form.district,
          photo_urls: photoUrls,
          face_descriptors: faceDescriptors,
          display_photo_index: displayIndex,
          telegram_chat_id: form.telegram_chat_id,
          registered_by: registeredBy
        });

        if (error) throw error;

        setStatusMessage({ type: 'success', text: '🎉 Person registered successfully in Supabase!' });
      } else {
        // Offline: Save to IndexedDB
        await queueRegistration({
          name: form.name,
          name_bn: form.name_bn,
          age: form.age ? parseInt(form.age, 10) : null,
          gender: form.gender,
          district: form.district,
          photosData: usableSlots.map(s => ({ data: s.preview, name: s.file.name })),
          face_descriptors: faceDescriptors,
          display_photo_index: displayIndex,
          telegram_chat_id: form.telegram_chat_id,
          registered_by: registeredBy
        });

        setStatusMessage({
          type: 'success',
          text: '📡 Registered offline. Registration saved locally and will sync when internet connection is restored.'
        });
      }

      // Reset form on success
      setForm({
        name: '',
        name_bn: '',
        age: '',
        gender: 'Male',
        district: '',
        telegram_chat_id: ''
      });
      setSlots([createSlot('Front photo (required) / সামনের ছবি', true)]);
      setDisplayId(null);
      if (onRegisterSuccess) onRegisterSuccess();

    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Failed to register: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="registration-card">
      <h2>Family Registration / পরিবারের সদস্য নিবন্ধন</h2>
      <p className="card-subtitle">Register family members in advance to enable rapid matching during a crisis.</p>

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group">
          <label>Full Name (English) *</label>
          <input
            type="text"
            required
            placeholder="e.g. Abul Kalam"
            value={form.name}
            onChange={e => setForm({...form, name: e.target.value})}
          />
        </div>

        <div className="form-group">
          <label>পূর্ণ নাম (বাংলা)</label>
          <input
            type="text"
            placeholder="উদা: আবুল কালাম"
            value={form.name_bn}
            onChange={e => setForm({...form, name_bn: e.target.value})}
          />
        </div>

        <div className="form-row">
          <div className="form-group half">
            <label>Age / বয়স</label>
            <input
              type="number"
              placeholder="Age"
              value={form.age}
              onChange={e => setForm({...form, age: e.target.value})}
            />
          </div>

          <div className="form-group half">
            <label>Gender / লিঙ্গ</label>
            <select
              value={form.gender}
              onChange={e => setForm({...form, gender: e.target.value})}
            >
              <option value="Male">Male / পুরুষ</option>
              <option value="Female">Female / নারী</option>
              <option value="Other">Other / অন্যান্য</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Home District / নিজ জেলা</label>
          <input
            type="text"
            placeholder="e.g. Dhaka, Chittagong"
            value={form.district}
            onChange={e => setForm({...form, district: e.target.value})}
          />
        </div>

        <div className="form-group">
          <label>Telegram Chat ID (for notifications)</label>
          <input
            type="text"
            placeholder="e.g. 182736452"
            value={form.telegram_chat_id}
            onChange={e => setForm({...form, telegram_chat_id: e.target.value})}
          />
          <small className="help-text">
            Send <code>/start</code> to <a href="https://t.me/khoj_bd_bot" target="_blank" rel="noreferrer">@khoj_bd_bot</a> to get your Chat ID.
          </small>
        </div>

        <div className="form-group">
          <label style={{ marginBottom: 0 }}>Photos / ছবি *</label>
          <p className="help-text" style={{ margin: '-0.25rem 0 0.25rem' }}>
            Upload up to 3 photos — a front photo is required; adding left/right side angles improves match accuracy. Pick which one shows in your family list.
          </p>
          <PhotoSlots
            slots={slots}
            onChange={setSlots}
            showDisplayPicker
            displayId={displayId}
            onDisplayChange={setDisplayId}
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
          {submitting ? 'Registering...' : 'Register Member'}
        </button>
      </form>
    </div>
  );
}
