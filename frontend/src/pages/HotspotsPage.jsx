import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getHotspots, analyzeHotspots } from '../services/api';


export default function HotspotsPage() {
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchHotspots = async () => {
    try {
      const { data } = await getHotspots();
      setHotspots(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHotspots(); }, []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const { data } = await analyzeHotspots();
      setHotspots(data.hotspots || []);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="loading-spinner" style={{ width: 40, height: 40 }}></div></div>;

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="page-title">🔥 Waste Hotspots</h2>
          <p className="page-subtitle">DBSCAN cluster analysis • Recurring hotspot detection • Intervention recommendations</p>
        </div>
        <button className="btn btn-primary" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? <span className="loading-spinner"></span> : '🔍'} Re-Analyze Hotspots
        </button>
      </div>

      {/* Map */}
      <div className="map-container" style={{ height: 350, marginBottom: 24 }}>
        <MapContainer center={[19.0970, 72.8780]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {hotspots.map(h => (
            <Circle
              key={h.id}
              center={[h.latitude, h.longitude]}
              radius={100}
              pathOptions={{
                color: h.recurring ? '#ef4444' : '#f59e0b',
                fillColor: h.recurring ? '#ef444440' : '#f59e0b30',
                fillOpacity: 0.4,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>🔥 Hotspot #{h.id}</strong><br />
                  Reports: {h.report_count} • {h.estimated_waste} kg<br />
                  {h.recurring && <span style={{ color: '#ef4444' }}>⚠ Recurring</span>}
                </div>
              </Popup>
            </Circle>
          ))}
        </MapContainer>
      </div>

      {/* Hotspot Cards */}
      {hotspots.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48 }}>📊</div>
          <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>No hotspots detected. Need at least 3 nearby reports for a cluster.</p>
        </div>
      ) : (
        <div>
          {hotspots.map(h => {
            const rec = h.recommendation;
            const intervention = rec?.intervention;
            const categories = rec?.categories || {};
            
            return (
              <div key={h.id} className={`hotspot-card ${h.recurring ? 'recurring' : ''}`}>
                <div className="hotspot-header">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                      🔥 Hotspot #{h.id}
                      {h.recurring && <span className="badge badge-recurring" style={{ marginLeft: 8 }}>⚠ Recurring</span>}
                    </h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}
                    </p>
                  </div>
                  <span className={`badge badge-${h.priority?.toLowerCase()}`}>{h.priority}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                  <div className="route-info-item">
                    <div className="route-info-value" style={{ fontSize: 18 }}>{h.report_count}</div>
                    <div className="route-info-label">Reports</div>
                  </div>
                  <div className="route-info-item">
                    <div className="route-info-value" style={{ fontSize: 18 }}>{Math.round(h.estimated_waste)} kg</div>
                    <div className="route-info-label">Waste</div>
                  </div>
                  <div className="route-info-item">
                    <div className="route-info-value" style={{ fontSize: 18 }}>{h.recurrence_count || 0}</div>
                    <div className="route-info-label">Historical</div>
                  </div>
                  <div className="route-info-item">
                    <div className="route-info-value" style={{ fontSize: 18, color: rec?.dominant_category === 'Medical/Hazardous' ? '#ef4444' : 'inherit' }}>
                      {rec?.dominant_category || '—'}
                    </div>
                    <div className="route-info-label">Dominant Type</div>
                  </div>
                </div>

                {/* Categories breakdown */}
                {Object.keys(categories).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {Object.entries(categories).map(([cat, count]) => (
                      <span key={cat} className="badge badge-medium">{cat}: {count}</span>
                    ))}
                  </div>
                )}

                {/* Recurrence description */}
                {rec?.recurrence_description && (
                  <div style={{ fontSize: 13, color: h.recurring ? '#ef4444' : 'var(--text-muted)', marginBottom: 8 }}>
                    {rec.recurrence_description}
                  </div>
                )}

                {/* Intervention Recommendation */}
                {intervention && (
                  <div className="hotspot-recommendation">
                    <h4>💡 Recommended Intervention</h4>
                    <p>{intervention.recommendation}</p>
                    <p style={{ marginTop: 6, color: '#22c55e', fontSize: 12 }}>
                      📉 {intervention.expected_effect}
                    </p>
                    <div className="planner-label">
                      🔒 {intervention.label}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Note about forecasting */}
      <div className="demo-note" style={{ marginTop: 24 }}>
        <strong>📊 Predictive Analytics:</strong> The recurrence detection uses historical report frequency.
        In production, this would be replaced with a time-series forecast model (e.g., Prophet)
        to predict future waste accumulation patterns. The code is structured to accept that upgrade.
      </div>
    </div>
  );
}
