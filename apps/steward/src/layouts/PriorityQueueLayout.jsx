/**
 * Layout C: Priority Queue — Incident-first with inline telemetry
 * Main area: large incident cards, click to expand with telemetry + penalties inline
 * Right sidebar: collapsible standings
 */
import { useState } from 'react';
import { TelemetryOverlay } from '../components/TelemetryOverlay';
import { PenaltyPanel } from '../components/PenaltyPanel';
import { ReplayControls } from '../components/ReplayControls';
import { RaceControlMessages } from '../components/RaceControlMessages';
import { LiveStandings } from '../components/LiveStandings';

const styles = {
  container: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: '10px 14px',
  },
  queueHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  queueTitle: {
    color: '#c8102e',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1px',
  },
  queueCount: {
    color: '#555',
    fontSize: '10px',
  },
  rcRow: {
    marginBottom: '10px',
    display: 'flex',
    gap: '4px',
  },
  // Incident card styles
  card: {
    background: '#0d0d0f',
    border: '1px solid #222',
    borderRadius: '5px',
    marginBottom: '8px',
    overflow: 'hidden',
    transition: 'border-color 0.2s',
  },
  cardActive: {
    borderColor: '#c8102e',
  },
  cardResolved: {
    opacity: 0.5,
  },
  cardHeader: {
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  cardType: {
    fontWeight: 700,
    fontSize: '11px',
    marginRight: '8px',
  },
  cardDrivers: {
    color: '#eee',
    fontSize: '12px',
  },
  cardMeta: {
    color: '#555',
    fontSize: '10px',
    marginLeft: '10px',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  reviewBtn: {
    background: '#c8102e',
    color: '#fff',
    border: 'none',
    padding: '4px 14px',
    fontSize: '10px',
    fontWeight: 700,
    borderRadius: '3px',
    cursor: 'pointer',
  },
  reviewBtnDisabled: {
    background: '#1a1a1a',
    color: '#555',
    cursor: 'not-allowed',
  },
  statusBadge: {
    fontSize: '8px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '3px',
  },
  lockBadge: {
    fontSize: '8px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'rgba(245,158,11,0.15)',
    color: '#f59e0b',
  },
  expandedBody: {
    borderTop: '1px solid #1a1a1a',
  },
  telemetryArea: {
    height: '200px',
    padding: '6px',
  },
  penaltyArea: {
    borderTop: '1px solid #1a1a1a',
  },
  // Resolved section
  resolvedLabel: {
    color: '#444',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    margin: '16px 0 6px',
    paddingTop: '8px',
    borderTop: '1px solid #1a1a1a',
  },
  // Right sidebar
  sidebar: {
    width: '240px',
    flexShrink: 0,
    borderLeft: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarCollapsed: {
    width: '36px',
  },
  sidebarToggle: {
    padding: '6px 10px',
    borderBottom: '1px solid #1a1a1a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    cursor: 'pointer',
  },
  sidebarLabel: {
    color: '#888',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
  },
  sidebarBody: {
    flex: 1,
    overflow: 'auto',
  },
  replayWrap: {
    flexShrink: 0,
  },
};

const TYPE_COLORS = {
  'off-track': '#888',
  'blue-flag': '#60a5fa',
  protest: '#f59e0b',
  manual: '#a78bfa',
};

function getIncidentCategory(inc) {
  if (inc.incidentType) return inc.incidentType;
  if (inc.detectedBy === 'auto') return 'off-track';
  return 'manual';
}

function formatTime(t) {
  if (!t && t !== 0) return '--:--';
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

function getTypeLabel(cat) {
  switch (cat) {
    case 'off-track': return '1x';
    case 'blue-flag': return 'BLUE FLAG';
    case 'protest': return 'PROTEST';
    case 'manual': return 'MANUAL';
    default: return cat?.toUpperCase() || 'INC';
  }
}

export function PriorityQueueLayout({
  drivers, standings, incidents, incidentFilter, incidentData,
  onFilterChange, onAddIncident, onReviewIncident, onCancelReview,
  reviewingIncident, incidentLocks, currentStewardName,
  penalties, onResolveIncident, lastSessionTime,
  selectedDriverIds,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const openIncidents = incidents.filter((inc) => inc.status !== 'resolved');
  const resolvedIncidents = incidents.filter((inc) => inc.status === 'resolved');

  return (
    <>
      <div style={styles.container}>
        {/* ── MAIN: INCIDENT QUEUE ───────────────────── */}
        <div style={styles.main}>
          <div style={styles.queueHeader}>
            <span style={styles.queueTitle}>
              PENDING REVIEW ({openIncidents.length})
            </span>
            <span style={styles.queueCount}>{incidents.length} total</span>
          </div>

          <div style={styles.rcRow}>
            <RaceControlMessages drivers={drivers} compact />
          </div>

          {openIncidents.length === 0 && (
            <div style={{ color: '#333', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
              No incidents pending review
            </div>
          )}

          {openIncidents.map((inc) => {
            const cat = getIncidentCategory(inc);
            const color = TYPE_COLORS[cat] || '#888';
            const isReviewing = reviewingIncident?.id === inc.id;
            const lock = incidentLocks[inc.id];
            const lockedByOther = lock && lock.stewardName !== currentStewardName;

            return (
              <div
                key={inc.id}
                style={{
                  ...styles.card,
                  ...(isReviewing ? styles.cardActive : {}),
                  borderLeftWidth: '3px',
                  borderLeftColor: color,
                }}
              >
                {/* Card header */}
                <div style={styles.cardHeader}>
                  <div>
                    <span style={{ ...styles.cardType, color }}>{getTypeLabel(cat)}</span>
                    <span style={styles.cardDrivers}>
                      {inc.involvedDrivers.map((id) => drivers[id]?.name || id).join(' vs ')}
                    </span>
                    <span style={styles.cardMeta}>
                      @ {formatTime(inc.sessionTime)}
                      {inc.notes && ` — ${inc.notes}`}
                    </span>
                  </div>
                  <div style={styles.cardActions}>
                    {lock && (
                      <span style={{
                        ...styles.lockBadge,
                        ...(lock.stewardName === currentStewardName
                          ? { background: 'rgba(37,99,235,0.15)', color: '#60a5fa' }
                          : {}),
                      }}>
                        {lock.stewardName === currentStewardName ? 'You' : lock.stewardName}
                      </span>
                    )}
                    {!isReviewing && (
                      <button
                        style={{
                          ...styles.reviewBtn,
                          ...(lockedByOther ? styles.reviewBtnDisabled : {}),
                        }}
                        onClick={() => !lockedByOther && onReviewIncident(inc)}
                        disabled={lockedByOther}
                      >
                        Review
                      </button>
                    )}
                    {isReviewing && (
                      <button
                        style={{ ...styles.reviewBtn, background: '#333' }}
                        onClick={onCancelReview}
                      >
                        ✕ Close
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded telemetry + penalty (inline) */}
                {isReviewing && (
                  <div style={styles.expandedBody}>
                    <div style={styles.telemetryArea}>
                      <TelemetryOverlay incidentData={incidentData} drivers={drivers} />
                    </div>
                    <div style={styles.penaltyArea}>
                      <PenaltyPanel
                        incident={reviewingIncident}
                        drivers={drivers}
                        onResolve={onResolveIncident}
                        onCancel={onCancelReview}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Resolved section */}
          {resolvedIncidents.length > 0 && (
            <>
              <div style={styles.resolvedLabel}>RESOLVED ({resolvedIncidents.length})</div>
              {resolvedIncidents.map((inc) => {
                const cat = getIncidentCategory(inc);
                const color = TYPE_COLORS[cat] || '#888';
                return (
                  <div
                    key={inc.id}
                    style={{ ...styles.card, ...styles.cardResolved, borderLeftWidth: '3px', borderLeftColor: '#22c55e' }}
                  >
                    <div style={styles.cardHeader}>
                      <div>
                        <span style={{ ...styles.cardType, color: '#22c55e' }}>{getTypeLabel(cat)}</span>
                        <span style={{ ...styles.cardDrivers, color: '#888' }}>
                          {inc.involvedDrivers.map((id) => drivers[id]?.name || id).join(' vs ')}
                        </span>
                        {inc.penalty && (
                          <span style={{ ...styles.cardMeta, color: '#22c55e' }}>
                            {' — '}{inc.penalty.type?.replace('-', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* ── RIGHT: STANDINGS SIDEBAR ────────────────── */}
        <div style={{ ...styles.sidebar, ...(sidebarOpen ? {} : styles.sidebarCollapsed) }}>
          <div style={styles.sidebarToggle} onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen && <span style={styles.sidebarLabel}>STANDINGS</span>}
            <span style={{ color: '#555', fontSize: '11px' }}>{sidebarOpen ? '▶' : '◀'}</span>
          </div>
          {sidebarOpen && (
            <div style={styles.sidebarBody}>
              <LiveStandings
                standings={standings}
                incidents={incidents}
                onDriverClick={(carIdx) => window.irsdk?.replayCamera(carIdx, 'chase')}
                compact
              />
            </div>
          )}
        </div>
      </div>

      <div style={styles.replayWrap}>
        <ReplayControls irsdkConnected={false} drivers={drivers} />
      </div>
    </>
  );
}
