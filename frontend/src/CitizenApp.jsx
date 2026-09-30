import CitizenReport from './pages/CitizenReport';

export default function CitizenApp({ onBack }) {
  return (
    <div className="citizen-layout">
      {/* Header */}
      <header className="citizen-header">
        <div className="citizen-header-left">
          <button className="portal-back-btn" onClick={onBack}>← Portals</button>
          <div className="citizen-brand">
            <span className="citizen-brand-icon">🗑️</span>
            <div>
              <span className="citizen-brand-title">BIN SIGHT</span>
              <span className="citizen-brand-badge">Citizen</span>
            </div>
          </div>
        </div>
        <div className="citizen-header-right">
          <span className="citizen-header-tagline">📍 Report waste in your area</span>
        </div>
      </header>

      {/* Content */}
      <main className="citizen-main">
        <CitizenReport />
      </main>

      {/* Footer */}
      <footer className="citizen-footer">
        <p>Your report helps keep the city clean. Reports are processed within 1–3 hours.</p>
      </footer>
    </div>
  );
}
