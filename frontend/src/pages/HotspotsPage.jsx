import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getHotspots, analyzeHotspots } from '../services/api';

// Safe JSON.parse — never crashes render
function safeJSON(val) {
  if (!val) return null;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return null; }
}

function MapFocus({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15, { duration: 0.4 }); }, [center, map]);
  return null;
}

export default function HotspotsPage() {
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);

  const fetchHotspots = async () => {
    try {
      const { data } = await getHotspots();
      setHotspots(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchHotspots(); }, []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const { data } = await analyzeHotspots();
      setHotspots(data.hotspots || []);
    } catch (e) { console.error(e); }
    finally { setAnalyzing(false); }
  };

  const handleSelect = (h) => {
    setSelected(h);
    setMapFocus([h.latitude, h.longitude]);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="loading-spinner" style={{ width: 32, height: 32 }}></div></div>;

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="page-title">🔥 Hotspot Intelligence</h2>
          <p className="page-subtitle">DBSCAN cluster analysis · Recurring hotspot detection · Planner recommendations</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? <span className="loading-spinner"></span> : '🔍'} Re-Analyze
        </button>
      </div>

      {/* Map */}
      <div className="map-container" style={{ height: 380, marginBottom: 20 }}>
        <MapContainer center={[19.0900, 72.8780]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {mapFocus && <MapFocus center={mapFocus} />}

          {hotspots.map(h => (
            <Circle key={h.id} center={[h.latitude, h.longitude]} radius={120}
              pathOptions={{
                color: h.recurring ? '#ef4444' : '#ff6b4a',
                fillColor: h.recurring ? '#ef444440' : '#ff6b4a25',
                fillOpacity: 0.5,
                weight: h.recurring ? 3 : 2,
              }}
              eventHandlers={{ click: () => handleSelect(h) }}>
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>🔥 Hotspot #{h.id}</strong><br />
                  {h.report_count} reports · {Math.round(h.estimated_waste)} kg<br />
                  {h.recurring && <span style={{ color: '#ef4444' }}>⚠ Recurring ({h.recurrence_count} historical)</span>}
                </div>
              </Popup>
            </Circle>
          ))}

          {/* Center markers for hotspots */}
          {hotspots.map(h => (
            <Marker key={`hm-${h.id}`} position={[h.latitude, h.longitude]}
              icon={L.divIcon({
                className: '',
                html: `<div style="font-size:12px;font-weight:800;color:#fff;background:${h.recurring ? '#ef4444' : '#ff6b4a'};width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 8px ${h.recurring ? '#ef444480' : '#ff6b4a60'};">${h.report_count}</div>`,
                iconSize: [22, 22], iconAnchor: [11, 11],
              })}
              eventHandlers={{ click: () => handleSelect(h) }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Content */}
      {hotspots.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 36 }}>📊</div>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>No hotspots detected. Need at least 3 nearby reports for a cluster.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 16 }}>
          {/* Hotspot Cards */}
          <div>
            {hotspots.map(h => {
              const rec = safeJSON(h.recommendation);
              const isSelected = selected?.id === h.id;

              return (
                <div key={h.id}
                  className={`hotspot-card ${h.recurring ? 'recurring' : ''}`}
                  style={{ cursor: 'pointer', borderColor: isSelected ? 'var(--escalated)' : undefined }}
                  onClick={() => handleSelect(h)}>
                  <div className="hotspot-header">
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 700 }}>
                        🔥 Hotspot #{h.id}
                        {h.recurring && <span className="badge badge-recurring" style={{ marginLeft: 6 }}>⚠ Recurring</span>}
                      </h3>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}
                      </p>
                    </div>
                    <span className={`badge badge-${(h.priority || 'medium').toLowerCase()}`}>{h.priority}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                    <div className="route-info-item">
                      <div className="route-info-value" style={{ fontSize: 16, color: 'var(--escalated)' }}>{h.report_count}</div>
                      <div className="route-info-label">Reports</div>
                    </div>
                    <div className="route-info-item">
                      <div className="route-info-value" style={{ fontSize: 16 }}>{Math.round(h.estimated_waste)} kg</div>
                      <div className="route-info-label">Waste</div>
                    </div>
                    <div className="route-info-item">
                      <div className="route-info-value" style={{ fontSize: 16, color: h.recurring ? '#ef4444' : 'inherit' }}>{h.recurrence_count || 0}</div>
                      <div className="route-info-label">Historical</div>
                    </div>
                    <div className="route-info-item">
                      <div className="route-info-value" style={{ fontSize: 12 }}>{rec?.dominant_category || '—'}</div>
                      <div className="route-info-label">Type</div>
                    </div>
                  </div>

                  {rec?.recurrence_description && (
                    <div style={{ fontSize: 11, color: h.recurring ? '#ef4444' : 'var(--text-muted)' }}>
                      {rec.recurrence_description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Hotspot Detail */}
          {selected && (() => {
            const rec = safeJSON(selected.recommendation);
            const intervention = rec?.intervention;

            return (
              <div className="hotspot-detail slide-up" style={{ alignSelf: 'start', position: 'sticky', top: 80 }}>
                <div className="hotspot-detail-header">
                  <div className="hotspot-detail-title">Hotspot #{selected.id} Detail</div>
                  <button className="btn btn-sm btn-outline" onClick={() => setSelected(null)}>✕</button>
                </div>

                <div className="hotspot-stats-grid">
                  <div className="hotspot-stat">
                    <div className="hotspot-stat-value" style={{ color: 'var(--escalated)' }}>{selected.report_count}</div>
                    <div className="hotspot-stat-label">Reports</div>
                  </div>
                  <div className="hotspot-stat">
                    <div className="hotspot-stat-value">{Math.round(selected.estimated_waste)} kg</div>
                    <div className="hotspot-stat-label">Estimated Waste</div>
                  </div>
                </div>

                {rec?.categories && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="card-title" style={{ marginBottom: 4 }}>Category Breakdown</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {Object.entries(rec.categories).map(([cat, count]) => (
                        <span key={cat} className="badge badge-medium">{cat}: {count}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.recurring && (
                  <div className="hotspot-decision" style={{ borderLeftColor: '#ef4444', marginBottom: 10 }}>
                    <div className="hotspot-decision-label" style={{ color: '#ef4444' }}>⚠ Recurring Pattern</div>
                    <div className="hotspot-decision-text">
                      {selected.recurrence_count} similar incidents detected in this area over the last 14 days.
                    </div>
                  </div>
                )}

                {intervention && (
                  <div className="hotspot-recommendation">
                    <h4>💡 Planner Recommendation</h4>
                    <p>{intervention.recommendation}</p>
                    <p style={{ marginTop: 4, color: 'var(--collected)', fontSize: 11 }}>📉 {intervention.expected_effect}</p>
                    <div className="planner-label">🔒 {intervention.label}</div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <div className="demo-note" style={{ marginTop: 20 }}>
        <strong>About this analysis:</strong> Hotspot detection uses DBSCAN (scikit-learn) with haversine distance.
        Recurrence analysis checks 14 days of historical report data. Recommendations are rule-based planner-level
        suggestions — they never modify today's fixed routes.
      </div>
    </div>
  );
}
