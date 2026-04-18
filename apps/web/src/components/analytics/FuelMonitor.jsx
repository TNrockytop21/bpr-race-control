/**
 * Fuel Monitor — shows fuel remaining and estimated laps left per driver.
 * Uses live telemetry data (fuel level + fuel use rate).
 * OBS overlay ready.
 */
import { useRef, useState, useEffect } from 'react';
import { useSession } from '../../context/SessionContext';
import { useTelemetryBuffers } from '../../context/TelemetryContext';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';

const styles = {
  container: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    overflow: 'hidden',
    height: '100%',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontVariantNumeric: 'tabular-nums',
  },
  header: {
    padding: '8px 12px',
    borderBottom: '1px solid #1a1a1a',
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    fontWeight: 700,
    display: 'flex',
    justifyContent: 'space-between',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    textAlign: 'left',
    padding: '5px 8px',
    color: '#555',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    borderBottom: '1px solid #1a1a1a',
  },
  td: {
    padding: '4px 8px',
    borderBottom: '1px solid #111',
    fontSize: '12px',
  },
  empty: {
    padding: '20px',
    textAlign: 'center',
    color: '#444',
    fontSize: '12px',
  },
};

function FuelBar({ percent, critical }) {
  const color = critical ? '#ef4444' : percent < 30 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ width: '60px', height: '8px', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }}>
      <div style={{
        width: Math.max(0, Math.min(100, percent)) + '%',
        height: '100%',
        background: color,
        borderRadius: '4px',
        transition: 'width 0.5s ease',
      }} />
    </div>
  );
}

export function FuelMonitor({ driverFilter, maxDrivers = 20 }) {
  const { drivers, standings } = useSession();
  const buffersRef = useTelemetryBuffers();
  const rowsRef = useRef(new Map()); // driverId → DOM refs
  const [fuelData, setFuelData] = useState([]);

  // Update fuel data every second (not every frame — too expensive for a table)
  useEffect(() => {
    const interval = setInterval(() => {
      const data = [];

      const sortedDrivers = driverFilter?.length
        ? Object.values(drivers).filter(d => driverFilter.includes(d.name))
        : Object.values(drivers).filter(d => d.connected);

      for (const driver of sortedDrivers) {
        const buffer = buffersRef.current.get(driver.id);
        if (!buffer) continue;
        const frame = buffer.getLatest();
        if (!frame) continue;

        const fuel = frame.fuel || 0;
        const fuelPerHour = frame.fuelUsePerHour || 0;
        const standing = standings?.find(s => s.name === driver.name);
        const pos = standing?.pos || 99;

        // Estimate fuel per lap from driver's lap history
        let fuelPerLap = 0;
        if (driver.laps && driver.laps.length >= 2) {
          // Average fuel used across recent laps
          let totalUsed = 0;
          let count = 0;
          for (const lap of driver.laps.slice(-5)) {
            if (lap.fuelUsed > 0) {
              totalUsed += lap.fuelUsed;
              count++;
            }
          }
          if (count > 0) fuelPerLap = totalUsed / count;
        }

        // Fallback: estimate from fuel per hour and average lap time
        if (fuelPerLap <= 0 && fuelPerHour > 0) {
          const avgLapTime = driver.bestLapTime || 120;
          fuelPerLap = (fuelPerHour / 3600) * avgLapTime;
        }

        const estimatedLaps = fuelPerLap > 0 ? fuel / fuelPerLap : null;

        // Estimate fuel percentage (assume typical tank is ~110L for GT3, ~65L for LMP2)
        const tankSize = fuel > 80 ? 120 : 65; // rough guess
        const fuelPercent = (fuel / tankSize) * 100;

        data.push({
          id: driver.id,
          name: driver.name,
          pos,
          car: driver.car || '',
          fuel: fuel,
          fuelPerLap: fuelPerLap,
          estimatedLaps: estimatedLaps,
          fuelPercent: Math.min(100, fuelPercent),
          onPitRoad: frame.onPitRoad || false,
          critical: estimatedLaps !== null && estimatedLaps < 3,
          warning: estimatedLaps !== null && estimatedLaps < 6,
        });
      }

      data.sort((a, b) => a.pos - b.pos);
      if (maxDrivers) data.splice(maxDrivers);
      setFuelData(data);
    }, 1000);

    return () => clearInterval(interval);
  }, [drivers, standings, buffersRef, driverFilter, maxDrivers]);

  const criticalCount = fuelData.filter(d => d.critical).length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Fuel Monitor</span>
        {criticalCount > 0 && (
          <span style={{ color: '#ef4444' }}>{criticalCount} critical</span>
        )}
      </div>

      {fuelData.length === 0 ? (
        <div style={styles.empty}>Waiting for fuel data...</div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 'calc(100% - 32px)' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>P</th>
                <th style={styles.th}>Driver</th>
                <th style={styles.th}>Fuel</th>
                <th style={styles.th}>Level</th>
                <th style={styles.th}>Per Lap</th>
                <th style={styles.th}>Est. Laps</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {fuelData.map(d => (
                <tr key={d.id} style={{
                  background: d.critical ? 'rgba(239,68,68,0.06)' : d.onPitRoad ? 'rgba(245,158,11,0.04)' : 'transparent',
                  transition: 'background-color 0.3s',
                }}>
                  <td style={{ ...styles.td, color: d.pos <= 3 ? '#f59e0b' : '#666', fontWeight: 700, width: '30px' }}>
                    {d.pos}
                  </td>
                  <td style={{ ...styles.td, color: '#ccc', fontWeight: 600, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.name}
                  </td>
                  <td style={{ ...styles.td, color: d.critical ? '#ef4444' : '#ccc', fontWeight: 600 }}>
                    {d.fuel.toFixed(1)}L
                  </td>
                  <td style={styles.td}>
                    <FuelBar percent={d.fuelPercent} critical={d.critical} />
                  </td>
                  <td style={{ ...styles.td, color: '#888' }}>
                    {d.fuelPerLap > 0 ? d.fuelPerLap.toFixed(2) + 'L' : '--'}
                  </td>
                  <td style={{
                    ...styles.td,
                    fontWeight: 700,
                    color: d.critical ? '#ef4444' : d.warning ? '#f59e0b' : d.estimatedLaps !== null ? '#22c55e' : '#555',
                  }}>
                    {d.estimatedLaps !== null ? d.estimatedLaps.toFixed(1) : '--'}
                  </td>
                  <td style={{ ...styles.td, fontSize: '10px' }}>
                    {d.onPitRoad ? (
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>PIT</span>
                    ) : d.critical ? (
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>CRITICAL</span>
                    ) : d.warning ? (
                      <span style={{ color: '#f59e0b' }}>LOW</span>
                    ) : (
                      <span style={{ color: '#555' }}>OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
