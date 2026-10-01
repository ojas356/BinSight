export default function PortalSelect({ onSelect }) {
  return (
    <div className="portal-select-bg">
      <div className="portal-select-wrapper fade-in">

        {/* Brand */}
        <div className="portal-brand">
          <div className="portal-logo">🗑️</div>
          <h1 className="portal-brand-title">BIN SIGHT</h1>
          <p className="portal-brand-sub">Smart On-Demand Waste Response</p>
          <p className="portal-tagline">
            Scheduled routes handle predictable collection.<br />
            BinSight handles <em>what happens between them</em>.
          </p>
        </div>

        <p className="portal-prompt">Select your role</p>

        {/* Cards */}
        <div className="portal-cards">

          {/* Citizen */}
          <button className="portal-card portal-card-citizen" onClick={() => onSelect('citizen')}>
            <div className="portal-card-icon">📸</div>
            <div className="portal-card-body">
              <h2>Report Waste</h2>
              <p>Spotted waste that wasn't collected? Report it in 30 seconds. We'll determine if a truck is already on the way — or dispatch one.</p>
              <ul className="portal-card-features">
                <li>📷 Upload a photo of the waste</li>
                <li>📍 One-tap GPS location</li>
                <li>🤖 AI classifies waste type instantly</li>
                <li>⏱️ Know your response status immediately</li>
              </ul>
            </div>
            <div className="portal-card-arrow">→</div>
          </button>

          {/* Municipal */}
          <button className="portal-card portal-card-municipal" onClick={() => onSelect('municipal')}>
            <div className="portal-card-icon">🏛️</div>
            <div className="portal-card-body">
              <h2>Municipal Operations</h2>
              <p>Monitor reports, detect hotspots, and dispatch gap crew vehicles for waste that falls between scheduled routes.</p>
              <ul className="portal-card-features">
                <li>🗺️ Live map with all reports & trucks</li>
                <li>🔥 Automatic hotspot clustering</li>
                <li>🚛 Gap crew dispatch & routing</li>
                <li>📈 Impact analytics & planner insights</li>
              </ul>
            </div>
            <div className="portal-card-arrow">→</div>
          </button>

        </div>

        <p className="portal-footer-note">
          Demo — truck GPS, traffic levels, and historical data are simulated.
        </p>
      </div>
    </div>
  );
}
