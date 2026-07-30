import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Live "your relative was found" banner while the app is open — a
// same-tab companion to the Telegram notification, not a replacement
// for it (this does nothing if the tab isn't open).
export default function MatchNotificationBanner({ persons }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const personIds = persons.map(p => p.id);
    if (personIds.length === 0) return;

    const channel = supabase
      .channel('matches-for-me')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'matches',
        filter: `person_id=in.(${personIds.join(',')})`,
      }, (payload) => {
        const person = persons.find(p => p.id === payload.new.person_id);
        if (!person) return;
        const id = payload.new.id;
        setNotifications(prev => [...prev, { id, person, confidence: payload.new.confidence }]);
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== id));
        }, 15000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [persons]);

  if (notifications.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 20000, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '360px' }}>
      {notifications.map(n => (
        <div
          key={n.id}
          className="status-banner success"
          style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}
        >
          <div>
            <strong>🎉 খুঁজে পাওয়া গেছে!</strong>
            <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {n.person.name_bn || n.person.name} — {Math.round(n.confidence * 100)}% মিল।
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              বিস্তারিত তথ্যের জন্য টেলিগ্রাম দেখুন।
            </div>
          </div>
          <button
            className="secondary-btn"
            style={{ padding: '0.1rem 0.5rem', flexShrink: 0 }}
            onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
