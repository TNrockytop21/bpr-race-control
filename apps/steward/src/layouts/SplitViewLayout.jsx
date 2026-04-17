/**
 * Layout A: Split View — Monitor + Review side by side
 * Left column: standings + RC messages + incident feed (always visible)
 * Right column: telemetry review + penalty panel
 */
import { IncidentPanel } from '../components/IncidentPanel';
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
  left: {
    width: '380px',
    flexShrink: 0,
    borderRight: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sectionLabel: {
    color: '#c8102e',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    padding: '6px 10px',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  standingsWrap: {
    maxHeight: '220px',
    overflow: 'auto',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  rcWrap: {
    flexShrink: 0,
    borderBottom: '1px solid #1a1a1a',
    padding: '4px',
  },
  incidentWrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  right: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  reviewHeader: {
    padding: '6px 10px',
    borderBottom: '1px solid #1a1a1a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  reviewTitle: {
    color: '#c8102e',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  cancelBtn: {
    color: '#555',
    fontSize: '9px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: '2px 6px',
  },
  telemetryArea: {
    flex: 1,
    padding: '8px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyReview: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#333',
    fontSize: '13px',
  },
  penaltyWrap: {
    flexShrink: 0,
  },
  replayWrap: {
    flexShrink: 0,
  },
};

export function SplitViewLayout({
  drivers, standings, incidents, incidentFilter, incidentData,
  onFilterChange, onAddIncident, onReviewIncident, onCancelReview,
  reviewingIncident, incidentLocks, currentStewardName,
  penalties, onResolveIncident, lastSessionTime,
  selectedDriverIds, driverDropdownOpen, onToggleDriver, onToggleDropdown,
}) {
  return (
    <>
      <div style={styles.container}>
        {/* ── LEFT: RACE MONITOR ─────────────────────── */}
        <div style={styles.left}>
          <div style={styles.sectionLabel}>RACE MONITOR</div>

          <div style={styles.standingsWrap}>
            <LiveStandings
              standings={standings}
              incidents={incidents}
              onDriverClick={(carIdx) => window.irsdk?.replayCamera(carIdx, 'chase')}
              compact
            />
          </div>

          <div style={styles.rcWrap}>
            <RaceControlMessages drivers={drivers} compact />
          </div>

          <div style={styles.incidentWrap}>
            <IncidentPanel
              drivers={drivers}
              selectedDriverIds={selectedDriverIds}
              lastSessionTime={lastSessionTime}
              incidents={incidents}
              incidentFilter={incidentFilter}
              onFilterChange={onFilterChange}
              onAddIncident={onAddIncident}
              onReviewIncident={onReviewIncident}
              onCancelReview={onCancelReview}
              incidentLocks={incidentLocks}
              currentStewardName={currentStewardName}
            />
          </div>
        </div>

        {/* ── RIGHT: REVIEW WORKSPACE ────────────────── */}
        <div style={styles.right}>
          {reviewingIncident ? (
            <>
              <div style={styles.reviewHeader}>
                <span style={styles.reviewTitle}>
                  REVIEW — {reviewingIncident.involvedDrivers
                    .map((id) => drivers[id]?.name || id).join(' vs ')} @ {
                    Math.floor((reviewingIncident.sessionTime || 0) / 60)}:{
                    String(Math.floor((reviewingIncident.sessionTime || 0) % 60)).padStart(2, '0')}
                </span>
                <button style={styles.cancelBtn} onClick={onCancelReview}>✕ Cancel</button>
              </div>
              <div style={styles.telemetryArea}>
                <TelemetryOverlay incidentData={incidentData} drivers={drivers} />
              </div>
              <div style={styles.penaltyWrap}>
                <PenaltyPanel
                  incident={reviewingIncident}
                  drivers={drivers}
                  onResolve={onResolveIncident}
                  onCancel={onCancelReview}
                />
              </div>
            </>
          ) : (
            <div style={styles.emptyReview}>
              Select an incident to review
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
