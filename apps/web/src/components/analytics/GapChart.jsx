/**
 * Gap Chart — shows gap-to-leader over time for each driver.
 * Lines converging = battle forming. Lines diverging = driver falling back.
 * OBS overlay ready.
 */
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useSession } from '../../context/SessionContext';

const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a78bfa',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#e879f9', '#facc15', '#fb923c', '#4ade80',
];

export function GapChart({ driverFilter, maxDrivers = 10 }) {
  const { gapHistory, standings } = useSession();

  // Get top N driver names from current standings
  const driverNames = useMemo(() => {
    if (driverFilter?.length) return driverFilter;
    return (standings || [])
      .slice(0, maxDrivers)
      .map((s) => s.name)
      .filter(Boolean);
  }, [standings, driverFilter, maxDrivers]);

  // Transform history into Recharts data
  const chartData = useMemo(() => {
    if (!gapHistory.length) return [];
    const startTime = gapHistory[0].time;
    return gapHistory.map((snap) => {
      const point = { time: ((snap.time - startTime) / 60000).toFixed(1) };
      for (const name of driverNames) {
        point[name] = snap.drivers[name]?.gap ?? null;
      }
      return point;
    });
  }, [gapHistory, driverNames]);

  if (!chartData.length) {
    return (
      <div style={{ color: '#555', fontSize: '13px', padding: '20px', textAlign: 'center' }}>
        Waiting for gap data...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '200px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis
            dataKey="time"
            stroke="#444"
            tick={{ fontSize: 10, fill: '#888' }}
            label={{ value: 'Minutes', position: 'insideBottom', offset: -2, style: { fontSize: 9, fill: '#666' } }}
          />
          <YAxis
            stroke="#444"
            tick={{ fontSize: 10, fill: '#888' }}
            label={{ value: 'Gap (s)', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: '#666' } }}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '4px', fontSize: '11px' }}
            labelStyle={{ color: '#888' }}
            labelFormatter={(v) => `${v} min`}
            formatter={(v) => v != null ? [`${v.toFixed(1)}s`] : ['--']}
          />
          <Legend wrapperStyle={{ fontSize: '10px', color: '#ccc' }} />
          {driverNames.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
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
