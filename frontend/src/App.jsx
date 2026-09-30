import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CitizenReport from './pages/CitizenReport';
import HotspotsPage from './pages/HotspotsPage';
import RoutesPage from './pages/RoutesPage';
import { getClock, setClock, simTick } from './services/api';
import './index.css';

function App() {
  const [clock, setClockState] = useState(null);

  const fetchClock = useCallback(async () => {
    try {
      const { data } = await getClock();
      setClockState(data);
    } catch (e) {
      console.error('Clock fetch error', e);
    }
  }, []);

  // Poll clock + tick every 2 seconds
  useEffect(() => {
    fetchClock();
    const interval = setInterval(async () => {
      try {
        await simTick();
        const { data } = await getClock();
        setClockState(data);
      } catch (e) { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchClock]);

  const handleSpeedChange = async (speed) => {
    const { data } = await setClock({ speed });
    setClockState(data);
  };

  const handleJumpAfternoon = async () => {
    const { data } = await setClock({ jump_to_hour: 15, jump_to_minute: 0 });
    setClockState(data);
  };

  const handleJumpMorning = async () => {
    const { data } = await setClock({ jump_to_hour: 8, jump_to_minute: 30 });
    setClockState(data);
  };

  const handlePause = async () => {
    const { data } = await setClock({ pause: !clock?.paused });
    setClockState(data);
  };

  return (
    <BrowserRouter>
      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <h1>BIN SIGHT</h1>
            <p>Smart On-Demand Waste Collection</p>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
              <span className="nav-icon">📊</span> Dashboard
            </NavLink>
            <NavLink to="/report" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">📸</span> Citizen Report
            </NavLink>
            <NavLink to="/hotspots" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">🔥</span> Hotspots
            </NavLink>
            <NavLink to="/routes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">🚛</span> Routes
            </NavLink>
          </nav>
          <div className="sidebar-footer">
            <div className="demo-note">
              <strong>Demo Mode</strong><br />
              Truck GPS, traffic, and historical data are simulated.
              Real devices would POST to the same APIs.
            </div>
          </div>
        </aside>

        {/* Main */}
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

          {/* Page Content */}
          <div className="page-content">
            <Routes>
              <Route path="/" element={<Dashboard clock={clock} />} />
              <Route path="/report" element={<CitizenReport />} />
              <Route path="/hotspots" element={<HotspotsPage />} />
              <Route path="/routes" element={<RoutesPage clock={clock} />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
