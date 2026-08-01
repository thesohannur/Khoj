import { useRef } from 'react';
import { computeDescriptor } from '../lib/faceMatch';

let nextSlotId = 1;

export function createSlot(label, required) {
  return { id: nextSlotId++, label, required, file: null, preview: null, descriptor: null, status: 'idle' };
}

// Up to 3 photo slots (front required, up to 2 optional side angles),
// each computing its own face descriptor. Shared by RegisterPerson,
// ReportFound, and ReportMissing. When `showDisplayPicker` is set, one
// successfully-detected slot can be marked as the photo shown in list
// views elsewhere in the app (only meaningful for registration, since
// reports have no equivalent list view — their first slot is primary
// by construction).
export default function PhotoSlots({ slots, onChange, maxSlots = 3, showDisplayPicker = false, displayId = null, onDisplayChange }) {
  const fileInputRefs = useRef({});

  // handleFileChange's async chain (processing -> preview -> detected) can
  // fire multiple updateSlot calls before the parent re-renders with a new
  // `slots` prop. Closing over `slots` directly would make each call
  // rebuild from the same stale snapshot, silently dropping the previous
  // call's patch (e.g. `file` getting reset to null right before submit).
  // A ref that's updated synchronously on every call keeps each patch
  // compounding on the latest state instead.
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const updateSlot = (id, patch) => {
    const next = slotsRef.current.map(s => (s.id === id ? { ...s, ...patch } : s));
    slotsRef.current = next;
    onChange(next);
  };

  const handleFileChange = (id, e) => {
    const file = e.target.files[0];
    if (!file) return;

    updateSlot(id, { file, status: 'processing', descriptor: null, preview: null });

    const reader = new FileReader();
    reader.onload = (event) => {
      const previewUrl = event.target.result;
      updateSlot(id, { preview: previewUrl });

      const img = new Image();
      img.src = previewUrl;
      img.onload = async () => {
        try {
          const desc = await computeDescriptor(img);
          if (desc) {
            updateSlot(id, { descriptor: desc, status: 'detected' });
            if (showDisplayPicker && displayId == null) onDisplayChange(id);
          } else {
            updateSlot(id, { status: 'error', descriptor: null });
          }
        } catch (err) {
          console.error('Face processing error:', err);
          updateSlot(id, { status: 'error', descriptor: null });
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const addSlot = () => {
    onChange([...slots, createSlot('Side angle (optional) / পাশের ছবি', false)]);
  };

  const removeSlot = (id) => {
    const next = slots.filter(s => s.id !== id);
    onChange(next);
    if (showDisplayPicker && displayId === id) {
      const firstDetected = next.find(s => s.status === 'detected');
      onDisplayChange(firstDetected?.id ?? null);
    }
  };

  return (
    <div className="photo-slots">
      {slots.map(slot => (
        <div className="form-group photo-upload-group photo-slot" key={slot.id}>
          <label>{slot.label}{slot.required ? ' *' : ''}</label>
          <div className="file-dropzone" onClick={() => fileInputRefs.current[slot.id]?.click()}>
            {slot.preview ? (
              <div className="preview-container">
                <img src={slot.preview} alt="Preview" className="preview-img" />
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
            ref={el => { fileInputRefs.current[slot.id] = el; }}
            style={{ display: 'none' }}
            onChange={e => handleFileChange(slot.id, e)}
          />

          {slot.status !== 'idle' && (
            <div className={`face-status-badge ${slot.status}`}>
              {slot.status === 'processing' && (
                <>
                  <span className="spinner">⏳</span>
                  <span>Scanning photo for face embeddings...</span>
                </>
              )}
              {slot.status === 'detected' && <span>✅ Face successfully detected and embedded!</span>}
              {slot.status === 'error' && (
                <span>❌ No face detected{slot.required ? '. Please try another photo.' : ' — this photo will be skipped.'}</span>
              )}
            </div>
          )}

          {(showDisplayPicker && slot.status === 'detected') || !slot.required ? (
            <div className="photo-slot-actions">
              {showDisplayPicker && slot.status === 'detected' && (
                <label className="display-photo-radio">
                  <input
                    type="radio"
                    name="display-photo"
                    checked={displayId === slot.id}
                    onChange={() => onDisplayChange(slot.id)}
                  />
                  Use as main photo / মূল ছবি হিসেবে ব্যবহার করুন
                </label>
              )}
              {!slot.required && (
                <button type="button" className="secondary-btn photo-slot-remove" onClick={() => removeSlot(slot.id)}>
                  Remove
                </button>
              )}
            </div>
          ) : null}
        </div>
      ))}

      {slots.length < maxSlots && (
        <button type="button" className="secondary-btn" onClick={addSlot}>
          + Add another angle / আরেকটি ছবি যুক্ত করুন ({slots.length}/{maxSlots})
        </button>
      )}
    </div>
  );
}
