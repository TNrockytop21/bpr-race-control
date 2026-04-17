import { useState, useCallback } from 'react';
import { wsClient } from '../lib/ws-client';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
    minHeight: 0,
  },
  header: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
  },
  card: {
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
    marginBottom: '6px',
  },
  selectedDrivers: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    minHeight: '28px',
  },
  driverTag: {
    background: 'rgba(139, 92, 246, 0.2)',
    border: '1px solid rgba(139, 92, 246, 0.4)',
    color: '#a78bfa',
    borderRadius: '3px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600,
  },
  emptyTag: {
    color: '#555',
    fontSize: '11px',
    fontStyle: 'italic',
    padding: '4px 0',
  },
  buttonRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  btn: {
    padding: '6px 14px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.1s',
  },
  btnPrimary: {
    background: '#ef4444',
    color: 'white',
  },
  btnSecondary: {
    background: '#222',
    color: '#ccc',
    border: '1px solid #333',
  },
  incidentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    overflow: 'auto',
  },
  incidentEntry: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incidentTime: {
    fontVariantNumeric: 'tabular-nums',
    color: '#888',
    fontSize: '11px',
  },
  incidentDrivers: {
    color: '#a78bfa',
    fontWeight: 600,
    fontSize: '12px',
  },
  incidentStatus: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontWeight: 600,
  },
  reviewBtn: {
    padding: '4px 10px',
    borderRadius: '3px',
    border: 'none',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    background: '#2563eb',
    color: 'white',
  },
};

