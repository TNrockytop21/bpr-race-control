/**
 * Sector Comparison — head-to-head sector times between drivers.
 * Grouped bar chart: S1, S2, S3 per driver.
 * Purple = overall best, green = personal best.
 * OBS overlay ready.
 */
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { useSession } from '../../context/SessionContext';

const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a78bfa',
  '#ec4899', '#14b8a6', '#f97316',
];

function formatSector(s) {
  if (!s || s <= 0) return '--';
  return s.toFixed(1) + 's';
}

export function SectorComparison({ driverFilter, maxDrivers = 4 }) {
  const { standings } = useSession();

  const driverData = useMemo(() => {
    const selected = driverFilter?.length
      ? standings.filter((s) => driverFilter.includes(s.name))
      : standings.slice(0, maxDrivers);

    return selected.filter((s) => s.s1 > 0 || s.s2 > 0 || s.s3 > 0);
  }, [standings, driverFilter, maxDrivers]);

  // Find overall best per sector
  const bestSectors = useMemo(() => {
    const best = { s1: Infinity, s2: Infinity, s3: Infinity };
    for (const d of driverData) {
      if (d.s1 > 0 && d.s1 < best.s1) best.s1 = d.s1;
      if (d.s2 > 0 && d.s2 < best.s2) best.s2 = d.s2;
      if (d.s3 > 0 && d.s3 < best.s3) best.s3 = d.s3;
    }
    return best;
  }, [driverData]);

  // Build chart data: one row per sector, one bar per driver
  const chartData = useMemo(() => {
    return ['S1', 'S2', 'S3'].map((sector, si) => {
      const key = `s${si + 1}`;
      const row = { sector };
      for (const d of driverData) {
        row[d.name] = d[key] > 0 ? d[key] : null;
      }
      return row;
    });
  }, [driverData]);

  if (!driverData.length || !chartData.some((r) => Object.keys(r).length > 1)) {
    return (
      <div style={{ color: '#555', fontSize: '13px', padding: '20px', textAlign: 'center' }}>
        Waiting for sector data...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '200px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
          <XAxis
            dataKey="sector"
            stroke="#444"
            tick={{ fontSize: 12, fill: '#ccc', fontWeight: 700 }}
          />
          <YAxis
            stroke="#444"
            tick={{ fontSize: 10, fill: '#888' }}
            domain={['auto', 'auto']}
            tickFormatter={(v) => formatSector(v)}
          />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: '4px', fontSize: '11px' }}
            labelStyle={{ color: '#888', fontWeight: 700 }}
            formatter={(v, name) => {
              if (v == null) return ['--', name];
              const sectorKey = 's' + (chartData.findIndex((r) => r[name] === v) + 1);
              const isBest = v <= bestSectors[sectorKey];
              return [formatSector(v) + (isBest ? ' (best)' : ''), name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: '10px', color: '#ccc' }} />
          {driverData.map((d, i) => (
            <Bar
              key={d.name}
              dataKey={d.name}
              fill={COLORS[i % COLORS.length]}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
