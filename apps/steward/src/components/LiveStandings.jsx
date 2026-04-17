import { useMemo, useState } from 'react';

const styles = {
  container: {
    flex: 1,
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  title: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
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
    padding: '6px 10px',
    color: '#666',
    fontSize: '9px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #1a1a1a',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  thRight: {
    textAlign: 'right',
  },
  thCenter: {
    textAlign: 'center',
  },
  td: {
    padding: '5px 10px',
    borderBottom: '1px solid #111',
    whiteSpace: 'nowrap',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#444',
    fontSize: '13px',
    padding: '20px',
  },
};

function formatLapTime(t) {
  if (t == null || t <= 0) return '--:--.---';
  const mins = Math.floor(t / 60);
  const secs = (t % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
}

function formatInterval(val) {
  if (val == null || val === 0) return '--';
  return `+${val.toFixed(1)}s`;
}

export function LiveStandings({ standings, incidents, onDriverClick }) {
  // Build incident count per driver name
  const incidentCounts = useMemo(() => {
    const counts = {};
    for (const inc of incidents || []) {
      for (const dId of inc.involvedDrivers || []) {
        counts[dId] = (counts[dId] || 0) + (inc.delta || 1);
      }
    }
    return counts;
  }, [incidents]);

  // Also build a name -> driverId lookup for matching standings names to incident driverIds
  // Standings use iRacing names, incidents use driverIds — we match via the drivers prop if needed
  // For now, incident counts are keyed by driverId; standings entries don't have driverId.
  // We'll show iRacing's own incident count from the `incidents` field in telemetry frames instead.

  if (!standings || standings.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.title}>Live Standings</span>
        </div>
        <div style={styles.empty}>
          Waiting for standings data...
        </div>
      </div>
    );
  }

  // Find best lap and best sectors across all drivers for highlighting
  const overallBest = standings.reduce((best, s) => {
    if (s.bestLap && (best === null || s.bestLap < best)) return s.bestLap;
    return best;
  }, null);

  const overallBestS1 = standings.reduce((best, s) => {
    if (s.s1 && s.s1 > 0 && (best === null || s.s1 < best)) return s.s1;
    return best;
  }, null);
  const overallBestS2 = standings.reduce((best, s) => {
    if (s.s2 && s.s2 > 0 && (best === null || s.s2 < best)) return s.s2;
    return best;
  }, null);
  const overallBestS3 = standings.reduce((best, s) => {
    if (s.s3 && s.s3 > 0 && (best === null || s.s3 < best)) return s.s3;
    return best;
  }, null);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Live Standings</span>
        <span style={{ fontSize: '11px', color: '#666' }}>
          {standings.length} cars
        </span>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: '30px', textAlign: 'center' }}>Pos</th>
              <th style={{ ...styles.th, width: '40px', textAlign: 'center' }}>#</th>
              <th style={{ ...styles.th, width: '42px', textAlign: 'center' }}>Class</th>
              <th style={styles.th}>Driver</th>
              <th style={{ ...styles.th, ...styles.thCenter }}>Laps</th>
              <th style={{ ...styles.th, ...styles.thRight }}>Interval</th>
              <th style={{ ...styles.th, ...styles.thRight }}>Gap</th>
              <th style={{ ...styles.th, ...styles.thRight }}>Best Lap</th>
              <th style={{ ...styles.th, ...styles.thRight }}>Last Lap</th>
              <th style={{ ...styles.th, ...styles.thRight }}>S1</th>
              <th style={{ ...styles.th, ...styles.thRight }}>S2</th>
              <th style={{ ...styles.th, ...styles.thRight }}>S3</th>
              <th style={{ ...styles.th, ...styles.thCenter }}>iR</th>
              <th style={{ ...styles.th, ...styles.thCenter }}>Pit</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, idx) => {
              const isBestLap = s.bestLap && s.bestLap === overallBest;
              const isInPit = s.onPitRoad;

              return (
                <tr
                  key={s.carIdx != null ? `car-${s.carIdx}` : `${s.carNum}-${s.name}`}
                  onClick={() => onDriverClick?.(idx)}
                  style={{
                    background: isInPit ? 'rgba(245,158,11,0.05)' : 'transparent',
                    cursor: onDriverClick ? 'pointer' : 'default',
                    transition: 'background-color 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (onDriverClick) e.currentTarget.style.background = 'rgba(139,92,246,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isInPit ? 'rgba(245,158,11,0.05)' : 'transparent';
                  }}
                >
                  {/* Position */}
                  <td style={{
                    ...styles.td,
                    textAlign: 'center',
                    fontWeight: 700,
                    color: s.pos === 1 ? '#f59e0b' : s.pos <= 3 ? '#ccc' : '#888',
                  }}>
                    {s.pos}
                  </td>

                  {/* Car number */}
                  <td style={{
                    ...styles.td,
                    textAlign: 'center',
                    color: '#666',
                    fontWeight: 600,
                  }}>
                    {s.carNum}
                  </td>

                  {/* Class */}
                  <td style={{
                    ...styles.td,
                    textAlign: 'center',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: s.carClass === 'LMP2' ? '#ef4444' : '#f59e0b',
                  }}>
                    {s.carClass || 'GT3'}
                  </td>

                  {/* Driver name */}
                  <td style={{
                    ...styles.td,
                    fontWeight: 600,
                    color: '#ccc',
                    maxWidth: '150px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {s.name}
                  </td>

                  {/* Laps */}
                  <td style={{ ...styles.td, textAlign: 'center', color: '#888' }}>
                    {s.lapsCompleted}
                  </td>

                  {/* Interval to car ahead */}
                  <td style={{
                    ...styles.td,
                    textAlign: 'right',
                    color: s.pos === 1 ? '#666' : '#ccc',
                  }}>
                    {s.pos === 1 ? 'Leader' : formatInterval(s.interval)}
                  </td>

                  {/* Gap to leader */}
                  <td style={{
                    ...styles.td,
                    textAlign: 'right',
                    color: s.pos === 1 ? '#666' : '#888',
                  }}>
                    {s.pos === 1 ? '--' : formatInterval(s.gap)}
                  </td>

                  {/* Best lap */}
                  <td style={{
                    ...styles.td,
                    textAlign: 'right',
                    color: isBestLap ? '#a78bfa' : '#ccc',
                    fontWeight: isBestLap ? 700 : 400,
                  }}>
                    {formatLapTime(s.bestLap)}
                  </td>

                  {/* Last lap */}
                  <td style={{
                    ...styles.td,
                    textAlign: 'right',
                    color: s.lastLap && s.bestLap && s.lastLap === s.bestLap ? '#22c55e' : '#ccc',
                  }}>
                    {formatLapTime(s.lastLap)}
                  </td>

                  {/* Sectors — purple = overall best, green = personal best */}
                  <td style={{
                    ...styles.td, textAlign: 'right', fontSize: '11px', fontWeight: 600,
                    color: s.s1 && s.s1 === overallBestS1 ? '#a78bfa'
                         : s.s1 && s.bestLap && s.lastLap === s.bestLap ? '#22c55e'
                         : '#888',
                  }}>
                    {s.s1?.toFixed(2) || '--'}
                  </td>
                  <td style={{
                    ...styles.td, textAlign: 'right', fontSize: '11px', fontWeight: 600,
                    color: s.s2 && s.s2 === overallBestS2 ? '#a78bfa'
                         : s.s2 && s.bestLap && s.lastLap === s.bestLap ? '#22c55e'
                         : '#888',
                  }}>
                    {s.s2?.toFixed(2) || '--'}
                  </td>
                  <td style={{
                    ...styles.td, textAlign: 'right', fontSize: '11px', fontWeight: 600,
                    color: s.s3 && s.s3 === overallBestS3 ? '#a78bfa'
                         : s.s3 && s.bestLap && s.lastLap === s.bestLap ? '#22c55e'
                         : '#888',
                  }}>
                    {s.s3?.toFixed(2) || '--'}
                  </td>

                  {/* iRating */}
                  <td style={{ ...styles.td, textAlign: 'center', color: '#666', fontSize: '11px' }}>
                    {s.iRating ? (s.iRating / 1000).toFixed(1) + 'k' : '--'}
                  </td>

                  {/* Pit indicator */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    {isInPit && (
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        color: '#f59e0b',
                        textTransform: 'uppercase',
                      }}>PIT</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
