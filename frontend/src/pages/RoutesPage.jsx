import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getFixedRoutes, getRoutes, getTrucks, generateRoute, startCollection, collectStop } from '../services/api';

const truckIcon = (type) => L.divIcon({
  className: '',
  html: `<div style="font-size:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${type === 'FIXED' ? '🚛' : '🚐'}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function RoutesPage({ clock }) {
  const [fixedRoutes, setFixedRoutes] = useState([]);
  const [gapRoutes, setGapRoutes] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeRoute, setActiveRoute] = useState(null);

  // Ref so the polling interval can read current value without stale closure
  const activeRouteRef = useRef(null);
  useEffect(() => { activeRouteRef.current = activeRoute; }, [activeRoute]);

  const fetchData = useCallback(async () => {
    try {
      const [fr, gr, tr] = await Promise.all([getFixedRoutes(), getRoutes(), getTrucks()]);
      setFixedRoutes(fr.data);
      setGapRoutes(gr.data);
      setTrucks(tr.data);
      // Only auto-select first route if user hasn't already chosen one
      if (gr.data.length > 0 && !activeRouteRef.current) {
        setActiveRoute(gr.data[0]);
      }
    } catch (e) {
      console.error('RoutesPage fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const i = setInterval(fetchData, 3000);
    return () => clearInterval(i);
  }, [fetchData]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data } = await generateRoute();
      setActiveRoute(data);
      await fetchData();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to generate route');
    } finally {
      setGenerating(false);
    }
  };

  const handleStart = async (routeId) => {
    try {
      await startCollection(routeId);
      await fetchData();
    } catch (e) {
      alert('Failed to start collection');
      console.error(e);
    }
  };

  const handleCollect = async (routeId, order) => {
    try {
      await collectStop(routeId, order);
      await fetchData();
    } catch (e) {
      alert('Failed to mark stop as collected');
      console.error(e);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="loading-spinner" style={{ width: 32, height: 32 }}></div></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2 className="page-title">🚛 Routes & Dispatch</h2>
        <p className="page-subtitle">Scheduled routes (read-only, blue) and on-demand gap crew routes (orange)</p>
      </div>

      {/* Map */}
      <div className="map-container" style={{ height: 380, marginBottom: 20 }}>
        <MapContainer center={[19.0900, 72.8780]} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Fixed Routes — blue dashed */}
          {fixedRoutes.map(route => {
            const path = route.geometry || route.waypoints;
            if (!path || path.length < 2) return null;
            return (
            <Polyline key={`fr-${route.id}`} positions={path}
              pathOptions={{ color: '#4b8df8', weight: 3, opacity: 0.6, dashArray: '8, 6' }}>
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>🔒 {route.name}</strong><br />
                  <span style={{ fontSize: 10, color: '#888' }}>Scheduled route — never modified</span><br />
                  Window: {route.window_start} – {route.window_end}
                </div>
              </Popup>
            </Polyline>
            );
          })}

          {/* Active Gap Route — orange solid */}
          {activeRoute?.geometry && (
            <Polyline positions={activeRoute.geometry}
              pathOptions={{ color: '#e85d3a', weight: 4, opacity: 0.9 }} />
          )}

          {activeRoute?.stops?.map(stop => (
            <Marker key={`stop-${stop.order}`} position={[stop.lat, stop.lon]}
              icon={L.divIcon({
                className: '',
                html: `<div style="width:22px;height:22px;border-radius:50%;background:${stop.status === 'COLLECTED' ? '#34b870' : '#e85d3a'};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;">${stop.order}</div>`,
                iconSize: [22, 22], iconAnchor: [11, 11],
              })}>
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif' }}>
                  <strong>Stop #{stop.order}</strong><br />
                  {stop.category} · {stop.estimated_waste} kg · {stop.priority}
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
                  {t.type === 'FIXED' ? 'Scheduled' : 'Gap Crew'} · {t.status}<br />
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
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            🔒 Scheduled Routes
            <span className="fixed-badge">Read-only · Never modified</span>
          </h3>

          {fixedRoutes.map(route => {
            const truck = trucks.find(t => t.id === route.truck_id);
            return (
              <div key={route.id} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: 13 }}>🚛 {route.name}</h4>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Window: {route.window_start} – {route.window_end} · {route.waypoints.length} waypoints
                    </p>
                  </div>
                  {truck && (
                    <span className={`badge badge-${truck.status === 'EN_ROUTE' ? 'escalated' : truck.status === 'COMPLETED' ? 'collected' : 'queued'}`}>
                      {truck.status}
                    </span>
                  )}
                </div>
                {truck && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                    {truck.name} · {truck.current_load_kg}/{truck.capacity_kg} kg
                    {truck.progress !== undefined && ` · ${Math.round(truck.progress * 100)}% complete`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Gap Routes */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              🚐 Gap Crew Response
              <span className="badge badge-gap">On-Demand</span>
            </h3>
            <button className="btn btn-escalate btn-sm" onClick={handleGenerate} disabled={generating}>
              {generating ? <span className="loading-spinner"></span> : '🗺️'} Generate Route
            </button>
          </div>

          {/* Gap Vehicles */}
          <div style={{ marginBottom: 12 }}>
            {trucks.filter(t => t.type === 'GAP').map(t => (
              <div key={t.id} className="card" style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: 13 }}>🚐 {t.name}</h4>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      Capacity: {t.current_load_kg}/{t.capacity_kg} kg · Available: {t.available_capacity} kg
                    </p>
                  </div>
                  <span className={`badge badge-${t.status === 'IDLE' ? 'collected' : 'escalated'}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Gap Route Details */}
          {gapRoutes.map(route => (
            <div key={route.id} className="route-panel" style={{ marginBottom: 10 }}>
              <div className="card-header">
                <span style={{ fontSize: 12, fontWeight: 700 }}>Route #{route.id}</span>
                <span className={`badge badge-${route.status === 'COMPLETED' ? 'collected' : route.status === 'IN_PROGRESS' ? 'escalated' : 'queued'}`}>
                  {route.status}
                </span>
              </div>
              <div className="route-info-grid">
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 14 }}>{route.total_distance} km</div>
                  <div className="route-info-label">Distance</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 14 }}>{route.estimated_waste} kg</div>
                  <div className="route-info-label">Waste</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 14 }}>{route.traffic_level}</div>
                  <div className="route-info-label">Traffic ({route.traffic_multiplier}×)</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value" style={{ fontSize: 14 }}>{route.stops?.length}</div>
                  <div className="route-info-label">Stops</div>
                </div>
              </div>

              {route.status === 'PLANNED' && (
                <button className="btn btn-primary btn-sm" onClick={() => handleStart(route.id)} style={{ width: '100%', justifyContent: 'center' }}>
                  🚀 Start Collection
                </button>
              )}

              {route.stops?.map(stop => (
                <div className="route-stop" key={stop.order}>
                  <div className={`stop-number ${stop.status === 'COLLECTED' ? 'collected' : ''}`}>{stop.order}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{stop.category}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stop.estimated_waste} kg</div>
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
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🗺️</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No gap routes generated yet</p>
            </div>
          )}
        </div>
      </div>

      <div className="demo-note" style={{ marginTop: 20 }}>
        <strong>GPS Verification:</strong> In production, the vehicle's GPS (via Raspberry Pi or driver's phone)
        POSTs to <code>/api/trucks/&#123;id&#125;/location</code>. The 40m geofence auto-verifies collection.
        In this demo, clicking "Collect" simulates GPS verification.
      </div>
    </div>
  );
}
