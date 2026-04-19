/**
 * DriverDashboard — single-page view combining all driver-focused data:
 *   • Telemetry HUD (speed/gear/throttle/brake/RPM)
 *   • Fuel Monitor (fuel + laps remaining)
 *   • Live Trace (full-lap telemetry graph)
 *   • Lap Compare (current vs best)
 *   • Incident counter (with color thresholds + flash on increment)
 *
 * Usage:
 *   /driver                → auto-picks first connected driver
 *   /driver?driver=D.Newman → pin to specific driver by name
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { useTelemetryBuffers } from '../context/TelemetryContext';
import { useAnimationFrame } from '../hooks/useAnimationFrame';
import { TelemetryOverlayCard } from '../components/analytics/TelemetryOverlayCard';
import { FuelMonitor } from '../components/analytics/FuelMonitor';
import { LiveTelemetryGraph } from '../components/analytics/LiveTelemetryGraph';
import { LapTraceComparison } from '../components/analytics/LapTraceComparison';

const styles = {
  page: {
    height: 'calc(100vh - 42px)',
    display: 'grid',
    gridTemplateRows: 'auto 240px 1fr 1fr',
    gap: '6px',
    padding: '6px',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 10px',
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    fontSize: '11px',
  },
  label: {
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    fontSize: '9px',
    fontWeight: 700,
  },
  select: {
    background: '#060608',
    color: '#ccc',
    border: '1px solid #222',
    borderRadius: '3px',
    padding: '4px 8px',
    fontSize: '11px',
    fontFamily: 'inherit',
    minWidth: '180px',
  },
  meta: {
    marginLeft: 'auto',
    color: '#666',
    fontSize: '10px',
  },
  topRow: {
    display: 'grid',
    gridTemplateColumns: '380px 1fr',
    gap: '6px',
    minHeight: 0,
  },
  hudWrap: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
    minHeight: 0,
    overflow: 'hidden',
  },
  fuelWrap: {
    minHeight: 0,
    overflow: 'hidden',
  },
  panel: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    padding: '8px',
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  panelHeader: {
    fontSize: '9px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    fontWeight: 700,
    marginBottom: '6px',
  },
  panelBody: {
    height: 'calc(100% - 20px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  empty: {
    color: '#555',
    fontSize: '12px',
    textAlign: 'center',
  },
};

export function DriverDashboard() {
  const { drivers, sessionInfo, connected } = useSession();
  const [params, setParams] = useSearchParams();

  // Driver list (connected first, then sorted by name)
  const driverList = useMemo(() => {
    const list = Object.values(drivers || {});
    list.sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [drivers]);

  // Resolve selected driver: ?driver=Name → else first connected → else null
  const urlDriverName = params.get('driver');
  const [selectedName, setSelectedName] = useState(urlDriverName || null);

  // Sync URL ↔ state
  useEffect(() => {
    if (urlDriverName !== selectedName) {
      if (urlDriverName) setSelectedName(urlDriverName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDriverName]);

  // Fallback to first connected driver if nothing chosen
  useEffect(() => {
    if (!selectedName && driverList.length > 0) {
      const firstConnected = driverList.find((d) => d.connected) || driverList[0];
      if (firstConnected) setSelectedName(firstConnected.name);
    }
  }, [selectedName, driverList]);

  const driver = useMemo(
    () => driverList.find((d) => d.name === selectedName) || null,
    [driverList, selectedName]
  );

  const handleSelect = (name) => {
    setSelectedName(name);
    if (name) {
      setParams({ driver: name }, { replace: true });
    } else {
      setParams({}, { replace: true });
    }
  };

  const driverFilter = driver ? [driver.name] : null;

  return (
    <div style={styles.page}>
      {/* Controls row */}
      <div style={styles.controls}>
        <span style={styles.label}>Driver</span>
        <select
          style={styles.select}
          value={selectedName || ''}
          onChange={(e) => handleSelect(e.target.value || null)}
        >
          {driverList.length === 0 && <option value="">No drivers connected</option>}
          {driverList.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
              {!d.connected ? ' (offline)' : ''}
              {d.car ? `  —  ${d.car}` : ''}
            </option>
          ))}
        </select>

        <IncidentCounter driverId={driver?.id} />

        <span style={styles.meta}>
          {sessionInfo?.trackName ? sessionInfo.trackName : 'No track'}
          {' · '}
          <span style={{ color: connected ? '#22c55e' : '#ef4444' }}>
            {connected ? 'Live' : 'Offline'}
          </span>
        </span>
      </div>

      {/* Top row: HUD + Fuel */}
      <div style={styles.topRow}>
        <div style={styles.hudWrap}>
          {driver ? (
            <TelemetryOverlayCard driverName={driver.name} />
          ) : (
            <div style={styles.empty}>Waiting for driver...</div>
          )}
        </div>
        <div style={styles.fuelWrap}>
          <FuelMonitor driverFilter={driverFilter} maxDrivers={1} />
        </div>
      </div>

      {/* Live trace */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>Live Trace — full lap telemetry</div>
        <div style={styles.panelBody}>
          {driver ? (
            <LiveTelemetryGraphWrap driverId={driver.id} />
          ) : (
            <div style={styles.empty}>Waiting for driver...</div>
          )}
        </div>
      </div>

      {/* Lap compare */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>Lap Compare — current vs best</div>
        <div style={styles.panelBody}>
          {driver ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LapTraceComparison driverName={driver.name} />
            </div>
          ) : (
            <div style={styles.empty}>Waiting for driver...</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Incident counter badge — flashes red on increment, color-coded by threshold
function IncidentCounter({ driverId }) {
  const buffersRef = useTelemetryBuffers();
  const countRef = useRef(null);
  const containerRef = useRef(null);
  const lastCountRef = useRef(null);
  const flashTimerRef = useRef(null);

  // Reset tracking when driver changes (so switching drivers doesn't flash)
  useEffect(() => {
    lastCountRef.current = null;
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.style.background = 'rgba(6,6,8,0.6)';
      containerRef.current.style.boxShadow = 'none';
    }
    if (countRef.current) {
      countRef.current.textContent = '—';
      countRef.current.style.color = '#666';
    }
  }, [driverId]);

  useAnimationFrame(() => {
    if (!driverId) return;
    const buffer = buffersRef.current.get(driverId);
    if (!buffer) return;
    const frame = buffer.getLatest();
    if (!frame) return;

    const incidents = frame.incidents;
    if (incidents == null) return;

    // Update number + color
    let color = '#22c55e'; // green 0–4
    if (incidents >= 13) color = '#ef4444'; // red — approaching DQ threshold
    else if (incidents >= 5) color = '#f59e0b'; // amber

    if (countRef.current) {
      countRef.current.textContent = incidents;
      countRef.current.style.color = color;
    }

    // Flash container on increase
    const prev = lastCountRef.current;
    if (prev != null && incidents > prev && containerRef.current) {
      containerRef.current.style.background = 'rgba(239,68,68,0.35)';
      containerRef.current.style.boxShadow = '0 0 0 1px #ef4444';
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.style.background = 'rgba(6,6,8,0.6)';
          containerRef.current.style.boxShadow = 'none';
        }
      }, 1500);
    }
    lastCountRef.current = incidents;
  });

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 10px',
        border: '1px solid #222',
        borderRadius: '3px',
        background: 'rgba(6,6,8,0.6)',
        transition: 'background 150ms ease, box-shadow 150ms ease',
      }}
      title="iRacing incident count — green <5, amber 5-12, red 13+"
    >
      <span
        style={{
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          fontSize: '9px',
          fontWeight: 700,
        }}
      >
        Incidents
      </span>
      <span
        ref={countRef}
        style={{
          fontSize: '18px',
          fontWeight: 800,
          color: '#666',
          lineHeight: 1,
          minWidth: '22px',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        —
      </span>
      <span style={{ color: '#666', fontSize: '11px', fontWeight: 700 }}>x</span>
    </div>
  );
}

// LiveTelemetryGraph wants an explicit height — size it to the surrounding panel
function LiveTelemetryGraphWrap({ driverId }) {
  const [size, setSize] = useState({ w: 800, h: 240 });
  const wrapRef = useResizeObserver(setSize);
  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      <LiveTelemetryGraph driverId={driverId} height={size.h} />
    </div>
  );
}

function useResizeObserver(onChange) {
  const [el, setEl] = useState(null);
  useEffect(() => {
    if (!el) return undefined;
    const update = () => {
      onChange({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, onChange]);
  return setEl;
}