function formatSessionTime(t) {
  if (t == null) return '--:--';
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const FILTER_OPTIONS = [
  { key: 'off-track', label: 'Off-track (1x)', color: '#888' },
  { key: 'blue-flag', label: 'Blue flag',       color: '#60a5fa' },
  { key: 'protest',   label: 'Driver Report',   color: '#f59e0b' },
  { key: 'manual',    label: 'Manual',           color: '#a78bfa' },
];

export function IncidentPanel({
  drivers,
  selectedDriverIds,
  lastSessionTime,
  incidents,
  incidentFilter,
  onFilterChange,
  onAddIncident,
  onReviewIncident,
  onCancelReview,
  incidentLocks = {},
  currentStewardName = '',
}) {
  const [notes, setNotes] = useState('');

  const selectedNames = [...selectedDriverIds]
    .map((id) => drivers[id]?.name || id)
    .filter(Boolean);

  // Determine each incident's filter category
  function getIncidentCategory(inc) {
    if (inc.incidentType) return inc.incidentType;
    if (inc.detectedBy === 'auto') return inc.delta >= 2 ? 'contact' : 'off-track';
    return 'manual';
  }

  const filteredIncidents = incidents.filter((inc) => {
    const cat = getIncidentCategory(inc);
    return incidentFilter[cat] !== false;
  });

  const hiddenCount = incidents.length - filteredIncidents.length;

  const toggleFilter = useCallback((key) => {
    onFilterChange((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [onFilterChange]);

  const handleFlag = useCallback(() => {
    if (selectedDriverIds.size === 0 || lastSessionTime == null) return;

    const incident = {
      id: `inc-${Date.now()}`,
      sessionTime: lastSessionTime,
      involvedDrivers: [...selectedDriverIds],
      notes: notes.trim() || null,
      status: 'open',
      createdAt: Date.now(),
      incidentType: 'manual',
    };
    onAddIncident(incident);
    setNotes('');
  }, [selectedDriverIds, lastSessionTime, notes, onAddIncident]);

  return (
    <div style={styles.container}>
      {/* New incident entry */}
      <div style={styles.card}>
        <div style={styles.label}>Flag Incident</div>
        <div style={styles.selectedDrivers}>
          {selectedNames.length > 0 ? (
            selectedNames.map((name) => (
              <span key={name} style={styles.driverTag}>{name}</span>
            ))
          ) : (
            <span style={styles.emptyTag}>Select drivers from the list</span>
          )}
        </div>
        <div style={{ marginTop: '8px' }}>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFlag()}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '3px',
              color: '#ccc',
              fontSize: '12px',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ ...styles.buttonRow, marginTop: '8px' }}>
          <button
            style={{
              ...styles.btn,
              ...styles.btnPrimary,
              opacity: selectedDriverIds.size === 0 ? 0.4 : 1,
            }}
            disabled={selectedDriverIds.size === 0}
            onClick={handleFlag}
          >
            Flag @ {formatSessionTime(lastSessionTime)}
          </button>
        </div>
      </div>

      {/* Incident log */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={styles.label}>
            Incidents ({filteredIncidents.length})
            {hiddenCount > 0 && (
              <span style={{ color: '#555', fontWeight: 400 }}> · {hiddenCount} hidden</span>
            )}
          </div>
        </div>

        {/* Filter toggles */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map((opt) => {
            const active = incidentFilter[opt.key] !== false;
            return (
              <button
                key={opt.key}
                onClick={() => toggleFilter(opt.key)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '3px',
                  border: `1px solid ${active ? opt.color + '55' : '#222'}`,
                  background: active ? opt.color + '18' : 'transparent',
                  color: active ? opt.color : '#555',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {filteredIncidents.length === 0 ? (
          <div style={{ color: '#555', fontSize: '12px', padding: '8px 0' }}>
            {incidents.length === 0 ? 'No incidents flagged yet' : 'All incidents filtered out'}
          </div>
        ) : (
          <div style={styles.incidentList}>
            {filteredIncidents.map((inc) => {
              const cat = getIncidentCategory(inc);
              const catColor = FILTER_OPTIONS.find((o) => o.key === cat)?.color || '#888';
              return (
              <div key={inc.id} style={{
                ...styles.incidentEntry,
                borderLeft: `3px solid ${catColor}`,
              }}>
                <div>
                  <div style={styles.incidentDrivers}>
                    {(inc.detectedBy === 'auto' || inc.detectedBy === 'driver') && (
                      <span style={{
                        fontSize: '9px',
                        color: catColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginRight: '6px',
                        fontWeight: 700,
                      }}>{cat === 'blue-flag' ? 'BLUE FLAG' : cat === 'contact' ? 'CONTACT' : cat === 'protest' ? 'PROTEST' : '1x'}</span>
                    )}
                    {inc.involvedDrivers
                      .map((id) => drivers[id]?.name || id)
                      .join(' vs ')}
                  </div>
                  <div style={styles.incidentTime}>
                    @ {formatSessionTime(inc.sessionTime)}
                    {inc.notes && <span style={{ color: '#666' }}> — {inc.notes}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {/* Lock status badge */}
                  {incidentLocks[inc.id] && (
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '3px',
                      background: incidentLocks[inc.id].stewardName === currentStewardName
                        ? 'rgba(37, 99, 235, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                      color: incidentLocks[inc.id].stewardName === currentStewardName
                        ? '#60a5fa'
                        : '#f59e0b',
                    }}>
                      {incidentLocks[inc.id].stewardName === currentStewardName
                        ? 'You are reviewing'
                        : `${incidentLocks[inc.id].stewardName}`}
                    </span>
                  )}
                  <span
                    style={{
                      ...styles.incidentStatus,
                      background:
                        inc.status === 'open'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : inc.status === 'under_review'
                            ? 'rgba(37, 99, 235, 0.15)'
                            : 'rgba(34, 197, 94, 0.15)',
                      color:
                        inc.status === 'open'
                          ? '#f59e0b'
                          : inc.status === 'under_review'
                            ? '#60a5fa'
                            : '#22c55e',
                    }}
                  >
                    {inc.status.replace('_', ' ')}
                  </span>
                  {inc.status !== 'resolved' && (
                    <button
                      style={{
                        ...styles.reviewBtn,
                        ...(incidentLocks[inc.id] && incidentLocks[inc.id].stewardName !== currentStewardName
                          ? { opacity: 0.3, cursor: 'not-allowed' }
                          : {}),
                      }}
                      onClick={() => {
                        if (incidentLocks[inc.id] && incidentLocks[inc.id].stewardName !== currentStewardName) return;
                        onReviewIncident(inc);
                      }}
                      disabled={incidentLocks[inc.id] && incidentLocks[inc.id].stewardName !== currentStewardName}
                    >
                      Review
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
