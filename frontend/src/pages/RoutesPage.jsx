import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getFixedRoutes, getRoutes, getTrucks, generateRoute, startCollection, collectStop } from '../services/api';


const truckIcon = (type) => L.divIcon({
  className: '',
  html: `<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${type === 'FIXED' ? '🚛' : '🚐'}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function RoutesPage({ clock }) {
  const [fixedRoutes, setFixedRoutes] = useState([]);
  const [gapRoutes, setGapRoutes] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);

  const fetchData = async () => {
    try {
      const [fr, gr, tr] = await Promise.all([
        getFixedRoutes(), getRoutes(), getTrucks()
      ]);
      setFixedRoutes(fr.data);
      setGapRoutes(gr.data);
      setTrucks(tr.data);
      if (gr.data.length > 0 && !activeRoute) {
        setActiveRoute(gr.data[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await generateRoute();
      setActiveRoute(data);
      await fetchData();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleStart = async (routeId) => {
    await startCollection(routeId);
    await fetchData();
  };

  const handleCollect = async (routeId, order) => {
    await collectStop(routeId, order);
    await fetchData();
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="loading-spinner" style={{ width: 40, height: 40 }}></div></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">🚛 Routes</h2>
        <p className="page-subtitle">Fixed municipal routes (read-only) and dynamic gap crew routes</p>
      </div>

      {/* Map */}
      <div className="map-container" style={{ height: 400, marginBottom: 24 }}>
        <MapContainer center={[19.0970, 72.8780]} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Fixed Routes */}
          {fixedRoutes.map(route => (
            <Polyline
              key={`fr-${route.id}`}
              positions={route.waypoints}
              pathOptions={{ color: '#2dd4bf', weight: 4, opacity: 0.7, dashArray: '8, 4' }}
            >
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>🔒 {route.name}</strong><br />
                  <span style={{ fontSize: 11, color: '#888' }}>Fixed route — never modified</span><br />
                  Window: {route.window_start} – {route.window_end}
                </div>
              </Popup>
            </Polyline>
          ))}

          {/* Active Gap Route */}
          {activeRoute?.geometry && (
            <Polyline
              positions={activeRoute.geometry}
              pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.9 }}
            />
          )}

          {activeRoute?.stops?.map(stop => (
            <Marker
              key={`stop-${stop.order}`}
              position={[stop.lat, stop.lon]}
              icon={L.divIcon({
                className: '',
                html: `<div style="width:24px;height:24px;border-radius:50%;background:${stop.status === 'COLLECTED' ? '#22c55e' : '#f59e0b'};color:#000;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;">${stop.order}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              })}
            >
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>Stop #{stop.order}</strong><br />
                  {stop.category} • {stop.estimated_waste} kg • {stop.priority}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Trucks */}
          {trucks.map(t => (
            <Marker key={`t-${t.id}`} position={[t.latitude, t.longitude]} icon={truckIcon(t.type)}>
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>{t.name}</strong><br />
                  {t.type} • {t.status}<br />
                  Load: {t.current_load_kg}/{t.capacity_kg} kg
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="two-col">
        {/* Fixed Routes */}
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
            🔒 Fixed Routes <span className="fixed-badge" style={{ marginLeft: 8 }}><span className="lock-icon">🔒</span> Fixed, not modified</span>
          </h3>

          {fixedRoutes.map(route => {
            const truck = trucks.find(t => t.id === route.truck_id);
            return (
              <div key={route.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: 14 }}>🚛 {route.name}</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Window: {route.window_start} – {route.window_end} • {route.waypoints.length} waypoints
                    </p>
                  </div>
                  <div>
                    {truck && (
                      <span className={`badge badge-${truck.status === 'EN_ROUTE' ? 'escalated' : truck.status === 'COMPLETED' ? 'collected' : 'queued'}`}>
                        {truck.status}
                      </span>
                    )}
                  </div>
                </div>
                {truck && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Truck: {truck.name} • Load: {truck.current_load_kg}/{truck.capacity_kg} kg
                    {truck.progress !== undefined && ` • Progress: ${Math.round(truck.progress * 100)}%`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Gap Routes */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>
              🚐 Gap Crew Routes <span className="badge badge-gap" style={{ marginLeft: 8 }}>Dynamic</span>
            </h3>
            <button className="btn btn-amber btn-sm" onClick={handleGenerate} disabled={generating}>
              {generating ? <span className="loading-spinner"></span> : '🗺️'} Generate Route
            </button>
          </div>

          {/* Gap Vehicles */}
          <div style={{ marginBottom: 16 }}>
            {trucks.filter(t => t.type === 'GAP').map(t => (
              <div key={t.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: 14 }}>🚐 {t.name}</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Capacity: {t.current_load_kg}/{t.capacity_kg} kg •
                      Available: {t.available_capacity} kg
                    </p>
                  </div>
                  <span className={`badge badge-${t.status === 'IDLE' ? 'collected' : 'escalated'}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Active Gap Route Details */}
          {gapRoutes.map(route => (
            <div key={route.id} className="route-panel" style={{ marginBottom: 12 }}>
              <div className="card-header">
                <span className="card-title">Route #{route.id}</span>
                <span className={`badge badge-${route.status === 'COMPLETED' ? 'collected' : route.status === 'IN_PROGRESS' ? 'escalated' : 'queued'}`}>
                  {route.status}
                </span>
              </div>
              <div className="route-info-grid">
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 16 }}>{route.total_distance} km</div>
                  <div className="route-info-label">Distance</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 16 }}>{route.estimated_waste} kg</div>
                  <div className="route-info-label">Waste</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 16 }}>{route.traffic_level}</div>
                  <div className="route-info-label">Traffic ({route.traffic_multiplier}×)</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 16 }}>{route.stops?.length}</div>
                  <div className="route-info-label">Stops</div>
                </div>
              </div>

              {route.status === 'PLANNED' && (
                <button className="btn btn-primary btn-sm" onClick={() => handleStart(route.id)}>
                  🚀 Start Collection
                </button>
              )}

              {route.stops?.map(stop => (
                <div className="route-stop" key={stop.order}>
                  <div className={`stop-number ${stop.status === 'COLLECTED' ? 'collected' : ''}`}>{stop.order}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{stop.category}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stop.estimated_waste} kg</div>
                  </div>
                  {stop.status === 'COLLECTED' ? (
                    <span className="badge badge-collected">✓ GPS Verified</span>
                  ) : route.status === 'IN_PROGRESS' ? (
                    <button className="btn btn-sm btn-outline" onClick={() => handleCollect(route.id, stop.order)}>
                      📍 Collect
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ))}

          {gapRoutes.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 30 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🗺️</div>
              <p style={{ color: 'var(--text-muted)' }}>No gap routes generated yet</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Click "Generate Route" to create an optimized collection route
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="demo-note" style={{ marginTop: 24 }}>
        <strong>About GPS Verification:</strong> In production, the vehicle's real GPS position
        (from a Raspberry Pi gateway or driver's phone) would POST to <code>/api/trucks/&#123;id&#125;/location</code>.
        The geofence check (40m radius) verifies collection automatically.
        In this demo, clicking "Collect" simulates the GPS verification.
      </div>
    </div>
  );
}
