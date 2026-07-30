import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { queueMatch, queueNegativeFeedback } from '../lib/offlineQueue';

export default function MatchResult({ matches, reportId, localReportId, foundPhotoUrl, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [confirmedMatchIds, setConfirmedMatchIds] = useState(new Set());

  if (!matches || matches.length === 0) {
    return (
      <div className="match-modal-overlay" style={overlayStyle}>
        <div className="registration-card match-modal-content" style={modalContentStyle}>
          <h2>No Matches Found / কোনো মিল পাওয়া যায়নি</h2>
          <p className="card-subtitle">On-device matching did not detect any registered members matching this face descriptor.</p>
          <button className="submit-btn" onClick={onClose} style={{ width: '100%' }}>Close / বন্ধ করুন</button>
        </div>
      </div>
    );
  }

  const candidate = matches[currentIndex];
  const { id: personId, confidence, revealed } = candidate;
  const confidencePct = Math.round(confidence * 100);

  // Confidence color matching
  let confidenceColor = 'var(--accent-rose)';
  if (confidence > 0.75) {
    confidenceColor = 'var(--accent-emerald)';
  } else if (confidence >= 0.5) {
    confidenceColor = 'var(--accent-amber)';
  }

  const handleConfirm = async () => {
    setSaving(true);
    setStatusMessage(null);

    try {
      if (reportId) {
        // Report already has a real id — confirm straight to Supabase.
        const { error } = await supabase.from('matches').insert({
          person_id: personId,
          report_id: reportId,
          confidence: confidence,
          notified: false
        });

        if (error) throw error;
        setStatusMessage({ type: 'success', text: '🎉 Match confirmed! Notification webhook triggered.' });
      } else {
        // Report hasn't synced yet (we're offline) — queue the match and
        // let flushQueue() resolve the report id and push it once online.
        await queueMatch({
          personId,
          confidence,
          reportId: null,
          localReportId
        });
        setStatusMessage({ type: 'success', text: '📡 Match confirmed offline. It will sync and notify the family once you’re back online.' });
      }

      setConfirmedMatchIds(prev => new Set(prev).add(personId));

      // Move to next after short delay or close if it was the last one
      setTimeout(() => {
        handleNext();
      }, 1500);

    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Failed to confirm match: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    setStatusMessage(null);
    if (currentIndex < matches.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Completed reviewing all matches
      onClose();
    }
  };

  const handleReject = () => {
    queueNegativeFeedback({
      personId,
      confidence,
      reportId,
      localReportId
    }).catch(err => console.error('Failed to record negative feedback:', err));
    handleNext();
  };

  return (
    <div className="match-modal-overlay" style={overlayStyle}>
      <div className="registration-card match-modal-content" style={modalContentStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Potential Face Match Detected</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Candidate {currentIndex + 1} of {matches.length}
          </span>
        </div>

        {/* Side by side comparison */}
        <div className="comparison-grid" style={comparisonGridStyle}>
          {/* Found photo */}
          <div className="comparison-pane">
            <h3 style={paneTitleStyle}>Found Person Photo</h3>
            <img src={foundPhotoUrl} alt="Found" style={comparisonImageStyle} />
          </div>

          {/* Registered photo */}
          <div className="comparison-pane">
            <h3 style={paneTitleStyle}>Registered Family Member</h3>
            {revealed ? (
              <img src={candidate.signedPhotoUrl} alt="Registered" style={comparisonImageStyle} />
            ) : (
              <div style={{ ...comparisonImageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
                <span className="spinner">⏳</span>&nbsp;Verifying match…
              </div>
            )}
          </div>
        </div>

        {/* Info card of registered person */}
        <div className="registered-info-card" style={infoCardStyle}>
          {revealed ? (
            <>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{candidate.name}</div>
              {candidate.name_bn && <div style={{ color: '#a5b4fc', fontSize: '1rem', marginBottom: '0.5rem' }}>{candidate.name_bn}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <div>Age: <strong>{candidate.age || 'N/A'}</strong></div>
                <div>Gender: <strong>{candidate.gender}</strong></div>
                <div style={{ gridColumn: 'span 2' }}>District: <strong>{candidate.district || 'N/A'}</strong></div>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Server is re-verifying this match before revealing who it might be
              {!navigator.onLine && ' — will continue once you\'re back online'}.
            </div>
          )}
        </div>

        {/* Match confidence bar */}
        <div style={{ margin: '1.5rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            <span>Match Confidence (on-device):</span>
            <strong style={{ color: confidenceColor }}>{confidencePct}% Match</strong>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
            <div style={{ width: `${confidencePct}%`, height: '100%', background: confidenceColor, borderRadius: '50px', transition: 'width 0.5s ease-out' }}></div>
          </div>
        </div>

        {statusMessage && (
          <div className={`status-banner ${statusMessage.type}`} style={{ marginBottom: '1.5rem' }}>
            {statusMessage.text}
          </div>
        )}

        {/* Actions buttons */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            className="secondary-btn"
            onClick={handleReject}
            disabled={saving || confirmedMatchIds.has(personId)}
            style={{ flex: 1, borderColor: 'var(--accent-rose)', color: '#fda4af' }}
          >
            ❌ Not a Match / মিল নয়
          </button>
          <button
            className="submit-btn"
            onClick={handleConfirm}
            disabled={saving || !revealed || confirmedMatchIds.has(personId)}
            style={{ flex: 1, background: 'var(--accent-emerald)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
          >
            {saving ? 'Confirming...' : '✅ Confirm Match / নিশ্চিত'}
          </button>
        </div>

        <button
          className="secondary-btn"
          onClick={onClose}
          style={{ width: '100%', marginTop: '1rem' }}
        >
          Close Match Review
        </button>
      </div>
    </div>
  );
}

// Styling definitions
const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.85)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 10000,
  padding: '1.5rem',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
};

const modalContentStyle = {
  width: '100%',
  maxWidth: '650px',
  margin: 0,
  maxHeight: '90vh',
  overflowY: 'auto',
};

const comparisonGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1.5rem',
  marginBottom: '1.5rem',
};

const paneTitleStyle = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  marginBottom: '0.5rem',
  letterSpacing: '0.05em',
};

const comparisonImageStyle = {
  width: '100%',
  height: '200px',
  objectFit: 'cover',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  display: 'block',
};

const infoCardStyle = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '8px',
  padding: '1rem',
};
