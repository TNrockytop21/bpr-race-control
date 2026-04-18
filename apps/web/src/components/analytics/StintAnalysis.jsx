/**
 * Stint Analysis — lap time chart showing degradation over a stint.
 * Compare multiple drivers' lap-by-lap pace.
 * OBS overlay ready.
 */
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { useSession } from '../../context/SessionContext';

const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a78bfa',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

function formatLapTime(s) {
  if (!s || s <= 0) return '--';
  const mins = Math.floor(s / 60);
  const secs = (s % 60).toFixed(1);
  return mins > 0 ? `${mins}:${secs.padStart(4, '0')}` : `${secs}s`;
}

export function StintAnalysis({ driverFilter, maxDrivers = 6 }) {
  const { drivers, standings } = useSession();

  const driverList = useMemo(() => {
    if (driverFilter?.length) {
      return driverFilter
        .map((name) => Object.values(drivers).find((d) => d.name === name))
        .filter(Boolean);
    }
    // Default: top N drivers by position
    const names = (standings || []).slice(0, maxDrivers).map((s) => s.name);
    return names
      .map((name) => Object.values(drivers).find((d) => d.name === name))
      .filter(Boolean);
  }, [drivers, standings, driverFilter, maxDrivers]);

  // Build chart data: one row per lap number, columns per driver
  const { chartData, bestLapTime } = useMemo(() => {
    let maxLap = 0;
    let best = Infinity;

    for (const d of driverList) {
      if (d.laps?.length > maxLap) maxLap = d.laps.length;
      for (const lap of d.laps || []) {
        if (lap.lapTime > 0 && lap.lapTime < best) best = lap.lapTime;
      }
    }

    const data = [];
    for (let i = 0; i < maxLap; i++) {
      const point = { lap: i + 1 };
      for (const d of driverList) {
        const lap = d.laps?.[i];
        if (lap?.lapTime > 0 && lap.valid !== false) {
          point[d.name] = lap.lapTime;
        }
      }
      data.push(point);
    }
    return { chartData: data, bestLapTime: best === Infinity ? null : best };
  }, [driverList]);

  if (!chartData.length) {
    return (
      <div style={{ color: '#555', fontSize: '13px', padding: '20px', textAlign: 'center' }}>
        Waiting for lap data...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '200px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
          <XAxis
            dataKey="lap"
            stroke="#444"
            tick={{ fontSize: 10, fill: '#888' }}
            label={{ value: 'Lap', position: 'insideBottom', offset: -2, style: { fontSize: 9, fill: '#666' } }}
          />
          <YAxis
            stroke="#444"
            tick={{ fontSize: 10, fill: '#888' }}
            domain={['auto', 'auto']}
            tickFormatter={(v) => formatLapTime(v)}
            label={{ value: 'Lap Time', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#666' } }}
          />
          {bestLapTime && (
            <ReferenceLine
              y={bestLapTime}
              stroke="#a78bfa"
              strokeDasharray="3 3"
              strokeWidth={1}
              label={{ value: 'Best', position: 'right', style: { fontSize: 8, fill: '#a78bfa' } }}
            />
          )}
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '4px', fontSize: '11px' }}
            labelStyle={{ color: '#888' }}
            labelFormatter={(v) => `Lap ${v}`}
            formatter={(v) => [formatLapTime(v)]}
          />
          <Legend wrapperStyle={{ fontSize: '10px', color: '#ccc' }} />
          {driverList.map((d, i) => (
            <Line
              key={d.name}
              type="monotone"
              dataKey={d.name}
              stroke={COLORS[i % COLORS.length]}
              dot={{ r: 2, fill: COLORS[i % COLORS.length] }}
              strokeWidth={1.5}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
