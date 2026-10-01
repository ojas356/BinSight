import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getReports, getStats, getTrucks, getFixedRoutes, getHotspots, getRoutes, resetSeed, generateRoute, startCollection, collectStop } from '../services/api';

// Safe JSON.parse — never crashes render
function safeJSON(val) {
  if (!val) return null;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return null; }
}

// ── Icons ──
const createIcon = (color, size = 10) => L.divIcon({
  className: '',
  html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.7);box-shadow:0 0 6px ${color}80;"></div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});

const truckIcon = (type) => L.divIcon({
  className: '',
  html: `<div style="font-size:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${type === 'FIXED' ? '🚛' : '🚐'}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const STATUS_COLORS = { HELD: '#4b8df8', ESCALATED: '#e85d3a', COLLECTED: '#34b870', QUEUED: '#555d70' };
const PRIORITY_COLORS = { CRITICAL: '#ef4444', HIGH: '#e85d3a', MEDIUM: '#e5a100', LOW: '#34b870' };

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15, { duration: 0.5 }); }, [center, map]);
  return null;
}

export default function Dashboard({ clock }) {
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [fixedRoutes, setFixedRoutes] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [gapRoutes, setGapRoutes] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'report'|'hotspot', data: ... }
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeGapRoute, setActiveGapRoute] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  // Ref so fetchAll can read current value without being in its dep array
  const activeGapRouteRef = useRef(null);
  useEffect(() => { activeGapRouteRef.current = activeGapRoute; }, [activeGapRoute]);

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
      // Only auto-set if the user hasn't already generated/selected a route
      if (gapRes.data.length > 0 && !activeGapRouteRef.current) {
        setActiveGapRoute(gapRes.data[0]);
      }
    } catch (e) {
      console.error('Fetch error', e);
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads activeGapRoute via ref, not closure

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { const interval = setInterval(fetchAll, 3000); return () => clearInterval(interval); }, [fetchAll]);

  const handleReset = async () => { setLoading(true); await resetSeed(); setActiveGapRoute(null); setSelectedItem(null); await fetchAll(); };

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
    const rid = activeGapRoute?.route_id || activeGapRoute?.id;
    if (!rid) return;
    try { await startCollection(rid); await fetchAll(); } catch (e) { console.error(e); }
  };

  const handleCollectStop = async (routeId, order) => {
    try { await collectStop(routeId, order); await fetchAll(); } catch (e) { console.error(e); }
  };

  const selectReport = (report) => {
    setSelectedItem({ type: 'report', data: report });
    setMapCenter([report.latitude, report.longitude]);
  };

  const selectHotspot = (hotspot) => {
    setSelectedItem({ type: 'hotspot', data: hotspot });
    setMapCenter([hotspot.latitude, hotspot.longitude]);
  };

  const filteredReports = reports.filter(r => {
    if (filter === 'ALL') return true;
    if (filter === 'HOTSPOTS') return r.hotspot_id;
    return r.status === filter;
  });

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="loading-spinner" style={{ width: 32, height: 32 }}></div></div>;

  return (
    <div className="fade-in">
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal">
          <div className="stat-value">{stats?.total_reports || 0}</div>
          <div className="stat-label">Active Reports</div>
          <div className="stat-icon">📋</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-value" style={{ color: 'var(--scheduled)' }}>{stats?.held || 0}</div>
          <div className="stat-label">Held for Scheduled</div>
          <div className="stat-icon">⏳</div>
        </div>
        <div className="stat-card red">
          <div className="stat-value" style={{ color: 'var(--escalated)' }}>{stats?.escalated || 0}</div>
          <div className="stat-label">Escalated</div>
          <div className="stat-icon">🚐</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-value" style={{ color: '#8b5cf6' }}>{stats?.active_hotspots || 0}</div>
          <div className="stat-label">Active Hotspots</div>
          <div className="stat-icon">🔥</div>
        </div>
        <div className="stat-card green">
          <div className="stat-value" style={{ color: 'var(--collected)' }}>{stats?.available_gap_vehicles || 0}/{stats?.total_gap_vehicles || 0}</div>
          <div className="stat-label">Gap Vehicles Ready</div>
          <div className="stat-icon">🚐</div>
        </div>
      </div>

      {/* Impact Row */}
      {stats?.impact && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Impact Metrics</span>
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
              <div className="impact-value" style={{ color: 'var(--collected)' }}>{stats.impact.pct_saved}%</div>
              <div className="impact-label">Km Saved vs Dedicated Trips</div>
            </div>
            <div className="impact-card">
              <div className="impact-value" style={{ color: 'var(--pending)' }}>{stats.impact.avg_clear_hours > 0 ? `${stats.impact.avg_clear_hours}h` : '—'}</div>
              <div className="impact-label">Avg Time to Clear</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Map + Sidebar */}
      <div className="dashboard-grid">
        {/* Map */}
        <div>
          <div className="map-container" style={{ height: 500 }}>
            <MapContainer center={[19.0900, 72.8780]} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              {mapCenter && <MapUpdater center={mapCenter} />}

              {/* Fixed Routes — blue dashed */}
              {fixedRoutes.map(route => (
                <Polyline key={`fr-${route.id}`} positions={route.waypoints}
                  pathOptions={{ color: '#4b8df8', weight: 3, opacity: 0.5, dashArray: '8, 6' }}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>🔒 {route.name}</strong><br />
                      <span style={{ fontSize: 10, color: '#888' }}>Scheduled route — read-only</span><br />
                      Window: {route.window_start} – {route.window_end}
                    </div>
                  </Popup>
                </Polyline>
              ))}

              {/* Gap Route — orange solid */}
              {activeGapRoute?.geometry && (
                <Polyline positions={activeGapRoute.geometry}
                  pathOptions={{ color: '#e85d3a', weight: 4, opacity: 0.9 }} />
              )}

              {/* Gap Route Stops */}
              {activeGapRoute?.stops?.map(stop => (
                <Marker key={`stop-${stop.order}`} position={[stop.lat, stop.lon]}
                  icon={L.divIcon({
                    className: '',
                    html: `<div style="width:22px;height:22px;border-radius:50%;background:${stop.status === 'COLLECTED' ? '#34b870' : '#e85d3a'};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${stop.order}</div>`,
                    iconSize: [22, 22], iconAnchor: [11, 11],
                  })}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>Stop #{stop.order}</strong><br />
                      {stop.category} · {stop.estimated_waste} kg · {stop.priority}<br />
                      Status: {stop.status}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Reports */}
              {filteredReports.map(report => (
                <Marker key={`r-${report.id}`} position={[report.latitude, report.longitude]}
                  icon={createIcon(
                    report.priority === 'CRITICAL' ? PRIORITY_COLORS.CRITICAL : STATUS_COLORS[report.status] || '#555d70',
                    report.priority === 'CRITICAL' ? 14 : 10
                  )}
                  eventHandlers={{ click: () => selectReport(report) }}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>#{report.id}</strong> {report.category}<br />
                      {report.status} · {report.priority} ({report.priority_score})
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Hotspots — circles */}
              {hotspots.map(h => (
                <Circle key={`h-${h.id}`} center={[h.latitude, h.longitude]} radius={120}
                  pathOptions={{
                    color: h.recurring ? '#ef4444' : '#ff6b4a',
                    fillColor: h.recurring ? '#ef444430' : '#ff6b4a20',
                    fillOpacity: 0.4, weight: 2,
                    dashArray: h.recurring ? '' : '5, 5'
                  }}
                  eventHandlers={{ click: () => selectHotspot(h) }}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>🔥 Hotspot</strong><br />
                      {h.report_count} reports · {Math.round(h.estimated_waste)} kg<br />
                      {h.recurring && <span style={{ color: '#ef4444' }}>⚠ Recurring</span>}
                    </div>
                  </Popup>
                </Circle>
              ))}

              {/* Trucks */}
              {trucks.map(t => (
                <Marker key={`t-${t.id}`} position={[t.latitude, t.longitude]} icon={truckIcon(t.type)}>
                  <Popup>
                    <div style={{ fontFamily: 'Inter, sans-serif' }}>
                      <strong>{t.name}</strong><br />
                      {t.type === 'FIXED' ? 'Scheduled' : 'Gap Crew'} · {t.status}<br />
                      Load: {t.current_load_kg}/{t.capacity_kg} kg
                      {t.progress !== undefined && <><br />Progress: {Math.round(t.progress * 100)}%</>}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-escalate" onClick={handleGenerateRoute} disabled={generating}>
              {generating ? <span className="loading-spinner"></span> : '🗺️'} Generate Gap Response
            </button>
            {(activeGapRoute?.route_id || activeGapRoute?.id) && (
              <button className="btn btn-primary" onClick={handleStartCollection}>
                🚀 Start Collection
              </button>
            )}
            <button className="btn btn-outline" onClick={handleReset}>🔄 Reset Demo</button>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="dashboard-sidebar">
          {/* Filters */}
          <div className="filter-bar">
            {['ALL', 'HELD', 'ESCALATED', 'COLLECTED', 'HOTSPOTS'].map(f => (
              <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}>
                {f === 'ALL' ? `All (${reports.length})` :
                 f === 'HELD' ? `Held (${reports.filter(r => r.status === 'HELD').length})` :
                 f === 'ESCALATED' ? `Escalated (${reports.filter(r => r.status === 'ESCALATED').length})` :
                 f === 'COLLECTED' ? `Collected (${reports.filter(r => r.status === 'COLLECTED').length})` :
                 `Hotspots (${hotspots.length})`}
              </button>
            ))}
          </div>

          {/* Hotspot Detail Panel */}
          {selectedItem?.type === 'hotspot' && (() => {
            const h = selectedItem.data;
            const rec = safeJSON(h.recommendation);
            const intervention = rec?.intervention;
            return (
              <div className="hotspot-detail slide-up">
                <div className="hotspot-detail-header">
                  <div>
                    <div className="hotspot-detail-title">🔥 Hotspot Detected</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.latitude.toFixed(4)}, {h.longitude.toFixed(4)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span className={`badge badge-${(h.priority || 'medium').toLowerCase()}`}>{h.priority}</span>
                    {h.recurring && <span className="badge badge-recurring">Recurring</span>}
                  </div>
                </div>

                <div className="hotspot-stats-grid">
                  <div className="hotspot-stat">
                    <div className="hotspot-stat-value" style={{ color: 'var(--escalated)' }}>{h.report_count}</div>
                    <div className="hotspot-stat-label">Related Reports</div>
                  </div>
                  <div className="hotspot-stat">
                    <div className="hotspot-stat-value">{Math.round(h.estimated_waste)} kg</div>
                    <div className="hotspot-stat-label">Estimated Waste</div>
                  </div>
                  <div className="hotspot-stat">
                    <div className="hotspot-stat-value" style={{ color: h.recurring ? '#ef4444' : 'var(--text-muted)' }}>{h.recurrence_count || 0}</div>
                    <div className="hotspot-stat-label">Historical Incidents</div>
                  </div>
                  <div className="hotspot-stat">
                    <div className="hotspot-stat-value" style={{ fontSize: 13 }}>{rec?.dominant_category || '—'}</div>
                    <div className="hotspot-stat-label">Dominant Type</div>
                  </div>
                </div>

                {rec?.categories && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                    {Object.entries(rec.categories).map(([cat, count]) => (
                      <span key={cat} className="badge badge-medium">{cat}: {count}</span>
                    ))}
                  </div>
                )}

                {rec?.recurrence_description && (
                  <div style={{ fontSize: 11, color: h.recurring ? '#ef4444' : 'var(--text-muted)', marginBottom: 8 }}>
                    {rec.recurrence_description}
                  </div>
                )}

                <div className="hotspot-decision">
                  <div className="hotspot-decision-label" style={{ color: 'var(--escalated)' }}>Decision: ESCALATE</div>
                  <div className="hotspot-decision-text">
                    {h.report_count} reports clustered here. Gap crew response recommended.
                  </div>
                </div>

                {intervention && (
                  <div className="hotspot-recommendation">
                    <h4>💡 Planner Recommendation</h4>
                    <p>{intervention.recommendation}</p>
                    <p style={{ marginTop: 4, color: 'var(--collected)', fontSize: 11 }}>📉 {intervention.expected_effect}</p>
                    <div className="planner-label">🔒 {intervention.label}</div>
                  </div>
                )}

                <button className="btn btn-escalate btn-sm" onClick={handleGenerateRoute} disabled={generating}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>
                  {generating ? <span className="loading-spinner"></span> : '🗺️'} Generate Gap Response
                </button>
              </div>
            );
          })()}

          {/* Report Detail Panel */}
          {selectedItem?.type === 'report' && (() => {
            const r = selectedItem.data;
            return (
              <div className="detail-panel slide-up">
                <div className="card-header">
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Report #{r.id}</span>
                  <span className={`badge badge-${(r.status || 'queued').toLowerCase()}`}>{r.status}</span>
                </div>
                <div className="detail-section">
                  <div className="detail-row"><span className="detail-label">Category</span><span className="detail-value">{r.category}</span></div>
                  <div className="detail-row"><span className="detail-label">Priority</span><span className={`badge badge-${(r.priority || 'medium').toLowerCase()}`}>{r.priority} ({r.priority_score})</span></div>
                  <div className="detail-row"><span className="detail-label">Size</span><span className="detail-value">{r.size} ({r.estimated_waste} kg)</span></div>
                  <div className="detail-row"><span className="detail-label">Time</span><span className="detail-value" style={{ fontSize: 10 }}>{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</span></div>
                  {r.description && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>{r.description}</div>}
                  {r.duplicate_group_id && <div style={{ marginTop: 4, fontSize: 10, color: '#8b5cf6' }}>🔗 Duplicate group #{r.duplicate_group_id}</div>}
                  {r.status === 'HELD' && (
                    <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(75,141,248,0.08)', borderRadius: 6, fontSize: 11 }}>
                      ⏳ Held for Route #{r.held_by_route_id} · ETA: ~{r.eta_minutes} min
                    </div>
                  )}
                </div>
                {r.priority_breakdown && (
                  <div className="detail-section">
                    <div className="card-title" style={{ marginBottom: 6 }}>Priority Breakdown</div>
                    <div className="priority-breakdown">
                      {Object.entries(r.priority_breakdown).map(([key, data]) => (
                        <div className="priority-bar" key={key}>
                          <div className="priority-bar-label">
                            <span style={{ color: 'var(--text-muted)' }}>{key.replace(/_/g, ' ')}</span>
                            <span>{data.score}/{data.max}</span>
                          </div>
                          <div className="priority-bar-track">
                            <div className="priority-bar-fill" style={{ width: `${(data.score / data.max) * 100}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Gap Route Panel */}
          {activeGapRoute && !activeGapRoute.error && (
            <div className="route-panel slide-up">
              <div className="card-header">
                <span className="card-title">🚐 Gap Response Route</span>
                <span className={`badge badge-${(activeGapRoute.traffic_level || 'LOW').toLowerCase() === 'high' ? 'critical' : 'medium'}`}>
                  {activeGapRoute.traffic_level || 'LOW'} Traffic
                </span>
              </div>
              <div className="route-info-grid">
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.num_stops || activeGapRoute.stops?.length}</div>
                  <div className="route-info-label">Stops</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.total_distance} km</div>
                  <div className="route-info-label">Distance</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.estimated_waste} kg</div>
                  <div className="route-info-label">Waste</div>
                </div>
                <div className="route-info-item">
                  <div className="route-info-value">{activeGapRoute.remaining_capacity || '—'} kg</div>
                  <div className="route-info-label">Remaining Cap.</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                Vehicle: {activeGapRoute.truck_name || `Truck #${activeGapRoute.truck_id}`} · ETA: {activeGapRoute.estimated_time_min || '—'} min
              </div>
              {activeGapRoute.stops?.map(stop => (
                <div className="route-stop" key={stop.order}>
                  <div className={`stop-number ${stop.status === 'COLLECTED' ? 'collected' : ''}`}>{stop.order}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{stop.category}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stop.estimated_waste} kg · {stop.priority}</div>
                  </div>
                  {stop.status === 'COLLECTED' ? (
                    <span className="badge badge-collected">✓ Verified</span>
                  ) : (
                    <button className="btn btn-sm btn-outline" onClick={() => handleCollectStop(activeGapRoute.route_id || activeGapRoute.id, stop.order)}>
                      📍 Collect
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Response Queue */}
          <div className="card" style={{ maxHeight: 350, overflowY: 'auto' }}>
            <div className="card-title" style={{ marginBottom: 8 }}>
              {filter === 'HOTSPOTS' ? 'Hotspots' : 'Response Queue'} ({filter === 'HOTSPOTS' ? hotspots.length : filteredReports.length})
            </div>

            {filter === 'HOTSPOTS' ? (
              <div className="response-queue">
                {hotspots.map(h => (
                  <div key={h.id} className={`queue-item is-hotspot ${selectedItem?.type === 'hotspot' && selectedItem.data.id === h.id ? 'selected' : ''}`}
                    onClick={() => selectHotspot(h)}>
                    <div className="queue-dot" style={{ background: h.recurring ? '#ef4444' : '#ff6b4a' }}></div>
                    <div className="queue-info">
                      <h4>🔥 Hotspot #{h.id}</h4>
                      <p>{h.report_count} reports · {Math.round(h.estimated_waste)} kg{h.recurring ? ' · Recurring' : ''}</p>
                    </div>
                    <span className={`badge badge-${(h.priority || 'medium').toLowerCase()}`}>{h.priority}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="response-queue">
                {filteredReports.slice(0, 25).map(r => (
                  <div key={r.id}
                    className={`queue-item is-${r.status.toLowerCase()} ${selectedItem?.type === 'report' && selectedItem.data.id === r.id ? 'selected' : ''}`}
                    onClick={() => selectReport(r)}>
                    <div className="queue-dot" style={{ background: STATUS_COLORS[r.status] || '#555d70' }}></div>
                    <div className="queue-info">
                      <h4>#{r.id} {r.category}</h4>
                      <p>{r.description?.slice(0, 40) || r.size} · {r.estimated_waste} kg</p>
                    </div>
                    <span className={`badge badge-${(r.priority || 'medium').toLowerCase()}`}>{r.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
