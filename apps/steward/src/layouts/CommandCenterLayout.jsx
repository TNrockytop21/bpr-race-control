/**
 * Layout B: Command Center — Three columns like a real race control room
 * Left: incident queue + RC messages
 * Center: live standings + track map
 * Right: telemetry review + penalty panel
 */
import { IncidentPanel } from '../components/IncidentPanel';
import { TelemetryOverlay } from '../components/TelemetryOverlay';
import { PenaltyPanel } from '../components/PenaltyPanel';
import { ReplayControls } from '../components/ReplayControls';
import { RaceControlMessages } from '../components/RaceControlMessages';
import { LiveStandings } from '../components/LiveStandings';
import { TrackMap } from '../components/TrackMap';

const styles = {
  container: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  left: {
    width: '260px',
    flexShrink: 0,
    borderRight: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    borderRight: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  right: {
    width: '400px',
    flexShrink: 0,
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
  standingsWrap: {
    flex: 1,
    overflow: 'auto',
    padding: '0',
  },
  trackMapWrap: {
    height: '140px',
    flexShrink: 0,
    borderTop: '1px solid #1a1a1a',
    padding: '4px',
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
    padding: '6px',
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

export function CommandCenterLayout({
  drivers, standings, sessionInfo, trackShape,
  incidents, incidentFilter, incidentData,
  onFilterChange, onAddIncident, onReviewIncident, onCancelReview,
  reviewingIncident, incidentLocks, currentStewardName,
  penalties, onResolveIncident, onClearPenalty, onSendIRacingChat, onThrowCaution, lastSessionTime,
  selectedDriverIds,
}) {
  return (
    <>
      <div style={styles.container}>
        {/* ── LEFT: INCIDENT QUEUE ───────────────────── */}
        <div style={styles.left}>
          <div style={styles.sectionLabel}>INCIDENT QUEUE</div>

          <div style={styles.rcWrap}>
            <RaceControlMessages drivers={drivers} onSendIRacingChat={onSendIRacingChat} onThrowCaution={onThrowCaution} compact />
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

        {/* ── CENTER: LIVE RACE ──────────────────────── */}
        <div style={styles.center}>
          <div style={styles.sectionLabel}>LIVE RACE</div>

          <div style={styles.standingsWrap}>
            <LiveStandings
              standings={standings}
              incidents={incidents}
              onDriverClick={(carIdx) => window.irsdk?.replayCamera(carIdx, 'chase')}
            />
          </div>

          <div style={styles.trackMapWrap}>
            <TrackMap trackShape={trackShape} drivers={drivers} />
          </div>
        </div>

        {/* ── RIGHT: REVIEW WORKSPACE ────────────────── */}
        <div style={styles.right}>
          {reviewingIncident ? (
            <>
              <div style={styles.reviewHeader}>
                <span style={styles.reviewTitle}>
                  REVIEW — {reviewingIncident.involvedDrivers
                    .map((id) => drivers[id]?.name || id).join(' vs ')}
                </span>
                <button style={styles.cancelBtn} onClick={onCancelReview}>✕ Close</button>
              </div>
              <div style={{ padding: '4px 10px', borderBottom: '1px solid #111', background: '#0a0a0c', flexShrink: 0 }}>
                <span style={{ color: '#eee', fontSize: '10px', fontWeight: 600 }}>
                  @ {Math.floor((reviewingIncident.sessionTime || 0) / 60)}:{
                    String(Math.floor((reviewingIncident.sessionTime || 0) % 60)).padStart(2, '0')}
                </span>
                {reviewingIncident.notes && (
                  <span style={{ color: '#555', fontSize: '9px', marginLeft: '8px' }}> — {reviewingIncident.notes}</span>
                )}
              </div>
              <div style={styles.telemetryArea}>
                <TelemetryOverlay incidentData={incidentData} drivers={drivers} />
              </div>
              <div style={styles.penaltyWrap}>
                <PenaltyPanel
                  incident={reviewingIncident}
                  drivers={drivers}
                  onResolve={onResolveIncident}
                  onClearPenalty={onClearPenalty}
                  onCancel={onCancelReview}
                />
              </div>
            </>
          ) : (
            <>
              <div style={styles.sectionLabel}>REVIEW</div>
              <div style={styles.emptyReview}>
                Select an incident to review
              </div>
            </>
          )}
        </div>
      </div>

      <div style={styles.replayWrap}>
        <ReplayControls irsdkConnected={false} drivers={drivers} />
      </div>
    </>
  );
}
