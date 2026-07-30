import { useEffect, useState } from 'react';
import { getPendingCounts } from '../lib/offlineQueue';

export default function SyncStatus({ refreshTrigger }) {
  const [counts, setCounts] = useState({ reports: 0, registrations: 0, matches: 0 });

  const updateCounts = async () => {
    const data = await getPendingCounts();
    setCounts(data);
  };

  useEffect(() => {
    updateCounts();

    // Listen to online events to refresh
    window.addEventListener('online', updateCounts);
    window.addEventListener('offline', updateCounts);

    // Poll periodically in case things are saved offline
    const interval = setInterval(updateCounts, 5000);

    return () => {
      window.removeEventListener('online', updateCounts);
      window.removeEventListener('offline', updateCounts);
      clearInterval(interval);
    };
  }, [refreshTrigger]);

  const totalPending = counts.reports + counts.registrations + counts.matches;

  if (totalPending === 0) return null;

  return (
    <div className="status-banner info" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <strong>📡 Offline Queue Status:</strong> {totalPending} item(s) pending sync
        <span style={{ fontSize: '0.85rem', display: 'block', color: 'var(--text-secondary)' }}>
          ({counts.registrations} registration(s), {counts.reports} report(s), {counts.matches} match confirmation(s))
        </span>
      </div>
      <span className="spinner">🔄</span>
    </div>
  );
}
