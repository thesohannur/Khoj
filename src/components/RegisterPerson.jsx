import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { computeDescriptor } from '../lib/faceMatch';
import { queueRegistration, uploadPhoto } from '../lib/offlineQueue';

export default function RegisterPerson({ onRegisterSuccess }) {
  const [form, setForm] = useState({
    name: '',
    name_bn: '',
    age: '',
    gender: 'Male',
    district: '',
    telegram_chat_id: ''
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [faceStatus, setFaceStatus] = useState('idle'); // idle | processing | detected | error
  const [descriptor, setDescriptor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const fileInputRef = useRef(null);

  // When a file is selected, read it for preview and run face descriptor calculation
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
      
      // Load image into an HTMLImageElement to pass to face-api
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
            setStatusMessage({ type: 'error', text: 'No face detected. Please try a clear front-facing photo with good lighting and the face centered.' });
          }
        } catch (err) {
          console.error('Face processing error:', err);
          setFaceStatus('error');
          setStatusMessage({ type: 'error', text: `Face model error: ${err.message || 'Please try again.'}` });
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!descriptor) {
      setStatusMessage({ type: 'error', text: 'Please upload a photo with a valid face first.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    const isOnline = navigator.onLine;

    try {
      if (isOnline) {
        setStatusMessage({ type: 'info', text: 'Uploading photo and registering...' });
        // Upload photo to Supabase storage
        const publicUrl = await uploadPhoto(imagePreview, imageFile.name);

        // Save row to supabase database
        const { error } = await supabase.from('persons').insert({
          name: form.name,
          name_bn: form.name_bn,
          age: form.age ? parseInt(form.age, 10) : null,
          gender: form.gender,
          district: form.district,
          photo_url: publicUrl,
          face_descriptor: descriptor,
          telegram_chat_id: form.telegram_chat_id
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
          photoData: imagePreview,
          photoName: imageFile.name,
          face_descriptor: descriptor,
          telegram_chat_id: form.telegram_chat_id
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
      setImageFile(null);
      setImagePreview(null);
      setFaceStatus('idle');
      setDescriptor(null);
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
            <label>Age / বয়স</label>
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

        <div className="form-group photo-upload-group">
          <label>Upload Photo / ছবি আপলোড *</label>
          <div className="file-dropzone" onClick={() => fileInputRef.current.click()}>
            {imagePreview ? (
              <div className="preview-container">
                <img src={imagePreview} alt="Preview" className="preview-img" />
                <div className="change-photo-badge">Change Photo</div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <span className="upload-icon">📷</span>
                <span>Click to take or upload photo</span>
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
          
          {/* Face Detection Status Indicator */}
          {faceStatus !== 'idle' && (
            <div className={`face-status-badge ${faceStatus}`}>
              {faceStatus === 'processing' && (
                <>
                  <span className="spinner">⏳</span>
                  <span>Scanning photo for face embeddings...</span>
                </>
              )}
              {faceStatus === 'detected' && (
                <span>✅ Face successfully detected and embedded!</span>
              )}
              {faceStatus === 'error' && (
                <span>❌ No face detected. Please try another photo.</span>
              )}
            </div>
          )}
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
          {submitting ? 'Registering...' : 'Register Member'}
        </button>
      </form>
    </div>
  );
}
