import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getReports, getStats, getTrucks, getFixedRoutes, getHotspots, getRoutes, resetSeed, generateRoute, startCollection, collectStop } from '../services/api';


// Custom marker icons
const createIcon = (color, size = 12) => L.divIcon({
  className: '',
  html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 8px ${color}80;"></div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});

const truckIcon = (type) => L.divIcon({
  className: '',
  html: `<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${type === 'FIXED' ? '🚛' : '🚐'}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const hotspotIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🔥</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const STATUS_COLORS = {
  HELD: '#3b82f6',
  ESCALATED: '#f59e0b',
  COLLECTED: '#22c55e',
  QUEUED: '#8b8fa7',
};

const PRIORITY_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f59e0b',
  MEDIUM: '#3b82f6',
  LOW: '#22c55e',
};

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function Dashboard({ clock }) {
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [fixedRoutes, setFixedRoutes] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [gapRoutes, setGapRoutes] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeGapRoute, setActiveGapRoute] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, reportsRes, trucksRes, routesRes, hotspotsRes, gapRes] = await Promise.all([
        getStats(), getReports(), getTrucks(), getFixedRoutes(), getHotspots(), getRoutes()
      ]);
      setStats(statsRes.data);
      setReports(reportsRes.data);
      setTrucks(trucksRes.data);
      setFixedRoutes(routesRes.data);
      setHotspots(hotspotsRes.data);
      setGapRoutes(gapRes.data);
      if (gapRes.data.length > 0) {
        setActiveGapRoute(gapRes.data[0]);
      }
    } catch (e) {
      console.error('Fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleReset = async () => {
    setLoading(true);
    await resetSeed();
    await fetchAll();
  };

  const handleGenerateRoute = async () => {
    setGenerating(true);
    try {
      const { data } = await generateRoute();
      setActiveGapRoute(data);
      await fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to generate route');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartCollection = async () => {
    if (!activeGapRoute?.route_id) return;
    try {
      await startCollection(activeGapRoute.route_id);
      await fetchAll();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCollectStop = async (routeId, order) => {
    try {
      await collectStop(routeId, order);
      await fetchAll();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredReports = reports.filter(r => {
    if (filter === 'ALL') return true;
    if (filter === 'HOTSPOTS') return r.hotspot_id;
    return r.status === filter;
  });

  const mapCenter = [19.0970, 72.8780]; // Mumbai center

  if (loading) return <div style={{ textAlign: 'center', padding: '80px' }}><div className="loading-spinner" style={{ width: 40, height: 40 }}></div></div>;

  return (
    <div className="fade-in">
      {/* Stats Row */}
      <div className="stats-grid">
        <div className="stat-card teal">
          <div className="stat-value">{stats?.total_reports || 0}</div>
          <div className="stat-label">Total Reports</div>
          <div className="stat-icon">📋</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-value" style={{ color: '#3b82f6' }}>{stats?.held || 0}</div>
          <div className="stat-label">Held for Fixed Truck</div>
          <div className="stat-icon">⏳</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-value" style={{ color: '#f59e0b' }}>{stats?.escalated || 0}</div>
          <div className="stat-label">Escalated to Gap Crew</div>
          <div className="stat-icon">🚐</div>
        </div>
        <div className="stat-card red">
          <div className="stat-value" style={{ color: '#ef4444' }}>{stats?.high_priority || 0}</div>
          <div className="stat-label">High Priority</div>
          <div className="stat-icon">⚠️</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{stats?.active_hotspots || 0}</div>
          <div className="stat-label">Active Hotspots</div>
          <div className="stat-icon">🔥</div>
        </div>
        <div className="stat-card green">
          <div className="stat-value" style={{ color: '#22c55e' }}>
            {stats?.available_gap_vehicles || 0}/{stats?.total_gap_vehicles || 0}
          </div>
          <div className="stat-label">Available Gap Vehicles</div>
          <div className="stat-icon">🚐</div>
        </div>
      </div>

      {/* Impact Panel */}
      {stats?.impact && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">📈 Impact Metrics</span>
            <span className={`traffic-indicator traffic-${stats.traffic?.level?.toLowerCase()}`}>
              🚦 Traffic: {stats.traffic?.level} ({stats.traffic?.multiplier}×)
            </span>
          </div>
          <div className="impact-grid">
            <div className="impact-card">
              <div className="impact-value">{stats.impact.trips_avoided}</div>
              <div className="impact-label">Trips Avoided by Holding</div>
            </div>
            <div className="impact-card">
              <div className="impact-value" style={{ color: '#22c55e' }}>{stats.impact.pct_saved}%</div>
              <div className="impact-label">Km Saved vs Dedicated Trips</div>
            </div>
            <div className="impact-card">
              <div className="impact-value" style={{ color: '#f59e0b' }}>
                {stats.impact.avg_clear_hours > 0 ? `${stats.impact.avg_clear_hours}h` : '—'}
              </div>
              <div className="impact-label">Avg Time to Clear</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Dashboard Grid */}
      <div className="dashboard-grid">
        {/* Map */}
        <div>
          <div className="map-container" style={{ height: 520 }}>
            <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />

              {/* Fixed Routes (teal, locked) */}
              {fixedRoutes.map(route => (
                <Polyline
                  key={`fr-${route.id}`}
                  positions={route.waypoints}
                  pathOptions={{ color: '#2dd4bf', weight: 4, opacity: 0.7, dashArray: '8, 4' }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>🔒 {route.name}</strong><br />
                      <span style={{ fontSize: 11, color: '#888' }}>Fixed route — not modified</span><br />
                      Window: {route.window_start} – {route.window_end}
                    </div>
                  </Popup>
                </Polyline>
              ))}

              {/* Gap Route */}
              {activeGapRoute?.geometry && (
                <Polyline
                  positions={activeGapRoute.geometry}
                  pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.9 }}
                />
              )}

              {/* Gap Route Stops */}
              {activeGapRoute?.stops?.map(stop => (
                <Marker
                  key={`stop-${stop.order}`}
                  position={[stop.lat, stop.lon]}
                  icon={L.divIcon({
                    className: '',
                    html: `<div style="width:24px;height:24px;border-radius:50%;background:${stop.status === 'COLLECTED' ? '#22c55e' : '#f59e0b'};color:#000;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${stop.order}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                  })}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>Stop #{stop.order}</strong><br />
                      {stop.category} • {stop.estimated_waste} kg<br />
                      Priority: {stop.priority}<br />
                      Status: {stop.status}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Reports */}
              {filteredReports.map(report => (
                <Marker
                  key={`r-${report.id}`}
                  position={[report.latitude, report.longitude]}
                  icon={createIcon(
                    report.priority === 'CRITICAL' ? PRIORITY_COLORS.CRITICAL : STATUS_COLORS[report.status] || '#8b8fa7',
                    report.priority === 'CRITICAL' ? 16 : 12
                  )}
                  eventHandlers={{ click: () => setSelectedReport(report) }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>Report #{report.id}</strong><br />
                      {report.category} • {report.size}<br />
                      Status: {report.status}<br />
                      Priority: {report.priority} ({report.priority_score})
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Hotspots */}
              {hotspots.map(h => (
                <Circle
                  key={`h-${h.id}`}
                  center={[h.latitude, h.longitude]}
                  radius={100}
                  pathOptions={{
                    color: h.recurring ? '#ef4444' : '#f59e0b',
                    fillColor: h.recurring ? '#ef444440' : '#f59e0b30',
                    fillOpacity: 0.3,
                    weight: 2,
                    dashArray: h.recurring ? '' : '5, 5'
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>🔥 Hotspot #{h.id}</strong><br />
                      Reports: {h.report_count} • Waste: {h.estimated_waste} kg<br />
                      {h.recurring && <span style={{ color: '#ef4444' }}>⚠ Recurring ({h.recurrence_count} historical incidents)</span>}
                    </div>
                  </Popup>
                </Circle>
              ))}

              {/* Trucks */}
              {trucks.map(t => (
                <Marker
                  key={`t-${t.id}`}
                  position={[t.latitude, t.longitude]}
                  icon={truckIcon(t.type)}
                >
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>{t.type === 'FIXED' ? '🚛' : '🚐'} {t.name}</strong><br />
                      Type: {t.type} • Status: {t.status}<br />
                      Load: {t.current_load_kg}/{t.capacity_kg} kg<br />
                      {t.route_name && <span>Route: {t.route_name}<br /></span>}
                      {t.progress !== undefined && <span>Progress: {Math.round(t.progress * 100)}%</span>}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-amber" onClick={handleGenerateRoute} disabled={generating}>
              {generating ? <span className="loading-spinner"></span> : '🗺️'} Generate Collection Route
            </button>
            {activeGapRoute?.route_id && (
              <button className="btn btn-primary" onClick={handleStartCollection}>
                🚀 Start Collection
              </button>
            )}
            <button className="btn btn-outline" onClick={handleReset}>🔄 Reset Demo Data</button>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="dashboard-sidebar">
          {/* Filters */}
          <div className="filter-bar">
            {['ALL', 'HELD', 'ESCALATED', 'COLLECTED', 'HOTSPOTS'].map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'ALL' ? `All (${reports.length})` :
                 f === 'HELD' ? `Held (${reports.filter(r => r.status === 'HELD').length})` :
                 f === 'ESCALATED' ? `Escalated (${reports.filter(r => r.status === 'ESCALATED').length})` :
                 f === 'COLLECTED' ? `Collected (${reports.filter(r => r.status === 'COLLECTED').length})` :
                 `Hotspots (${reports.filter(r => r.hotspot_id).length})`}
              </button>
            ))}
          </div>

          {/* Selected Report Detail */}
          {selectedReport && (
            <div className="detail-panel slide-up">
              <div className="card-header">
                <span className="card-title">Report #{selectedReport.id}</span>
                <span className={`badge badge-${selectedReport.status.toLowerCase()}`}>{selectedReport.status}</span>
              </div>
              <div className="detail-section">
                <div className="detail-row">
                  <span className="detail-label">Category</span>
                  <span className="detail-value">{selectedReport.category}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Priority</span>
                  <span className={`badge badge-${selectedReport.priority.toLowerCase()}`}>{selectedReport.priority} ({selectedReport.priority_score})</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Size</span>
                  <span className="detail-value">{selectedReport.size} ({selectedReport.estimated_waste} kg)</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Time</span>
                  <span className="detail-value" style={{ fontSize: 11 }}>{selectedReport.timestamp ? new Date(selectedReport.timestamp).toLocaleString() : '—'}</span>
                </div>
                {selectedReport.description && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {selectedReport.description}
                  </div>
                )}
                {selectedReport.duplicate_group_id && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#8b5cf6' }}>
                    🔗 Duplicate group #{selectedReport.duplicate_group_id}
                  </div>
                )}
                {selectedReport.status === 'HELD' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(59,130,246,0.1)', borderRadius: 8, fontSize: 12 }}>
                    ⏳ Held for Fixed Route #{selectedReport.held_by_route_id}<br />
                    ETA: ~{selectedReport.eta_minutes} minutes
                  </div>
                )}
              </div>

              {/* Priority Breakdown */}
              {selectedReport.priority_breakdown && (
                <div className="detail-section">
                  <div className="card-title" style={{ marginBottom: 8 }}>Priority Breakdown</div>
                  <div className="priority-breakdown">
                    {Object.entries(selectedReport.priority_breakdown).map(([key, data]) => (
                      <div className="priority-bar" key={key}>
                        <div className="priority-bar-label">
                          <span style={{ color: 'var(--text-muted)' }}>{key.replace(/_/g, ' ')}</span>
                          <span>{data.score}/{data.max}</span>
                        </div>
                        <div className="priority-bar-track">
                          <div className="priority-bar-fill" style={{ width: `${(data.score / data.max) * 100}%` }}></div>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{data.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Gap Route Panel */}
          {activeGapRoute && !activeGapRoute.error && (
            <div className="route-panel slide-up">
              <div className="card-header">
                <span className="card-title">🚐 Gap Route</span>
                <span className={`badge badge-${(activeGapRoute.traffic_level || 'LOW').toLowerCase() === 'high' ? 'critical' : activeGapRoute.traffic_level?.toLowerCase() === 'medium' ? 'escalated' : 'collected'}`}>
                  {activeGapRoute.traffic_level || 'LOW'} Traffic
                </span>
              </div>
              <div className="route-info-grid">
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.num_stops}</div>
                  <div className="route-info-label">Stops</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.total_distance} km</div>
                  <div className="route-info-label">Distance</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.estimated_waste} kg</div>
                  <div className="route-info-label">Estimated Waste</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.remaining_capacity} kg</div>
                  <div className="route-info-label">Remaining Capacity</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                Vehicle: {activeGapRoute.truck_name} • ETA: {activeGapRoute.estimated_time_min} min
              </div>
              {/* Stops list */}
              {activeGapRoute.stops?.map(stop => (
                <div className="route-stop" key={stop.order}>
                  <div className={`stop-number ${stop.status === 'COLLECTED' ? 'collected' : ''}`}>{stop.order}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{stop.category}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stop.estimated_waste} kg • {stop.priority}</div>
                  </div>
                  {stop.status === 'COLLECTED' ? (
                    <span className="badge badge-collected">✓ Collected</span>
                  ) : (
                    <button className="btn btn-sm btn-outline" onClick={() => handleCollectStop(activeGapRoute.route_id, stop.order)}>
                      Collect
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Report List */}
          <div className="card" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Reports ({filteredReports.length})</div>
            <div className="report-list">
              {filteredReports.slice(0, 20).map(r => (
                <div
                  key={r.id}
                  className={`report-item ${selectedReport?.id === r.id ? 'selected' : ''}`}
                  onClick={() => setSelectedReport(r)}
                >
                  <div className="report-category-dot" style={{ background: STATUS_COLORS[r.status] || '#8b8fa7' }}></div>
                  <div className="report-info">
                    <h4>#{r.id} {r.category}</h4>
                    <p>{r.description?.slice(0, 50) || r.size}</p>
                  </div>
                  <div className="report-meta">
                    <span className={`badge badge-${r.priority.toLowerCase()}`}>{r.priority}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
