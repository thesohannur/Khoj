import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { flushQueue, cacheMatchRegistry } from './lib/offlineQueue';
import { ensureSession, isRealUser, signOut } from './lib/auth';
import AuthGate from './components/AuthGate';
import RegisterPerson from './components/RegisterPerson';
import ReportFound from './components/ReportFound';
import ReportMissing from './components/ReportMissing';
import CrisisMap from './components/CrisisMap';
import SyncStatus from './components/SyncStatus';

const SIGNED_URL_TTL = 3600; // 1 hour, refreshed on every fetch

function App() {
  const [activeTab, setActiveTab] = useState('register'); // register | found | missing | map
  const [session, setSession] = useState(null);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Refresh the descriptor-only offline-matching cache. Uses a narrow RPC
  // (id + face_descriptor only, no names/photos) so any session — even an
  // anonymous volunteer's — can warm it without exposing anyone's PII.
  async function refreshMatchRegistry() {
    try {
      const { data, error } = await supabase.rpc('get_match_registry');
      if (error) {
        console.error('Error fetching match registry:', error.message);
        return;
      }
      await cacheMatchRegistry(data || []);
    } catch (err) {
      console.error('Failed to cache match registry:', err);
    }
  }

  // Fetch the CURRENT (real) user's own registered persons, with a signed
  // URL for each photo (the bucket is private — only the owner can sign).
  async function fetchPersons() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('persons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching persons:', error.message);
        setPersons([]);
        return;
      }

      const withSignedUrls = await Promise.all((data || []).map(async person => {
        if (!person.photo_url) return person;
        const { data: signed } = await supabase.storage
          .from('person-photos')
          .createSignedUrl(person.photo_url, SIGNED_URL_TTL);
        return { ...person, signedPhotoUrl: signed?.signedUrl };
      }));
      setPersons(withSignedUrls);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthenticated(newSession) {
    setSession(newSession);
  }

  async function handleSignOut() {
    const anonSession = await signOut();
    setSession(anonSession);
    setPersons([]);
  }

  // Handle manual queue sync trigger
  async function handleManualSync() {
    if (!navigator.onLine) {
      alert('You are currently offline. Please reconnect to internet to sync.');
      return;
    }
    try {
      setSyncing(true);
      await flushQueue();
      setRefreshTrigger(prev => prev + 1);
      if (activeTab === 'register' && isRealUser(session)) {
        await fetchPersons();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    ensureSession().then(setSession).catch(err => console.error('Failed to establish session:', err));
  }, []);

  useEffect(() => {
    if (!session) return;
    refreshMatchRegistry();
  }, [session]);

  useEffect(() => {
    if (!session || !isRealUser(session)) {
      setLoading(false);
      return;
    }
    if (activeTab === 'register') {
      fetchPersons();
    }
  }, [session, activeTab === 'register']);

  useEffect(() => {
    // Setup network status listeners
    function updateOnlineStatus() {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        handleManualSync();
      }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="header">
        <h1>খোজ — KHOJ</h1>
        <p>A distributed missing persons search and matching system for Bangladesh.</p>
        <div className={`network-indicator ${isOnline ? 'online' : 'offline'}`}>
          <span className="pulse-dot"></span>
          <span>{isOnline ? 'Online / সংযুক্ত' : 'Offline / বিচ্ছিন্ন'}</span>
        </div>
        {isRealUser(session) && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Signed in as {session.user.email}
            {' — '}
            <button className="secondary-btn" style={{ padding: '0.15rem 0.6rem' }} onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Sync Status Banner */}
      <SyncStatus refreshTrigger={refreshTrigger} />

      {/* Navigation Tabs */}
      <nav className="tab-navigation" style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button
          className={`secondary-btn ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => setActiveTab('register')}
          style={activeTab === 'register' ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
        >
          👤 Register Member / সদস্য নিবন্ধন
        </button>
        <button
          className={`secondary-btn ${activeTab === 'found' ? 'active' : ''}`}
          onClick={() => setActiveTab('found')}
          style={activeTab === 'found' ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
        >
          🔍 Report Found / সন্ধান মিলেছে
        </button>
        <button
          className={`secondary-btn ${activeTab === 'missing' ? 'active' : ''}`}
          onClick={() => setActiveTab('missing')}
          style={activeTab === 'missing' ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
        >
          ⚠️ Report Missing / নিখোঁজ রিপোর্ট
        </button>
        <button
          className={`secondary-btn ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
          style={activeTab === 'map' ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : {}}
        >
          🗺️ Live Map / ক্রাইসিস ম্যাপ
        </button>
      </nav>

      {/* Manual Sync Button if online */}
      {isOnline && (
        <div className="sync-actions">
          <button
            className="secondary-btn"
            onClick={handleManualSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Sync Offline Data / ডাটা সিঙ্ক করুন'}
          </button>
        </div>
      )}

      {/* Render Active Component */}
      {activeTab === 'register' && (
        !isRealUser(session) ? (
          <AuthGate onAuthenticated={handleAuthenticated} />
        ) : (
          <>
            <RegisterPerson onRegisterSuccess={fetchPersons} session={session} />

            <section className="persons-list-card">
              <h2>Registered Family Members / নিবন্ধিত সদস্য তালিকা</h2>
              <p className="card-subtitle">Only visible to your account.</p>

              {loading ? (
                <div className="empty-state">
                  <span className="spinner">⏳</span> Loading registry data...
                </div>
              ) : persons.length === 0 ? (
                <div className="empty-state">
                  No family members registered yet. Fill out the form above to add a member.
                </div>
              ) : (
                <div className="persons-grid">
                  {persons.map(person => (
                    <div key={person.id} className="person-card">
                      <img
                        src={person.signedPhotoUrl || 'https://via.placeholder.com/150'}
                        alt={person.name}
                        className="person-photo"
                      />
                      <div className="person-info">
                        <div className="person-name">{person.name}</div>
                        {person.name_bn && <div className="person-name-bn">{person.name_bn}</div>}
                        <div className="person-meta">
                          {person.age && <span>Age: {person.age}</span>}
                          {person.gender && <span>Gender: {person.gender}</span>}
                          {person.district && <span>District: {person.district}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )
      )}

      {activeTab === 'found' && (
        <ReportFound onReportSuccess={() => setRefreshTrigger(prev => prev + 1)} />
      )}

      {activeTab === 'missing' && (
        <ReportMissing onReportSuccess={() => setRefreshTrigger(prev => prev + 1)} />
      )}

      {activeTab === 'map' && (
        <CrisisMap />
      )}
    </main>
  );
}

export default App;
