import { useMemo } from 'react';
import { useSession } from '../../context/SessionContext';

function formatLapTime(t) {
  if (t == null || t <= 0) return '--:--.---';
  const mins = Math.floor(t / 60);
  const secs = (t % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
}

function formatInterval(val) {
  if (val == null || val === 0) return '';
  return `+${val.toFixed(1)}`;
}

const styles = {
  container: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    height: '100%',
  },
  header: {
    padding: '8px 12px',
    borderBottom: '1px solid #1a1a1a',
    fontSize: '9px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    fontWeight: 600,
    flexShrink: 0,
  },
  tableWrap: {
    flex: 1,
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
  },
  th: {
    position: 'sticky',
    top: 0,
    background: '#0d0d0f',
    textAlign: 'left',
    padding: '5px 8px',
    color: '#555',
    fontSize: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #1a1a1a',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '4px 8px',
    borderBottom: '1px solid #0a0a0a',
    whiteSpace: 'nowrap',
  },
};

export function BroadcastStandings() {
  const { standings } = useSession();

  const { overallBest, bestS1, bestS2, bestS3 } = useMemo(() => {
    let ob = null, s1 = null, s2 = null, s3 = null;
    for (const s of standings || []) {
      if (s.bestLap && (ob === null || s.bestLap < ob)) ob = s.bestLap;
      if (s.s1 > 0 && (s1 === null || s.s1 < s1)) s1 = s.s1;
      if (s.s2 > 0 && (s2 === null || s.s2 < s2)) s2 = s.s2;
      if (s.s3 > 0 && (s3 === null || s.s3 < s3)) s3 = s.s3;
    }
    return { overallBest: ob, bestS1: s1, bestS2: s2, bestS3: s3 };
  }, [standings]);

  if (!standings || standings.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>Live Standings</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: '12px' }}>
          Waiting for standings...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Live Standings — {standings.length} cars</div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, textAlign: 'center', width: '28px' }}>P</th>
              <th style={{ ...styles.th, textAlign: 'center', width: '32px' }}>#</th>
              <th style={{ ...styles.th, textAlign: 'center', width: '36px' }}>Class</th>
              <th style={styles.th}>Driver</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Laps</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Int</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Gap</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Best</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Last</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>S1</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>S2</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>S3</th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Pit</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const isBest = s.bestLap && s.bestLap === overallBest;
              const isPB = s.lastLap && s.bestLap && s.lastLap === s.bestLap;
              return (
                <tr key={s.carIdx != null ? `car-${s.carIdx}` : `${s.carNum}-${s.name}`} style={{
                  background: s.onPitRoad ? 'rgba(245,158,11,0.04)' : 'transparent',
                  transition: 'background-color 0.3s ease',
                }}>
                  <td style={{ ...styles.td, textAlign: 'center', fontWeight: 700, color: s.pos === 1 ? '#f59e0b' : s.pos <= 3 ? '#ccc' : '#666' }}>{s.pos}</td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#555', fontWeight: 600 }}>{s.carNum}</td>
                  <td style={{ ...styles.td, textAlign: 'center', fontSize: '9px', fontWeight: 700, color: s.carClass === 'LMP2' ? '#ef4444' : '#f59e0b' }}>{s.carClass || 'GT3'}</td>
                  <td style={{ ...styles.td, fontWeight: 600, color: '#ccc', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</td>
                  <td style={{ ...styles.td, textAlign: 'center', color: '#666' }}>{s.lapsCompleted}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: s.pos === 1 ? '#444' : '#ccc', fontSize: '11px' }}>{s.pos === 1 ? '' : formatInterval(s.interval)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: '#666', fontSize: '11px' }}>{s.pos === 1 ? '' : formatInterval(s.gap)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: isBest ? '#a78bfa' : '#ccc', fontWeight: isBest ? 700 : 400 }}>{formatLapTime(s.bestLap)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: isPB ? '#22c55e' : '#888' }}>{formatLapTime(s.lastLap)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontSize: '11px', fontWeight: 600, color: s.s1 === bestS1 ? '#a78bfa' : isPB ? '#22c55e' : '#666' }}>{s.s1?.toFixed(2) || '--'}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontSize: '11px', fontWeight: 600, color: s.s2 === bestS2 ? '#a78bfa' : isPB ? '#22c55e' : '#666' }}>{s.s2?.toFixed(2) || '--'}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontSize: '11px', fontWeight: 600, color: s.s3 === bestS3 ? '#a78bfa' : isPB ? '#22c55e' : '#666' }}>{s.s3?.toFixed(2) || '--'}</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>{s.onPitRoad ? <span style={{ color: '#f59e0b', fontSize: '9px', fontWeight: 700 }}>PIT</span> : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
