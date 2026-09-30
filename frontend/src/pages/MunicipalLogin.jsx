import { useState } from 'react';

// Demo credentials — clearly labelled, no real auth
const DEMO_USERS = [
  { username: 'admin',    password: 'admin123',   role: 'Administrator',  zone: 'All Zones' },
  { username: 'operator', password: 'operator123', role: 'Field Operator', zone: 'Andheri East' },
  { username: 'demo',     password: 'demo',        role: 'Demo User',      zone: 'All Zones' },
];

export default function MunicipalLogin({ onLogin, onBack }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const match = DEMO_USERS.find(
        u => u.username === username.trim().toLowerCase() && u.password === password
      );
      if (match) {
        onLogin(match);
      } else {
        setError('Invalid username or password.');
      }
      setLoading(false);
    }, 600); // small artificial delay for realism
  };

  const fillDemo = (user) => {
    setUsername(user.username);
    setPassword(user.password);
    setError('');
  };

  return (
    <div className="login-bg">
      <div className="login-wrapper fade-in">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo">🏛️</div>
          <h1 className="login-title">Municipal Dashboard</h1>
          <p className="login-sub">BinSight — Smart On-Demand Waste Collection</p>
        </div>

        {/* Form card */}
        <div className="login-card">
          <h2 className="login-card-title">Sign in</h2>

          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. admin"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              disabled={loading || !username || !password}
            >
              {loading ? <span className="loading-spinner"></span> : '🔐'} Sign In
            </button>
          </form>

          {/* Demo credentials hint */}
          <div className="login-demo-block">
            <p className="login-demo-label">Demo accounts — click to fill:</p>
            <div className="login-demo-pills">
              {DEMO_USERS.map(u => (
                <button
                  key={u.username}
                  type="button"
                  className="login-demo-pill"
                  onClick={() => fillDemo(u)}
                >
                  <span className="login-demo-pill-name">{u.username}</span>
                  <span className="login-demo-pill-role">{u.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="portal-back-btn" onClick={onBack} style={{ marginTop: 8 }}>
          ← Back to Portal Select
        </button>

      </div>
    </div>
  );
}
