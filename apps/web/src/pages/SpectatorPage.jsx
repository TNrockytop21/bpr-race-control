/**
 * Spectator / Fan Page — pick a driver and see their live data.
 * Full-lap telemetry graph, lap times, position, incidents, penalties.
 */
import { useState, useMemo } from 'react';
import { useSession } from '../context/SessionContext';
import { LiveTelemetryGraph } from '../components/analytics/LiveTelemetryGraph';
import { formatLapTime } from '../lib/utils';

const styles = {
  page: {
    minHeight: '100vh',
    background: '#060608',
    color: '#ccc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontVariantNumeric: 'tabular-nums',
  },
  header: {
    background: '#0d0d0f',
    borderBottom: '1px solid #1a1a1a',
    padding: '12px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#c8102e',
    fontSize: '16px',
    fontWeight: 800,
  },
  subtitle: {
    color: '#555',
    fontSize: '10px',
  },
  driverSelect: {
    background: '#111',
    border: '1px solid #2a2a2a',
    color: '#eee',
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '4px',
    cursor: 'pointer',
    minWidth: '220px',
  },
  body: {
    padding: '16px 24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  section: {
    color: '#c8102e',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    borderBottom: '1px solid #1a1a1a',
    paddingBottom: '6px',
    marginTop: '24px',
    marginBottom: '12px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '8px',
    marginBottom: '16px',
  },
  statCard: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '6px',
    padding: '12px 16px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 800,
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: '9px',
    color: '#666',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    marginTop: '4px',
  },
  sectorGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
    marginBottom: '16px',
  },
  sectorCard: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '6px',
    padding: '10px',
    textAlign: 'center',
  },
  lapTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  lapTh: {
    textAlign: 'left',
    padding: '6px 8px',
    color: '#666',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    borderBottom: '1px solid #1a1a1a',
  },
  lapTd: {
    padding: '5px 8px',
    borderBottom: '1px solid #111',
  },
  graphWrap: {
    background: '#0a0a0e',
    border: '1px solid #1a1a1a',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  toggleRow: {
    display: 'flex',
    gap: '6px',
    marginBottom: '8px',
  },
  toggleBtn: {
    padding: '4px 12px',
    borderRadius: '3px',
    border: '1px solid #222',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
    background: '#111',
    color: '#888',
  },
  noDriver: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#444',
    fontSize: '16px',
  },
};

