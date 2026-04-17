import { useState, useEffect, useCallback, useRef } from 'react';
import { wsClient } from './lib/ws-client';
import { DriverList } from './components/DriverList';
import { IncidentPanel } from './components/IncidentPanel';
import { TelemetryOverlay } from './components/TelemetryOverlay';
import { PenaltyPanel } from './components/PenaltyPanel';
import { ReplayControls } from './components/ReplayControls';
import { RaceControlMessages } from './components/RaceControlMessages';
import { DriverSummaryPanel } from './components/DriverSummaryPanel';
import { TrackMap } from './components/TrackMap';
import { ReportExport } from './components/ReportExport';
import { IncidentHeatmap } from './components/IncidentHeatmap';
import { LiveStandings } from './components/LiveStandings';

const styles = {
  app: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#060608',
    color: '#cccccc',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid #1a1a1a',
    background: '#0d0d0f',
    flexShrink: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoBadge: {
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '10px',
    fontWeight: 900,
  },
  logoText: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.3px',
  },
  logoSub: {
    fontSize: '9px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    marginLeft: '8px',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '11px',
  },
  statusDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
  },
  body: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
  },
  sidebar: {
    width: '310px',
    flexShrink: 0,
    borderRight: '1px solid #1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarContent: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px',
    minWidth: 0,
    overflow: 'auto',
  },
};

