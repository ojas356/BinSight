import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import HotspotsPage from './pages/HotspotsPage';
import RoutesPage from './pages/RoutesPage';
import MunicipalLogin from './pages/MunicipalLogin';
import { getClock, setClock, simTick } from './services/api';

export default function MunicipalApp({ onBack }) {
  const [user, setUser]         = useState(null); // null = not logged in
  const [clock, setClockState]  = useState(null);

  const fetchClock = useCallback(async () => {
    try {
      const { data } = await getClock();
      setClockState(data);
    } catch (e) {
      console.error('Clock fetch error', e);
    }
  }, []);

  // Only start polling once logged in
  useEffect(() => {
    if (!user) return;
    fetchClock();
    const interval = setInterval(async () => {
      try {
        await simTick();
        const { data } = await getClock();
        setClockState(data);
      } catch (e) { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [user, fetchClock]);

  const handleSpeedChange = async (speed) => {
    try {
      const { data } = await setClock({ speed });
      setClockState(data);
    } catch (e) { console.error('Clock speed error', e); }
  };

  const handleJumpMorning = async () => {
    try {
      const { data } = await setClock({ jump_to_hour: 8, jump_to_minute: 30 });
      setClockState(data);
    } catch (e) { console.error('Clock jump error', e); }
  };

  const handleJumpAfternoon = async () => {
    try {
      const { data } = await setClock({ jump_to_hour: 15, jump_to_minute: 0 });
      setClockState(data);
    } catch (e) { console.error('Clock jump error', e); }
  };

  const handlePause = async () => {
    try {
      const { data } = await setClock({ pause: !clock?.paused });
      setClockState(data);
    } catch (e) { console.error('Clock pause error', e); }
  };

  const handleLogout = () => {
    setUser(null);
    setClockState(null);
  };

  // ── Gate: show login if not authenticated ──
  if (!user) {
    return <MunicipalLogin onLogin={setUser} onBack={onBack} />;
  }

  // ── Authenticated: full dashboard ──
  return (
    <BrowserRouter>
      <div className="app-layout">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <h1>BIN SIGHT</h1>
            <p>Municipal Operations</p>
          </div>

          <nav className="sidebar-nav">
            <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">📊</span> Operations
            </NavLink>
            <NavLink to="/hotspots" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">🔥</span> Hotspots
            </NavLink>
            <NavLink to="/routes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">🚛</span> Routes & Dispatch
            </NavLink>
          </nav>

          <div className="sidebar-footer">
            {/* Logged-in user pill */}
            <div className="login-user-pill">
              <span className="login-user-avatar">👤</span>
              <div className="login-user-info">
                <span className="login-user-name">{user.username}</span>
                <span className="login-user-role">{user.role} · {user.zone}</span>
              </div>
            </div>

            <button className="portal-back-btn portal-back-btn--sidebar" onClick={handleLogout}
              style={{ marginTop: 8 }}>
              🔓 Sign Out
            </button>

            <button className="portal-back-btn portal-back-btn--sidebar" onClick={onBack}
              style={{ marginTop: 6 }}>
              ← Switch Portal
            </button>

            <div className="demo-note" style={{ marginTop: 10 }}>
              <strong>Demo Mode</strong><br />
              Truck GPS, traffic, and historical data are simulated.
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main-content">

          {/* Top Bar — Sim Clock */}
          <div className="top-bar">
            <div className="clock-display">
              <div>
                <div className="sim-label">
                  Simulation Clock
                  <span className="sim-badge">SIMULATED</span>
                </div>
                <div className="sim-time">{clock?.display || '--:--:--'}</div>
              </div>
            </div>
            <div className="clock-controls">
              <button className="clock-btn" onClick={handlePause}>
                {clock?.paused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button className={`clock-btn ${clock?.speed === 1 ? 'active' : ''}`} onClick={() => handleSpeedChange(1)}>1×</button>
              <button className={`clock-btn ${clock?.speed === 6 ? 'active' : ''}`} onClick={() => handleSpeedChange(6)}>6×</button>
              <button className={`clock-btn ${clock?.speed === 20 ? 'active' : ''}`} onClick={() => handleSpeedChange(20)}>20×</button>
              <button className="clock-btn jump" onClick={handleJumpMorning}>☀️ 08:30</button>
              <button className="clock-btn jump" onClick={handleJumpAfternoon}>🌅 15:00</button>
            </div>
          </div>

          {/* Pages */}
          <div className="page-content">
            <Routes>
              <Route path="/" element={<Dashboard clock={clock} />} />
              <Route path="/hotspots" element={<HotspotsPage />} />
              <Route path="/routes" element={<RoutesPage clock={clock} />} />
            </Routes>
          </div>
        </main>

      </div>
    </BrowserRouter>
  );
}
