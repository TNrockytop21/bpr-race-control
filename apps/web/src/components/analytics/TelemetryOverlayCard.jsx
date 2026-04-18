/**
 * Telemetry Overlay Card — single driver live telemetry for broadcast.
 * Shows speed, gear, throttle/brake bars, lap time, position.
 * Designed for OBS browser source overlay.
 */
import { useRef } from 'react';
import { useSession } from '../../context/SessionContext';
import { useTelemetryBuffers } from '../../context/TelemetryContext';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import { formatLapTime } from '../../lib/utils';

export function TelemetryOverlayCard({ driverName }) {
  const { drivers, standings } = useSession();
  const buffersRef = useTelemetryBuffers();

  // Find driver by name
  const driver = Object.values(drivers).find((d) => d.name === driverName) || Object.values(drivers)[0];
  const standing = standings?.find((s) => s.name === (driver?.name || driverName));

  const speedRef = useRef(null);
  const gearRef = useRef(null);
  const throttleBarRef = useRef(null);
  const brakeBarRef = useRef(null);
  const steerRef = useRef(null);
  const lapTimeRef = useRef(null);
  const rpmRef = useRef(null);

  useAnimationFrame(() => {
    if (!driver) return;
    const buffer = buffersRef.current.get(driver.id);
    if (!buffer) return;
    const f = buffer.getLatest();
    if (!f) return;

    if (speedRef.current) speedRef.current.textContent = (f.speed * 3.6).toFixed(0);
    if (gearRef.current) gearRef.current.textContent = f.gear > 0 ? f.gear : 'N';
    if (throttleBarRef.current) throttleBarRef.current.style.width = Math.round(f.throttle * 100) + '%';
    if (brakeBarRef.current) brakeBarRef.current.style.width = Math.round(f.brake * 100) + '%';
    if (lapTimeRef.current) lapTimeRef.current.textContent = formatLapTime(f.lapTime);
    if (rpmRef.current) rpmRef.current.textContent = Math.round(f.rpm || 0);
    if (steerRef.current) {
      const deg = f.steer || 0;
      steerRef.current.style.transform = `rotate(${-deg * 0.5}deg)`;
    }
  });

  const name = driver?.name || driverName || 'No Driver';
  const pos = standing?.pos || '--';
  const car = driver?.car || '';

  return (
    <div style={{
      background: 'rgba(13,13,15,0.92)',
      border: '1px solid #222',
      borderRadius: '6px',
      padding: '14px 18px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontVariantNumeric: 'tabular-nums',
      width: '100%',
      maxWidth: '360px',
    }}>
      {/* Name + position row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <div style={{ color: '#eee', fontSize: '15px', fontWeight: 700 }}>{name}</div>
          <div style={{ color: '#555', fontSize: '10px' }}>{car}</div>
        </div>
        <div style={{
          color: pos === 1 ? '#f59e0b' : '#ccc',
          fontSize: '28px',
          fontWeight: 800,
          lineHeight: 1,
        }}>
          P{pos}
        </div>
      </div>

      {/* Speed + Gear */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
        <span ref={speedRef} style={{ color: '#fff', fontSize: '36px', fontWeight: 800, lineHeight: 1 }}>0</span>
        <span style={{ color: '#555', fontSize: '14px', fontWeight: 600 }}>km/h</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#555', fontSize: '10px' }}>GEAR</span>
          <span ref={gearRef} style={{ color: '#22c55e', fontSize: '28px', fontWeight: 800, lineHeight: 1 }}>N</span>
        </div>
      </div>

      {/* Throttle bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{ color: '#22c55e', fontSize: '9px', fontWeight: 700, width: '14px' }}>T</span>
        <div style={{ flex: 1, height: '10px', background: '#1a1a1a', borderRadius: '5px', overflow: 'hidden' }}>
          <div ref={throttleBarRef} style={{
            height: '100%', width: '0%', background: '#22c55e', borderRadius: '5px',
            transition: 'width 40ms',
          }} />
        </div>
      </div>

      {/* Brake bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{ color: '#ef4444', fontSize: '9px', fontWeight: 700, width: '14px' }}>B</span>
        <div style={{ flex: 1, height: '10px', background: '#1a1a1a', borderRadius: '5px', overflow: 'hidden' }}>
          <div ref={brakeBarRef} style={{
            height: '100%', width: '0%', background: '#ef4444', borderRadius: '5px',
            transition: 'width 40ms',
          }} />
        </div>
      </div>

      {/* Lap time + RPM */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888' }}>
        <div>
          <span style={{ color: '#555', marginRight: '4px' }}>LAP</span>
          <span ref={lapTimeRef} style={{ color: '#ccc' }}>--:--</span>
        </div>
        <div>
          <span style={{ color: '#555', marginRight: '4px' }}>BEST</span>
          <span style={{ color: '#a78bfa' }}>{driver?.bestLapTime ? formatLapTime(driver.bestLapTime) : '--:--'}</span>
        </div>
        <div>
          <span style={{ color: '#555', marginRight: '4px' }}>RPM</span>
          <span ref={rpmRef} style={{ color: '#666' }}>0</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Multi-driver telemetry comparison — side by side cards.
 */
export function TelemetryCompare({ driverNames, maxDrivers = 2 }) {
  const { drivers } = useSession();

  const names = driverNames?.length
    ? driverNames
    : Object.values(drivers).filter((d) => d.connected).slice(0, maxDrivers).map((d) => d.name);

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      width: '100%',
      height: '100%',
      padding: '4px',
    }}>
      {names.map((name) => (
        <div key={name} style={{ flex: 1 }}>
          <TelemetryOverlayCard driverName={name} />
        </div>
      ))}
    </div>
  );
}
