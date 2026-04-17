import { useState } from 'react';

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
  select: {
    width: '100%',
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
    color: '#eee',
    padding: '10px 12px',
    fontSize: '14px',
    outline: 'none',
    marginBottom: '28px',
    boxSizing: 'border-box',
    cursor: 'pointer',
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
  roleHint: {
    color: '#555',
    fontSize: '10px',
    marginTop: '-14px',
    marginBottom: '24px',
  },
};

export function StewardModal({ onSubmit }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('MAIN');

  const canSubmit = name.trim().length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) {
      onSubmit({ name: name.trim(), role });
    }
  };

  return (
    <div style={styles.overlay}>
      <form style={styles.modal} onSubmit={handleSubmit}>
        <div style={styles.title}>BPR RACE CONTROL</div>
        <div style={styles.subtitle}>Identify yourself to begin stewarding</div>

        <label style={styles.label}>Your Name</label>
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. John Smith"
          autoFocus
        />

        <label style={styles.label}>Role</label>
        <select
          style={styles.select}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="MAIN">Main Steward</option>
          <option value="SUPPORT">Support Steward</option>
        </select>
        <div style={styles.roleHint}>
          Main steward has primary authority. Support steward assists with review.
        </div>

        <button
          type="submit"
          style={{
            ...styles.button,
            ...(canSubmit ? {} : styles.buttonDisabled),
          }}
          disabled={!canSubmit}
        >
          JOIN SESSION
        </button>
      </form>
    </div>
  );
}
