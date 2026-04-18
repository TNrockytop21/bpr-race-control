/**
 * Lap Trace Comparison — overlay comparing current lap telemetry
 * to best lap for a driver, or comparing two drivers' traces.
 * Shows throttle, brake, speed over lap distance.
 * OBS overlay ready.
 */
import { useRef, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, ComposedChart } from 'recharts';
import { useSession } from '../../context/SessionContext';
import { useTelemetryBuffers } from '../../context/TelemetryContext';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';

const COLORS = {
  current: '#22c55e',
  best: '#a78bfa',
  driverA: '#ef4444',
  driverB: '#3b82f6',
};

/**
 * Single driver: current lap vs best lap trace comparison.
 * Shows where the driver is gaining/losing time relative to their best.
 */
export function LapTraceComparison({ driverName, channel = 'speed' }) {
  const { drivers, standings } = useSession();
  const buffersRef = useTelemetryBuffers();
  const chartRef = useRef([]);
  const containerRef = useRef(null);

  const driver = Object.values(drivers).find((d) => d.name === driverName) || Object.values(drivers)[0];
  const standing = standings?.find((s) => s.name === (driver?.name || driverName));
  const name = driver?.name || driverName || 'Driver';

  // Build current lap trace from telemetry buffer
  const buildTrace = useCallback(() => {
    if (!driver) return [];
    const buffer = buffersRef.current.get(driver.id);
    if (!buffer) return [];

    const points = [];
    const count = buffer.getCount ? buffer.getCount() : 0;
    if (count === 0) return [];

    // Get all frames and filter to current lap
    for (let i = 0; i < count; i++) {
      const frame = buffer.getAt ? buffer.getAt(i) : null;
      if (!frame) continue;

      const dist = (frame.lapDist || 0) * 100; // Convert to percentage
      let value;
      switch (channel) {
        case 'throttle': value = (frame.throttle || 0) * 100; break;
        case 'brake': value = (frame.brake || 0) * 100; break;
        case 'speed': value = (frame.speed || 0) * 3.6; break; // km/h
        default: value = (frame.speed || 0) * 3.6;
      }
      points.push({ dist: Math.round(dist), value });
    }
    return points;
  }, [driver, channel, buffersRef]);

  // Build static chart data from sector times for comparison
  const comparisonData = useMemo(() => {
    if (!standing) return [];

    // Create a simple representation with sector markers
    const data = [];
    const bestLap = driver?.bestLapTime;
    const lastLap = standing?.lastLap;

    if (bestLap && lastLap && bestLap > 0 && lastLap > 0) {
      // Sector comparison bars
      const bestS1 = driver?.bestSectors?.[0] || 0;
      const bestS2 = driver?.bestSectors?.[1] || 0;
      const bestS3 = driver?.bestSectors?.[2] || 0;
      const curS1 = standing?.s1 || 0;
      const curS2 = standing?.s2 || 0;
      const curS3 = standing?.s3 || 0;

      if (bestS1 > 0) data.push({ sector: 'S1', best: bestS1, current: curS1, delta: curS1 > 0 ? (curS1 - bestS1) : null });
      if (bestS2 > 0) data.push({ sector: 'S2', best: bestS2, current: curS2, delta: curS2 > 0 ? (curS2 - bestS2) : null });
      if (bestS3 > 0) data.push({ sector: 'S3', best: bestS3, current: curS3, delta: curS3 > 0 ? (curS3 - bestS3) : null });
    }
    return data;
  }, [standing, driver]);

  const bestLapTime = driver?.bestLapTime;
  const lastLapTime = standing?.lastLap;
  const delta = bestLapTime && lastLapTime && lastLapTime > 0 && bestLapTime > 0
    ? (lastLapTime - bestLapTime) : null;

  function formatTime(t) {
    if (!t || t <= 0) return '--:--';
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1);
    return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
  }

  return (
    <div ref={containerRef} style={{
      background: 'rgba(13,13,15,0.92)',
      border: '1px solid #222',
      borderRadius: '6px',
      padding: '14px 18px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontVariantNumeric: 'tabular-nums',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ color: '#eee', fontSize: '14px', fontWeight: 700 }}>{name}</div>
          <div style={{ color: '#555', fontSize: '10px' }}>Lap Comparison — Current vs Best</div>
        </div>
        {delta !== null && (
          <div style={{
            fontSize: '20px',
            fontWeight: 800,
            color: delta <= 0 ? '#22c55e' : '#ef4444',
          }}>
            {delta <= 0 ? '' : '+'}{delta.toFixed(2)}s
          </div>
        )}
      </div>

      {/* Lap times row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12px' }}>
        <div>
          <span style={{ color: '#555' }}>Best: </span>
          <span style={{ color: COLORS.best, fontWeight: 700 }}>{formatTime(bestLapTime)}</span>
        </div>
        <div>
          <span style={{ color: '#555' }}>Last: </span>
          <span style={{ color: COLORS.current, fontWeight: 700 }}>{formatTime(lastLapTime)}</span>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{ color: '#555' }}>P</span>
          <span style={{ color: '#ccc', fontWeight: 700 }}>{standing?.pos || '--'}</span>
        </div>
      </div>

      {/* Sector comparison */}
      {comparisonData.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
          {comparisonData.map((s) => {
            const isBest = s.delta !== null && s.delta <= 0;
            const isSlower = s.delta !== null && s.delta > 0;
            return (
              <div key={s.sector} style={{
                flex: 1,
                background: isBest ? 'rgba(34,197,94,0.12)' : isSlower ? 'rgba(239,68,68,0.08)' : '#111',
                border: `1px solid ${isBest ? 'rgba(34,197,94,0.3)' : isSlower ? 'rgba(239,68,68,0.2)' : '#1a1a1a'}`,
                borderRadius: '4px',
                padding: '8px',
                textAlign: 'center',
              }}>
                <div style={{ color: '#888', fontSize: '9px', fontWeight: 700, marginBottom: '4px' }}>{s.sector}</div>
                <div style={{ color: '#ccc', fontSize: '13px', fontWeight: 700 }}>
                  {s.current > 0 ? s.current.toFixed(1) + 's' : '--'}
                </div>
                {s.delta !== null && (
                  <div style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: isBest ? '#22c55e' : '#ef4444',
                    marginTop: '2px',
                  }}>
                    {s.delta <= 0 ? '' : '+'}{(s.delta).toFixed(2)}
                  </div>
                )}
                <div style={{ color: '#555', fontSize: '9px', marginTop: '2px' }}>
                  best: {s.best > 0 ? s.best.toFixed(1) : '--'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {comparisonData.length === 0 && (
        <div style={{ color: '#444', fontSize: '11px', textAlign: 'center', padding: '12px' }}>
          Waiting for sector data...
        </div>
      )}
    </div>
  );
}

/**
 * Two-driver head-to-head comparison.
 */
export function DriverVsDriver({ driverAName, driverBName }) {
  const { drivers, standings } = useSession();

  const driverA = Object.values(drivers).find((d) => d.name === driverAName);
  const driverB = Object.values(drivers).find((d) => d.name === driverBName);
  const standingA = standings?.find((s) => s.name === driverAName);
  const standingB = standings?.find((s) => s.name === driverBName);

  if (!driverA && !driverB) {
    return <div style={{ color: '#555', padding: '20px', textAlign: 'center' }}>Select two drivers to compare</div>;
  }

  const sectorData = useMemo(() => {
    const data = [];
    for (let i = 0; i < 3; i++) {
      const sectorKey = `s${i + 1}`;
      const row = {
        sector: `S${i + 1}`,
        [driverAName || 'A']: standingA?.[sectorKey] > 0 ? standingA[sectorKey] : null,
        [driverBName || 'B']: standingB?.[sectorKey] > 0 ? standingB[sectorKey] : null,
      };
      data.push(row);
    }
    return data;
  }, [standingA, standingB, driverAName, driverBName]);

  function formatTime(t) {
    if (!t || t <= 0) return '--:--';
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(1);
    return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
  }

  const gap = standingA && standingB
    ? Math.abs((standingA.gap || 0) - (standingB.gap || 0)).toFixed(1)
    : '--';

  return (
    <div style={{
      background: 'rgba(13,13,15,0.92)',
      border: '1px solid #222',
      borderRadius: '6px',
      padding: '14px 18px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontVariantNumeric: 'tabular-nums',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: COLORS.driverA, fontSize: '14px', fontWeight: 700 }}>{driverAName || 'Driver A'}</div>
          <div style={{ color: '#555', fontSize: '10px' }}>P{standingA?.pos || '--'}</div>
        </div>
        <div style={{
          background: '#111',
          border: '1px solid #222',
          borderRadius: '4px',
          padding: '4px 12px',
          textAlign: 'center',
        }}>
          <div style={{ color: '#888', fontSize: '8px', fontWeight: 700 }}>GAP</div>
          <div style={{ color: '#f59e0b', fontSize: '16px', fontWeight: 800 }}>{gap}s</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: COLORS.driverB, fontSize: '14px', fontWeight: 700 }}>{driverBName || 'Driver B'}</div>
          <div style={{ color: '#555', fontSize: '10px' }}>P{standingB?.pos || '--'}</div>
        </div>
      </div>

      {/* Lap time comparison */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <div style={{ flex: 1, background: '#111', borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: '8px', fontWeight: 700 }}>BEST LAP</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ color: COLORS.driverA, fontWeight: 700 }}>{formatTime(driverA?.bestLapTime)}</span>
            <span style={{ color: COLORS.driverB, fontWeight: 700 }}>{formatTime(driverB?.bestLapTime)}</span>
          </div>
        </div>
        <div style={{ flex: 1, background: '#111', borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: '8px', fontWeight: 700 }}>LAST LAP</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ color: COLORS.driverA, fontWeight: 700 }}>{formatTime(standingA?.lastLap)}</span>
            <span style={{ color: COLORS.driverB, fontWeight: 700 }}>{formatTime(standingB?.lastLap)}</span>
          </div>
        </div>
      </div>

      {/* Sector comparison chart */}
      <div style={{ height: '120px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={sectorData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis dataKey="sector" stroke="#444" tick={{ fontSize: 11, fill: '#ccc', fontWeight: 700 }} />
            <YAxis stroke="#444" tick={{ fontSize: 9, fill: '#888' }} domain={['auto', 'auto']}
              tickFormatter={(v) => v?.toFixed(1)} />
            <Tooltip
              contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '4px', fontSize: '11px' }}
              formatter={(v) => v != null ? [v.toFixed(2) + 's'] : ['--']}
            />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line type="monotone" dataKey={driverAName || 'A'} stroke={COLORS.driverA} strokeWidth={2}
              dot={{ r: 4, fill: COLORS.driverA }} isAnimationActive={false} />
            <Line type="monotone" dataKey={driverBName || 'B'} stroke={COLORS.driverB} strokeWidth={2}
              dot={{ r: 4, fill: COLORS.driverB }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
