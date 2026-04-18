import { useState } from 'react';

const AUTH_BASE = 'https://racecontrol.bitepointracing.com';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: '#0d0d0f',
    border: '1px solid #222',
    borderRadius: '8px',
    padding: '32px 40px',
    width: '380px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  title: {
    color: '#c8102e',
    fontSize: '18px',
    fontWeight: 800,
    marginBottom: '4px',
  },
  subtitle: {
    color: '#666',
    fontSize: '11px',
    marginBottom: '28px',
  },
  label: {
    color: '#aaa',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    marginBottom: '6px',
    display: 'block',
  },
  input: {
    width: '100%',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
    color: '#eee',
    padding: '10px 12px',
    fontSize: '14px',
    outline: 'none',
    marginBottom: '18px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    background: '#c8102e',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '12px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.5px',
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  error: {
    color: '#ef4444',
    fontSize: '12px',
    marginBottom: '16px',
    padding: '8px 12px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '4px',
  },
  loading: {
    color: '#888',
    fontSize: '12px',
    textAlign: 'center',
    marginBottom: '16px',
  },
};

export function StewardModal({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${AUTH_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Save token and pass to app
      try { localStorage.setItem('bpr-auth-token', data.token); } catch {}
      try { localStorage.setItem('bpr-auth-steward', JSON.stringify(data.steward)); } catch {}

      onLogin({
        token: data.token,
        steward: data.steward,
      });
    } catch (err) {
      setError('Could not reach server: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <form style={styles.modal} onSubmit={handleSubmit}>
        <div style={styles.title}>BPR RACE CONTROL</div>
        <div style={styles.subtitle}>Steward Login</div>

        {error && <div style={styles.error}>{error}</div>}
        {loading && <div style={styles.loading}>Authenticating...</div>}

        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="steward@bitepointracing.com"
          autoFocus
          disabled={loading}
        />

        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          disabled={loading}
        />

        <button
          type="submit"
          style={{
            ...styles.button,
            ...(canSubmit ? {} : styles.buttonDisabled),
          }}
          disabled={!canSubmit}
        >
          {loading ? 'LOGGING IN...' : 'LOGIN'}
        </button>
      </form>
    </div>
  );
}
