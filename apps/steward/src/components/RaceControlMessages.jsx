import { useState, useCallback } from 'react';
import { wsClient } from '../lib/ws-client';

const TEMPLATES = [
  { id: 'yellow-flag',    label: 'Yellow Flag',        message: 'LOCAL YELLOW — CAUTION AHEAD', color: '#f59e0b' },
  { id: 'track-limits',   label: 'Track Limits',       message: 'TRACK LIMITS WARNING — REPEAT OFFENDERS WILL BE PENALIZED', color: '#f59e0b' },
];

const styles = {
  container: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    padding: '12px',
  },
  label: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  templateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
    gap: '4px',
    marginBottom: '10px',
  },
  templateBtn: {
    padding: '6px 8px',
    borderRadius: '3px',
    border: '1px solid #222',
    background: 'transparent',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'background 0.1s',
  },
  customRow: {
    display: 'flex',
    gap: '6px',
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '3px',
    color: '#ccc',
    fontSize: '12px',
    outline: 'none',
  },
  sendBtn: {
    padding: '6px 14px',
    borderRadius: '3px',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  sentFeedback: {
    fontSize: '10px',
    color: '#22c55e',
    marginTop: '6px',
    textAlign: 'center',
  },
  targetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  targetLabel: {
    fontSize: '10px',
    color: '#666',
  },
  targetToggle: {
    padding: '3px 8px',
    borderRadius: '3px',
    border: '1px solid #222',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export function RaceControlMessages({ drivers, onSendIRacingChat, onThrowCaution, compact }) {
  const [customMessage, setCustomMessage] = useState('');
  const [sentMessage, setSentMessage] = useState(null);
  const [sendToAll, setSendToAll] = useState(true);
  const [targetDriverId, setTargetDriverId] = useState('');
  const [pendingMessage, setPendingMessage] = useState(null);

  const sendMessage = useCallback((message) => {
    const payload = {
      message,
      target: sendToAll ? 'all' : targetDriverId || 'all',
      timestamp: Date.now(),
    };
    wsClient.send('server:message', payload);

    // Also send to iRacing's in-game chat so ALL drivers see it
    if (sendToAll && onSendIRacingChat) {
      onSendIRacingChat('[RC] ' + message);
    }

    setSentMessage(message);
    setPendingMessage(null);
    setTimeout(() => setSentMessage(null), 3000);
  }, [sendToAll, targetDriverId, onSendIRacingChat]);

  const handleTemplate = useCallback((template) => {
    setPendingMessage(template);
  }, []);

  const confirmSend = useCallback(() => {
    if (!pendingMessage) return;
    sendMessage(pendingMessage.message);
  }, [pendingMessage, sendMessage]);

  const cancelSend = useCallback(() => {
    setPendingMessage(null);
  }, []);

  const handleCustomSend = useCallback(() => {
    if (!customMessage.trim()) return;
    const msg = customMessage.trim().toUpperCase();
    setPendingMessage({ label: 'Custom', message: msg, color: '#ccc' });
    setCustomMessage('');
  }, [customMessage]);

  const driverList = Object.values(drivers || {}).filter((d) => d.connected);

  return (
    <div style={styles.container}>
      <div style={styles.label}>Race Control Messages</div>

      {/* Target selector */}
      <div style={styles.targetRow}>
        <span style={styles.targetLabel}>Send to:</span>
        <button
          style={{
            ...styles.targetToggle,
            background: sendToAll ? 'rgba(34,197,94,0.12)' : 'transparent',
            borderColor: sendToAll ? '#22c55e55' : '#222',
            color: sendToAll ? '#22c55e' : '#888',
          }}
          onClick={() => setSendToAll(true)}
        >
          All Drivers
        </button>
        <button
          style={{
            ...styles.targetToggle,
            background: !sendToAll ? 'rgba(139,92,246,0.12)' : 'transparent',
            borderColor: !sendToAll ? '#a78bfa55' : '#222',
            color: !sendToAll ? '#a78bfa' : '#888',
          }}
          onClick={() => setSendToAll(false)}
        >
          Single Driver
        </button>
        {!sendToAll && (
          <select
            value={targetDriverId}
            onChange={(e) => setTargetDriverId(e.target.value)}
            style={{
              padding: '3px 6px',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '3px',
              color: '#ccc',
              fontSize: '11px',
              outline: 'none',
            }}
          >
            <option value="">Select driver...</option>
            {driverList.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Template buttons */}
      <div style={styles.templateGrid}>
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            style={{
              ...styles.templateBtn,
              color: t.color,
              borderColor: `${t.color}33`,
            }}
            onClick={() => handleTemplate(t)}
            title={t.message}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Admin actions */}
      {onThrowCaution && (
        <div style={{ marginBottom: '8px' }}>
          <button
            style={{
              padding: '6px 12px',
              borderRadius: '3px',
              border: '1px solid rgba(245,158,11,0.4)',
              background: 'rgba(245,158,11,0.1)',
              color: '#f59e0b',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}
            onClick={() => {
              if (confirm('Throw caution flag? This will send !yellow to iRacing.')) {
                onThrowCaution();
              }
            }}
          >
            THROW CAUTION
          </button>
        </div>
      )}

      {/* Custom message */}
      <div style={styles.customRow}>
        <input
          type="text"
          placeholder="Custom message..."
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCustomSend()}
          style={styles.input}
        />
        <button
          style={{ ...styles.sendBtn, opacity: customMessage.trim() ? 1 : 0.4 }}
          disabled={!customMessage.trim()}
          onClick={handleCustomSend}
        >
          Send
        </button>
      </div>

      {/* Confirmation dialog */}
      {pendingMessage && (
        <div style={{
          marginTop: '8px',
          padding: '10px',
          background: '#1a1a1a',
          border: `1px solid ${pendingMessage.color || '#f59e0b'}44`,
          borderRadius: '4px',
        }}>
          <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            Confirm broadcast
          </div>
          <div style={{ fontSize: '13px', color: pendingMessage.color || '#ccc', fontWeight: 700, marginBottom: '4px' }}>
            {pendingMessage.message}
          </div>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>
            → {sendToAll ? 'ALL DRIVERS' : (drivers[targetDriverId]?.name || targetDriverId || 'ALL DRIVERS')}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={confirmSend}
              style={{
                padding: '5px 16px',
                borderRadius: '3px',
                border: 'none',
                background: '#ef4444',
                color: 'white',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Confirm Send
            </button>
            <button
              onClick={cancelSend}
              style={{
                padding: '5px 16px',
                borderRadius: '3px',
                border: '1px solid #333',
                background: 'transparent',
                color: '#888',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sentMessage && (
        <div style={styles.sentFeedback}>Sent: {sentMessage}</div>
      )}
    </div>
  );
}
