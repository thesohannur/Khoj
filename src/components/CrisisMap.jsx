import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';

// Import leaflet styles and fix default marker icon assets
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function CrisisMap() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchMapReports() {
    try {
      setLoading(true);
      // Fetch found reports that have coordinates
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('type', 'found')
        .not('location_lat', 'is', null)
        .not('location_lng', 'is', null);

      if (error) {
        console.error('Error fetching map reports:', error.message);
      } else {
        setReports(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMapReports();
  }, []);

  // Bangladesh coordinates center
  const center = [23.8103, 90.4125];

  return (
    <div className="registration-card" style={{ padding: '2rem' }}>
      <h2>Crisis Map / লাইভ ক্রাইসিস ম্যাপ</h2>
      <p className="card-subtitle">Locations of found persons reported across Bangladesh.</p>

      {loading ? (
        <div className="empty-state">
          <span className="spinner">⏳</span> Loading map coordinates...
        </div>
      ) : (
        <div className="map-wrapper" style={{ height: '450px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
          <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {reports.map(report => (
              <Marker key={report.id} position={[report.location_lat, report.location_lng]}>
                <Popup>
                  <div style={{ color: '#111827', fontFamily: 'sans-serif', maxWidth: '200px' }}>
                    {report.photo_url && (
                      <img 
                        src={report.photo_url} 
                        alt="Reported Person" 
                        style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '0.5rem' }} 
                      />
                    )}
                    <h4 style={{ margin: '0 0 0.25rem 0', color: '#1e1b4b' }}>
                      📍 {report.location_name || 'Unknown Location'}
                    </h4>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>
                      {report.description || 'No description provided.'}
                    </p>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block' }}>
                      Contact: <strong>{report.reporter_contact}</strong>
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