export function App() {
  const [connected, setConnected] = useState(false);
  const [driverDropdownOpen, setDriverDropdownOpen] = useState(false);
  const [drivers, setDrivers] = useState({});
  const [sessionInfo, setSessionInfo] = useState(null);
  const [trackShape, setTrackShape] = useState(null);
  const [standings, setStandings] = useState([]);
  const [mainView, setMainView] = useState('telemetry'); // 'telemetry' | 'standings'
  const [selectedDriverIds, setSelectedDriverIds] = useState(new Set());
  const [incidents, setIncidents] = useState([]);
  const [incidentData, setIncidentData] = useState(null);
  const [reviewingIncident, setReviewingIncident] = useState(null);
  // Incident type filter: which types to show. Default hides 1x off-tracks.
  const [incidentFilter, setIncidentFilter] = useState({
    'off-track': false,
    'blue-flag': true,
    protest: true,
    manual: true,
  });
  const [penalties, setPenalties] = useState([]);
  const lastSessionTimeRef = useRef(null);

  useEffect(() => {
    const unsubs = [
      wsClient.on('_connected', setConnected),

      wsClient.on('session:snapshot', (payload) => {
        setSessionInfo(payload.sessionInfo);
        if (payload.trackShape) setTrackShape(payload.trackShape);
        const d = {};
        for (const driver of payload.drivers || []) {
          d[driver.id] = { ...driver, laps: [] };
        }
        setDrivers(d);
      }),

      wsClient.on('track:shape', (payload) => {
        if (payload.points) setTrackShape(payload.points);
      }),

      // Throttle standings to animation frame to prevent excessive re-renders
      (() => {
        let pending = null;
        let rafId = null;
        return wsClient.on('standings', (payload) => {
          pending = Array.isArray(payload) ? payload : [];
          if (!rafId) {
            rafId = requestAnimationFrame(() => {
              if (pending) { setStandings(pending); pending = null; }
              rafId = null;
            });
          }
        });
      })(),

      wsClient.on('driver:joined', ({ driverId, driverName, car }) => {
        setDrivers((prev) => ({
          ...prev,
          [driverId]: {
            id: driverId,
            name: driverName,
            car,
            connected: true,
            bestLapTime: null,
            lapCount: 0,
          },
        }));
      }),

      wsClient.on('driver:left', ({ driverId, replaced }) => {
        setDrivers((prev) => {
          if (!prev[driverId]) return prev;
          if (replaced) {
            const { [driverId]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [driverId]: { ...prev[driverId], connected: false } };
        });
      }),

      wsClient.on('lap:complete', ({ driverId, bestLap, lapNumber }) => {
        setDrivers((prev) => {
          if (!prev[driverId]) return prev;
          return {
            ...prev,
            [driverId]: {
              ...prev[driverId],
              bestLapTime: bestLap,
              lapCount: (prev[driverId].lapCount || 0) + 1,
            },
          };
        });
      }),

      wsClient.on('telemetry:frame', (payload) => {
        if (payload.sessionTime != null) {
          lastSessionTimeRef.current = payload.sessionTime;
        }
      }),

      wsClient.on('incident:window', (payload) => {
        setIncidentData(payload);
      }),

      // Auto-detected incidents from the server
      wsClient.on('incident:flagged', (payload) => {
        // Classify by delta: 1x is typically off-track, 2x+ is contact
        const incidentType = payload.delta >= 2 ? 'contact' : 'off-track';
        const incident = {
          id: `auto-${payload.driverId}-${payload.sessionTime}`,
          sessionTime: payload.sessionTime,
          involvedDrivers: [payload.driverId],
          notes: `+${payload.delta}x incident (total: ${payload.newCount})`,
          status: 'open',
          createdAt: Date.now(),
          detectedBy: 'auto',
          incidentType,
          delta: payload.delta,
          lap: payload.lap,
          speed: payload.speed,
        };
        setIncidents((prev) => [...prev, incident]);
      }),

      // Blue flag violations from the server
      wsClient.on('blueFlag:violation', (payload) => {
        const incident = {
          id: `bf-${payload.slowDriverId}-${payload.sessionTime}`,
          sessionTime: payload.sessionTime,
          involvedDrivers: [payload.slowDriverId, payload.fastDriverId],
          notes: `Blue flag ignored for ${payload.duration}s — ${payload.slowDriverName} blocking ${payload.fastDriverName}`,
          status: 'open',
          createdAt: Date.now(),
          detectedBy: 'auto',
          incidentType: 'blue-flag',
          lap: payload.lap,
        };
        setIncidents((prev) => [...prev, incident]);
      }),

      // Driver-reported protests
      wsClient.on('driver:protest', (payload) => {
        const incident = {
          id: `protest-${payload.driverId}-${payload.timestamp}`,
          sessionTime: payload.sessionTime,
          involvedDrivers: [payload.driverId],
          notes: `Driver protest — ${payload.driverName}: ${payload.reason || 'No details'}`,
          status: 'open',
          createdAt: Date.now(),
          detectedBy: 'driver',
          incidentType: 'protest',
          lap: payload.lap,
          lapDist: payload.lapDist,
        };
        setIncidents((prev) => [...prev, incident]);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, []);

  const toggleDriver = useCallback((driverId) => {
    setSelectedDriverIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  }, []);

  const addIncident = useCallback((incident) => {
    setIncidents((prev) => [...prev, incident]);
  }, []);

  const reviewIncident = useCallback((incident) => {
    wsClient.send('request:incidentWindow', {
      driverIds: incident.involvedDrivers,
      centerSessionTime: incident.sessionTime,
      windowSeconds: 20,
    });

    // Notify involved drivers their incident is under investigation
    wsClient.send('notify:underInvestigation', {
      driverIds: incident.involvedDrivers,
      notes: incident.notes || null,
    });

    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === incident.id ? { ...inc, status: 'under_review' } : inc
      )
    );
    setReviewingIncident(incident);

    if (window.irsdk) {
      window.irsdk.replayJump(incident.sessionTime);
    }
  }, []);

  const resolveIncident = useCallback((incidentId, penalty) => {
    setPenalties((prev) => [...prev, penalty]);
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === incidentId ? { ...inc, status: 'resolved', penalty } : inc
      )
    );

    // Notify each involved driver via server → agent
    const incident = incidents.find((inc) => inc.id === incidentId);
    if (incident) {
      for (const driverId of incident.involvedDrivers) {
        wsClient.send('notify:penalty', {
          driverId,
          penaltyType: penalty.type,
          timeSeconds: penalty.timeSeconds,
          notes: penalty.notes,
        });
      }
    }

    setReviewingIncident(null);
  }, [incidents]);

  const cancelReview = useCallback(() => {
    setReviewingIncident(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      const irsdk = window.irsdk;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          irsdk?.replaySpeed(1); // toggle handled by ReplayControls state — this is a direct SDK call
          break;
        case 'ArrowLeft':
          e.preventDefault();
          console.log('[shortcut] jump -5s');
          break;
        case 'ArrowRight':
          e.preventDefault();
          console.log('[shortcut] jump +5s');
          break;
        case 'BracketLeft': // [
          e.preventDefault();
          console.log('[shortcut] prev driver');
          break;
        case 'BracketRight': // ]
          e.preventDefault();
          console.log('[shortcut] next driver');
          break;
        case 'Digit1': irsdk?.replayCamera(0, 'cockpit'); break;
        case 'Digit2': irsdk?.replayCamera(0, 'chase'); break;
        case 'Digit3': irsdk?.replayCamera(0, 'far-chase'); break;
        case 'Digit4': irsdk?.replayCamera(0, 'front'); break;
        case 'Digit5': irsdk?.replayCamera(0, 'chopper'); break;
        case 'Digit6': irsdk?.replayCamera(0, 'blimp'); break;
        case 'Escape':
          if (reviewingIncident) {
            setReviewingIncident(null);
          }
          break;
        case 'Tab':
          e.preventDefault();
          setMainView((prev) => {
            const views = ['telemetry', 'standings', 'summary'];
            return views[(views.indexOf(prev) + 1) % views.length];
          });
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [reviewingIncident]);

  const driverCount = Object.values(drivers).filter((d) => d.connected).length;

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoBadge}>BPR</div>
          <span style={styles.logoText}>Bite Point Racing</span>
          <span style={styles.logoSub}>Race Control</span>
        </div>
        <div style={styles.statusBar}>
          {sessionInfo?.trackName && (
            <span style={{ color: '#888' }}>{sessionInfo.trackName}</span>
          )}
          <span style={{ color: '#888' }}>
            {driverCount} driver{driverCount !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              style={{
                ...styles.statusDot,
                background: connected ? '#22c55e' : '#ef4444',
              }}
            />
            <span style={{ color: connected ? '#22c55e' : '#ef4444' }}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Left sidebar: driver list + incident panel */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarContent}>
            {/* Driver selector — custom dropdown */}
            <div style={{ marginBottom: '8px', flexShrink: 0, position: 'relative' }}>
              <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                Select Drivers ({selectedDriverIds.size} selected · {Object.values(drivers).filter(d => d.connected).length} online)
              </div>
              {/* Dropdown trigger */}
              <button
                onClick={() => setDriverDropdownOpen(!driverDropdownOpen)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  background: '#1a1a1a',
                  border: driverDropdownOpen ? '1px solid rgba(139,92,246,0.4)' : '1px solid #2a2a2a',
                  borderRadius: '3px',
                  color: selectedDriverIds.size > 0 ? '#a78bfa' : '#666',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{selectedDriverIds.size > 0
                  ? [...selectedDriverIds].map(id => drivers[id]?.name || id).join(', ')
                  : 'Click to select drivers...'
                }</span>
                <span style={{ color: '#555' }}>{driverDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {/* Dropdown list */}
              {driverDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: '#141414',
                  border: '1px solid #2a2a2a',
                  borderRadius: '0 0 3px 3px',
                  maxHeight: '250px',
                  overflow: 'auto',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                  {Object.values(drivers).sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((driver) => {
                    const selected = selectedDriverIds.has(driver.id);
                    return (
                      <div
                        key={driver.id}
                        onClick={() => { toggleDriver(driver.id); }}
                        style={{
                          padding: '5px 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: selected ? 'rgba(139,92,246,0.12)' : 'transparent',
                          color: selected ? '#a78bfa' : driver.connected ? '#ccc' : '#555',
                          borderBottom: '1px solid #1a1a1a',
                        }}
                        onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = '#1a1a1a'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = selected ? 'rgba(139,92,246,0.12)' : 'transparent'; }}
                      >
                        <div style={{
                          width: '12px', height: '12px', borderRadius: '2px',
                          border: selected ? '1px solid #a78bfa' : '1px solid #444',
                          background: selected ? '#a78bfa' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '8px', color: 'white', fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {selected ? '✓' : ''}
                        </div>
                        <span style={{ fontWeight: 600 }}>{driver.name}</span>
                        <span style={{ color: '#555', fontSize: '10px' }}>{driver.car}</span>
                      </div>
                    );
                  })}
                  <div
                    onClick={() => setDriverDropdownOpen(false)}
                    style={{
                      padding: '5px 8px',
                      fontSize: '10px',
                      color: '#666',
                      textAlign: 'center',
                      cursor: 'pointer',
                      borderTop: '1px solid #222',
                    }}
                  >
                    Close
                  </div>
                </div>
              )}
            </div>

            {/* RC Messages — above incidents so it doesn't get buried */}
            <div style={{ marginBottom: '8px', flexShrink: 0 }}>
              <RaceControlMessages drivers={drivers} />
            </div>

            {/* Incidents — takes remaining space */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <IncidentPanel
                drivers={drivers}
                selectedDriverIds={selectedDriverIds}
                lastSessionTime={lastSessionTimeRef.current}
                incidents={incidents}
                incidentFilter={incidentFilter}
                onFilterChange={setIncidentFilter}
                onAddIncident={addIncident}
                onReviewIncident={reviewIncident}
              />
            </div>
          </div>
        </div>

        {/* Main area */}
        <div style={styles.main}>
          {/* View tabs */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '8px', flexShrink: 0 }}>
            {[
              { id: 'telemetry', label: 'Telemetry' },
              { id: 'standings', label: 'Standings' },
              { id: 'summary', label: 'Driver Summary' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMainView(tab.id)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '3px',
                  border: mainView === tab.id ? '1px solid rgba(139,92,246,0.4)' : '1px solid #222',
                  background: mainView === tab.id ? 'rgba(139,92,246,0.12)' : 'transparent',
                  color: mainView === tab.id ? '#a78bfa' : '#888',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Telemetry view */}
          {mainView === 'telemetry' && (
            <>
              <TelemetryOverlay
                incidentData={incidentData}
                drivers={drivers}
              />
              {reviewingIncident && (
                <div style={{ marginTop: '8px', flexShrink: 0 }}>
                  <PenaltyPanel
                    incident={reviewingIncident}
                    drivers={drivers}
                    onResolve={resolveIncident}
                    onCancel={cancelReview}
                  />
                </div>
              )}
            </>
          )}

          {/* Standings view */}
          {mainView === 'standings' && (
            <>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <TrackMap trackShape={trackShape} drivers={drivers} />
                </div>
                <div style={{ flex: 1 }}>
                  <IncidentHeatmap trackShape={trackShape} incidents={incidents} />
                </div>
              </div>
              <LiveStandings
                standings={standings}
                incidents={incidents}
                onDriverClick={(carIdx) => {
                  window.irsdk?.replayCamera(carIdx, 'chase');
                }}
              />
            </>
          )}

          {/* Replay controls — always visible, fixed position between content and bottom bar */}
          <div style={{ marginTop: '8px', flexShrink: 0 }}>
            <ReplayControls irsdkConnected={false} drivers={drivers} />
          </div>

          {/* Driver Summary view */}
          {mainView === 'summary' && (
            <div style={{ display: 'flex', gap: '8px', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1 }}>
                <DriverSummaryPanel
                  drivers={drivers}
                  incidents={incidents}
                  penalties={penalties}
                />
              </div>
              <div style={{ width: '200px', flexShrink: 0 }}>
                <ReportExport
                  sessionInfo={sessionInfo}
                  drivers={drivers}
                  incidents={incidents}
                  penalties={penalties}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
