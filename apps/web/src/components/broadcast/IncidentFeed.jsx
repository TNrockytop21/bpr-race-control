import { useEffect, useRef, useState } from 'react';
import { wsClient } from '../../lib/ws-client';

const styles = {
  container: {
    background: '#0d0d0f',
    border: '1px solid #1a1a1a',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    height: '100%',
  },
  header: {
    padding: '8px 12px',
    borderBottom: '1px solid #1a1a1a',
    fontSize: '9px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    fontWeight: 600,
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'space-between',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '4px',
  },
  entry: {
    padding: '6px 8px',
    borderRadius: '3px',
    marginBottom: '3px',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  tag: {
    fontSize: '8px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '1px 5px',
    borderRadius: '2px',
    flexShrink: 0,
    marginTop: '1px',
  },
  time: {
    color: '#555',
    fontSize: '10px',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
    width: '36px',
  },
  text: {
    flex: 1,
    color: '#ccc',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#333',
    fontSize: '11px',
  },
};

const EVENT_CONFIG = {
  incident_detected: { tag: 'INC', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  blue_flag_violation: { tag: 'BLUE', color: '#60a5fa', bg: 'rgba(96,165,250,0.06)' },
  penalty_issued: { tag: 'PENALTY', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  penalty_served: { tag: 'SERVED', color: '#22c55e', bg: 'rgba(34,197,94,0.06)' },
  under_investigation: { tag: 'INV', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
  driver_protest: { tag: 'PROTEST', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
  race_control_message: { tag: 'RC', color: '#ccc', bg: 'rgba(255,255,255,0.04)' },
  new_best_lap: { tag: 'FAST', color: '#a78bfa', bg: 'rgba(139,92,246,0.06)' },
  driver_joined: { tag: 'JOIN', color: '#22c55e', bg: 'rgba(34,197,94,0.04)' },
  driver_left: { tag: 'LEFT', color: '#666', bg: 'rgba(255,255,255,0.02)' },
};

function formatTime(ts) {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatEventText(event) {
  const d = event.data || {};
  switch (event.type) {
    case 'incident_detected':
      return `${d.driverName} +${d.delta}x (total: ${d.newCount})`;
    case 'blue_flag_violation':
      return `${d.slowDriver} blocking ${d.fastDriver} (${d.duration}s)`;
    case 'penalty_issued':
      return `${d.driverName}: ${d.penaltyType?.replace('-', ' ')}${d.timeSeconds ? ` (${d.timeSeconds}s)` : ''}`;
    case 'penalty_served':
      return `${d.driverName} served ${d.penaltyType?.replace('-', ' ')}`;
    case 'under_investigation':
      return `${d.driverNames} under investigation`;
    case 'driver_protest':
      return `${d.driverName} filed protest`;
    case 'race_control_message':
      return d.message || 'Race control message';
    case 'new_best_lap':
      return `${d.driverName} L${d.lapNumber} — ${d.lapTime?.toFixed(3)}s`;
    case 'driver_joined':
      return `${d.driverName} connected (${d.car})`;
    case 'driver_left':
      return `${d.driverName} disconnected`;
    default:
      return event.type;
  }
}

export function IncidentFeed() {
  const [events, setEvents] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    const unsubs = [
      wsClient.on('event', (payload) => {
        setEvents((prev) => [...prev.slice(-100), payload]);
      }),
      wsClient.on('event:log', (payload) => {
        setEvents(payload.events || []);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events]);

  // Filter to broadcast-relevant events only
  const relevant = events.filter((e) => EVENT_CONFIG[e.type]);

  // Compute active status counts
  const underInvestigation = events.filter((e) => e.type === 'under_investigation').length;
  const penaltiesIssued = events.filter((e) => e.type === 'penalty_issued').length;
  const penaltiesServed = events.filter((e) => e.type === 'penalty_served').length;
  const pendingPenalties = penaltiesIssued - penaltiesServed;
  const incidents = events.filter((e) => e.type === 'incident_detected').length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Race Feed</span>
        <span style={{ color: '#555' }}>{relevant.length}</span>
      </div>

      {/* Active status bar */}
      {(underInvestigation > 0 || pendingPenalties > 0 || incidents > 0) && (
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '5px 8px',
          borderBottom: '1px solid #1a1a1a',
          fontSize: '9px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          flexWrap: 'wrap',
        }}>
          {underInvestigation > 0 && (
            <span style={{ color: '#f59e0b' }}>{underInvestigation} under review</span>
          )}
          {pendingPenalties > 0 && (
            <span style={{ color: '#ef4444' }}>{pendingPenalties} penalty pending</span>
          )}
          {incidents > 0 && (
            <span style={{ color: '#888' }}>{incidents} inc</span>
          )}
        </div>
      )}
      {relevant.length === 0 ? (
        <div style={styles.empty}>No events yet</div>
      ) : (
        <div style={styles.list} ref={listRef}>
          {relevant.map((event) => {
            const config = EVENT_CONFIG[event.type] || { tag: '?', color: '#666', bg: 'transparent' };
            return (
              <div key={event.id} style={{ ...styles.entry, background: config.bg }}>
                <span style={styles.time}>{formatTime(event.timestamp)}</span>
                <span style={{ ...styles.tag, color: config.color, background: `${config.color}18`, border: `1px solid ${config.color}33` }}>
                  {config.tag}
                </span>
                <span style={styles.text}>{formatEventText(event)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
