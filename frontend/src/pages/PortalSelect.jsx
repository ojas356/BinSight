export default function PortalSelect({ onSelect }) {
  return (
    <div className="portal-select-bg">
      <div className="portal-select-wrapper fade-in">

        {/* Brand */}
        <div className="portal-brand">
          <div className="portal-logo">🗑️</div>
          <h1 className="portal-brand-title">BIN SIGHT</h1>
          <p className="portal-brand-sub">Smart On-Demand Waste Collection</p>
        </div>

        <p className="portal-prompt">Who are you?</p>

        {/* Cards */}
        <div className="portal-cards">

          {/* Citizen */}
          <button className="portal-card portal-card-citizen" onClick={() => onSelect('citizen')}>
            <div className="portal-card-icon">👤</div>
            <div className="portal-card-body">
              <h2>Citizen Portal</h2>
              <p>Spotted waste in your area? Report it in 30 seconds with a photo and your location.</p>
              <ul className="portal-card-features">
                <li>📸 Upload a waste photo</li>
                <li>📍 One-tap GPS location</li>
                <li>🤖 AI auto-classifies waste type</li>
                <li>⏱️ Instant response estimate</li>
              </ul>
            </div>
            <div className="portal-card-arrow">→</div>
          </button>

          {/* Municipal */}
          <button className="portal-card portal-card-municipal" onClick={() => onSelect('municipal')}>
            <div className="portal-card-icon">🏛️</div>
            <div className="portal-card-body">
              <h2>Municipal Dashboard</h2>
              <p>Monitor all reports, dispatch trucks, analyze hotspots and generate optimised collection routes.</p>
              <ul className="portal-card-features">
                <li>📊 Live report dashboard & map</li>
                <li>🔥 DBSCAN hotspot detection</li>
                <li>🚛 Route planning for gap crews</li>
                <li>📈 Impact metrics & analytics</li>
              </ul>
            </div>
            <div className="portal-card-arrow">→</div>
          </button>

        </div>

        <p className="portal-footer-note">
          Demo mode — truck GPS, traffic, and historical data are simulated.
        </p>
      </div>
    </div>
  );
}