export function SpectatorPage() {
  const { drivers, standings, events } = useSession();
  const [selectedId, setSelectedId] = useState('');
  const [showThrottle, setShowThrottle] = useState(true);
  const [showBrake, setShowBrake] = useState(true);
  const [showSpeed, setShowSpeed] = useState(true);
  const [showSteering, setShowSteering] = useState(false);

  const driverList = useMemo(() =>
    Object.values(drivers).filter((d) => d.connected).sort((a, b) => {
      const posA = standings?.find((s) => s.name === a.name)?.pos || 999;
      const posB = standings?.find((s) => s.name === b.name)?.pos || 999;
      return posA - posB;
    }), [drivers, standings]);

  const driver = drivers[selectedId] || (driverList.length === 1 ? driverList[0] : null);
  const standing = standings?.find((s) => s.name === driver?.name);

  // Auto-select first driver if none selected
  if (!selectedId && driverList.length > 0 && !driver) {
    // Don't auto-select, let user choose
  }

  const driverLaps = driver?.laps || [];
  const bestLap = driver?.bestLapTime;
  const bestSectors = driver?.bestSectors || [];

  // Driver-specific events
  const driverEvents = useMemo(() => {
    if (!driver) return [];
    return (events || []).filter((e) => {
      const d = e.data || {};
      return d.driverId === driver.id || d.driverName === driver.name ||
        d.driverA === driver.name || d.driverB === driver.name;
    }).slice(-10);
  }, [events, driver]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>LIVE DRIVER DATA</div>
          <div style={styles.subtitle}>BPR Race Control</div>
        </div>
        <select
          style={styles.driverSelect}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">— Select a Driver —</option>
          {driverList.map((d) => {
            const pos = standings?.find((s) => s.name === d.name)?.pos;
            return (
              <option key={d.id} value={d.id}>
                {pos ? `P${pos} ` : ''}{d.name} — {d.car}
              </option>
            );
          })}
        </select>
      </div>

      <div style={styles.body}>
        {!driver ? (
          <div style={styles.noDriver}>
            Select a driver from the dropdown to view their live telemetry
          </div>
        ) : (
          <>
            {/* ── DRIVER INFO ──────────────────────────── */}
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: standing?.pos === 1 ? '#f59e0b' : '#eee' }}>
                  P{standing?.pos || '--'}
                </div>
                <div style={styles.statLabel}>Position</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: '#a78bfa' }}>
                  {bestLap ? formatLapTime(bestLap) : '--:--'}
                </div>
                <div style={styles.statLabel}>Best Lap</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: standing?.lastLap === bestLap ? '#22c55e' : '#ccc' }}>
                  {standing?.lastLap ? formatLapTime(standing.lastLap) : '--:--'}
                </div>
                <div style={styles.statLabel}>Last Lap</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: '#ccc' }}>
                  {standing?.lapsCompleted || driver.lapCount || 0}
                </div>
                <div style={styles.statLabel}>Laps</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: '#f59e0b' }}>
                  {standing?.interval ? '+' + standing.interval.toFixed(1) + 's' : '--'}
                </div>
                <div style={styles.statLabel}>Gap to Leader</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statValue, color: '#ccc', fontSize: '16px' }}>
                  {driver.car}
                </div>
                <div style={styles.statLabel}>Car</div>
              </div>
            </div>

            {/* ── SECTORS ──────────────────────────────── */}
            <div style={styles.sectorGrid}>
              {['S1', 'S2', 'S3'].map((label, i) => {
                const current = standing?.[`s${i + 1}`];
                const best = bestSectors[i];
                const isBest = current > 0 && best > 0 && current <= best;
                return (
                  <div key={label} style={{
                    ...styles.sectorCard,
                    borderColor: isBest ? 'rgba(34,197,94,0.3)' : '#1a1a1a',
                    background: isBest ? 'rgba(34,197,94,0.05)' : '#0d0d0f',
                  }}>
                    <div style={{ color: '#555', fontSize: '9px', fontWeight: 700, marginBottom: '4px' }}>{label}</div>
                    <div style={{
                      fontSize: '18px', fontWeight: 700,
                      color: isBest ? '#22c55e' : current > 0 ? '#ccc' : '#333',
                    }}>
                      {current > 0 ? current.toFixed(1) + 's' : '--'}
                    </div>
                    <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>
                      best: {best > 0 ? best.toFixed(1) : '--'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── LIVE TELEMETRY GRAPH ──────────────────── */}
            <div style={styles.section}>LIVE TELEMETRY</div>

            <div style={styles.toggleRow}>
              {[
                { key: 'throttle', label: 'Throttle', color: '#22c55e', on: showThrottle, set: setShowThrottle },
                { key: 'brake', label: 'Brake', color: '#ef4444', on: showBrake, set: setShowBrake },
                { key: 'speed', label: 'Speed', color: '#3b82f6', on: showSpeed, set: setShowSpeed },
                { key: 'steering', label: 'Steering', color: '#f59e0b', on: showSteering, set: setShowSteering },
              ].map((t) => (
                <button
                  key={t.key}
                  style={{
                    ...styles.toggleBtn,
                    background: t.on ? t.color + '18' : '#111',
                    borderColor: t.on ? t.color + '55' : '#222',
                    color: t.on ? t.color : '#555',
                  }}
                  onClick={() => t.set(!t.on)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={styles.graphWrap}>
              <LiveTelemetryGraph
                driverId={driver.id}
                height={320}
                showThrottle={showThrottle}
                showBrake={showBrake}
                showSpeed={showSpeed}
                showSteering={showSteering}
              />
            </div>

            {/* ── LAP HISTORY ──────────────────────────── */}
            {driverLaps.length > 0 && (
              <>
                <div style={styles.section}>LAP HISTORY</div>
                <table style={styles.lapTable}>
                  <thead>
                    <tr>
                      <th style={styles.lapTh}>Lap</th>
                      <th style={styles.lapTh}>Time</th>
                      <th style={styles.lapTh}>S1</th>
                      <th style={styles.lapTh}>S2</th>
                      <th style={styles.lapTh}>S3</th>
                      <th style={styles.lapTh}>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...driverLaps].reverse().map((lap, i) => {
                      const isBest = lap.lapTime === bestLap;
                      const delta = bestLap && lap.lapTime > 0 ? lap.lapTime - bestLap : null;
                      return (
                        <tr key={lap.lapNumber || i} style={{
                          background: isBest ? 'rgba(167,139,250,0.06)' : 'transparent',
                        }}>
                          <td style={{ ...styles.lapTd, color: '#888', fontWeight: 600 }}>
                            {lap.lapNumber || driverLaps.length - i}
                          </td>
                          <td style={{
                            ...styles.lapTd,
                            color: isBest ? '#a78bfa' : lap.valid === false ? '#555' : '#ccc',
                            fontWeight: isBest ? 700 : 400,
                          }}>
                            {formatLapTime(lap.lapTime)}{lap.valid === false ? ' (inv)' : ''}
                          </td>
                          <td style={{ ...styles.lapTd, color: '#888' }}>
                            {lap.sectors?.[0]?.toFixed(1) || '--'}
                          </td>
                          <td style={{ ...styles.lapTd, color: '#888' }}>
                            {lap.sectors?.[1]?.toFixed(1) || '--'}
                          </td>
                          <td style={{ ...styles.lapTd, color: '#888' }}>
                            {lap.sectors?.[2]?.toFixed(1) || '--'}
                          </td>
                          <td style={{
                            ...styles.lapTd,
                            color: delta === 0 ? '#a78bfa' : delta > 0 ? '#ef4444' : delta < 0 ? '#22c55e' : '#555',
                            fontWeight: 600,
                          }}>
                            {delta !== null && delta !== 0 ? (delta > 0 ? '+' : '') + delta.toFixed(2) : isBest ? 'BEST' : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* ── EVENTS ───────────────────────────────── */}
            {driverEvents.length > 0 && (
              <>
                <div style={styles.section}>RECENT EVENTS</div>
                {driverEvents.map((e, i) => (
                  <div key={i} style={{
                    padding: '6px 10px',
                    borderLeft: '3px solid #333',
                    marginBottom: '4px',
                    fontSize: '11px',
                    color: '#888',
                  }}>
                    <span style={{ color: '#555', marginRight: '8px', fontSize: '9px' }}>
                      {e.type?.replace(/_/g, ' ')}
                    </span>
                    {JSON.stringify(e.data || {}).substring(0, 100)}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
