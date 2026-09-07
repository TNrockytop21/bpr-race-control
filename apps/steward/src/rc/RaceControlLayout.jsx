/**
 * Race Control layout — the stewarding desk.
 *   left   live field (every car, from an admin's sim)
 *   centre incident queue
 *   right  the selected incident: replay, ownership, decision; view sync; replay controls
 */
import { FieldTable } from './FieldTable';
import { IncidentQueue } from './IncidentQueue';
import { DecisionPanel } from './DecisionPanel';
import { ViewSync } from './ViewSync';
import { ReplayControls } from '../components/ReplayControls';

const S = {
  container: { display: 'flex', flex: 1, overflow: 'hidden' },
  left: { width: 330, flexShrink: 0, borderRight: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  centre: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid #1a1a1a' },
  right: { width: 470, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  bottom: { padding: 8, borderTop: '1px solid #1a1a1a', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  banner: { padding: '6px 10px', fontSize: 11, background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', flexShrink: 0 },
};

export function RaceControlLayout({ rc, drivers }) {
  const noFeed = !rc.source?.active;
  const track = rc.session?.weekend?.TrackDisplayName || rc.session?.weekend?.TrackName;
  const sess = rc.session?.sessions?.find((s) => Number(s.SessionNum) === Number(rc.field?.sessionNum));
  return (
    <div style={S.container}>
      <div style={S.left}><FieldTable rc={rc} /></div>
      <div style={S.centre}>
        {noFeed && <div style={S.banner}>No live feed. Open iRacing on a steward PC running this app (as a session admin) — incidents appear here automatically.</div>}
        {!noFeed && <div style={{ ...S.banner, background: 'transparent', borderBottom: '1px solid #1a1a1a', color: '#888' }}>{track || 'session'} · {sess?.SessionName || `session ${rc.field?.sessionNum ?? '?'}`} · {rc.field ? `${Math.floor((rc.field.sessionTime || 0) / 60)} min` : ''} · feed: {rc.source?.name}</div>}
        <IncidentQueue rc={rc} />
      </div>
      <div style={S.right}>
        <DecisionPanel rc={rc} />
        <div style={S.bottom}>
          <ViewSync rc={rc} />
          <ReplayControls irsdkConnected={rc.feed.connected} drivers={drivers} />
        </div>
      </div>
    </div>
  );
}
