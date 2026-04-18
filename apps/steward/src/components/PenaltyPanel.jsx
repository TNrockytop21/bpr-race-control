import { useState, useCallback } from 'react';

const PENALTY_TYPES = [
  { id: 'no-action',      label: 'No Action',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  { id: 'race-incident',  label: 'Race Incident',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  { id: 'warning',        label: 'Warning',         color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { id: 'drive-through',  label: 'Drive-Through',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { id: 'stop-go',        label: 'Stop & Go',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { id: 'time-penalty',   label: 'Time Penalty',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { id: 'dsq',            label: 'DSQ',             color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
];

const styles = {
  container: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    padding: '14px',
  },
  label: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  involvedDrivers: {
    fontSize: '12px',
    color: '#a78bfa',
    fontWeight: 600,
    marginBottom: '10px',
  },
  buttonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '6px',
    marginBottom: '10px',
  },
  penaltyBtn: {
    padding: '8px 10px',
    borderRadius: '4px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.1s',
    textAlign: 'center',
  },
  timeInput: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  },
  notesInput: {
    width: '100%',
    padding: '6px 10px',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '3px',
    color: '#ccc',
    fontSize: '12px',
    outline: 'none',
    resize: 'vertical',
    minHeight: '50px',
    fontFamily: 'inherit',
  },
  confirmRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '10px',
  },
  btn: {
    padding: '6px 16px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export function PenaltyPanel({ incident, drivers, onResolve, onCancel, onClearPenalty }) {
  const [selectedType, setSelectedType] = useState(null);
  const [timeSeconds, setTimeSeconds] = useState('');
  const [notes, setNotes] = useState('');

  const involvedNames = (incident?.involvedDrivers || [])
    .map((id) => drivers[id]?.name || id)
    .join(' vs ');

  const handleConfirm = useCallback(() => {
    if (!selectedType || !incident) return;
    const penalty = {
      incidentId: incident.id,
      type: selectedType,
      timeSeconds: selectedType === 'time-penalty' ? parseInt(timeSeconds, 10) || 0 : null,
      notes: notes.trim() || null,
      issuedAt: Date.now(),
    };
    onResolve(incident.id, penalty);
  }, [incident, selectedType, timeSeconds, notes, onResolve]);

  if (!incident) return null;

  return (
    <div style={styles.container}>
      <div style={styles.label}>Issue Penalty</div>
      <div style={styles.involvedDrivers}>{involvedNames}</div>

      <div style={styles.buttonGrid}>
        {PENALTY_TYPES.map((pt) => (
          <button
            key={pt.id}
            style={{
              ...styles.penaltyBtn,
              background: selectedType === pt.id ? pt.bg : 'transparent',
              borderColor: selectedType === pt.id ? pt.color : '#2a2a2a',
              color: selectedType === pt.id ? pt.color : '#888',
            }}
            onClick={() => setSelectedType(pt.id)}
          >
            {pt.label}
          </button>
        ))}
      </div>

      {selectedType === 'time-penalty' && (
        <div style={styles.timeInput}>
          <span style={{ fontSize: '11px', color: '#888' }}>Seconds:</span>
          <input
            type="number"
            value={timeSeconds}
            onChange={(e) => setTimeSeconds(e.target.value)}
            placeholder="e.g. 10"
            style={{
              width: '70px',
              padding: '4px 8px',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '3px',
              color: '#ccc',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>
      )}

      <textarea
        placeholder="Steward notes..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={styles.notesInput}
      />

      <div style={styles.confirmRow}>
        <button
          style={{ ...styles.btn, background: '#222', color: '#888' }}
          onClick={onCancel}
        >
          Cancel
        </button>
        {onClearPenalty && (
          <button
            style={{ ...styles.btn, background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
            onClick={() => {
              if (confirm('Clear all in-game penalties for involved drivers?')) {
                for (const driverId of incident.involvedDrivers) {
                  onClearPenalty(driverId);
                }
              }
            }}
          >
            Clear In-Game Penalty
          </button>
        )}
        <button
          style={{
            ...styles.btn,
            background: selectedType ? '#ef4444' : '#333',
            color: selectedType ? 'white' : '#666',
            opacity: selectedType ? 1 : 0.5,
          }}
          disabled={!selectedType}
          onClick={handleConfirm}
        >
          Confirm Decision
        </button>
      </div>
    </div>
  );
}
