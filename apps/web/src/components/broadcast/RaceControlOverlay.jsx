/**
 * Race Control overlay — OBS browser source for the broadcast crew.
 * Shows steward calls the moment they're published from the steward app:
 * "UNDER INVESTIGATION", penalties, and the no-action outcomes.
 * Cards stack (newest on top) and auto-dismiss.
 *
 *   /overlay/racecontrol            bottom-left lower-third stack
 *   /overlay/racecontrol?max=2      at most 2 cards on screen
 *   /overlay/racecontrol?hold=15    seconds a card stays (default 12, penalties 18)
 */
import { useEffect, useState } from 'react';
import { wsClient } from '../../lib/ws-client';

const KINDS = {
  under_investigation: { tag: 'UNDER INVESTIGATION', color: '#f59e0b', fg: '#111' },
  penalty_issued:      { tag: 'PENALTY',              color: '#e5404e', fg: '#fff' },
  racing_incident:     { tag: 'RACING INCIDENT',      color: '#60a5fa', fg: '#111' },
  no_further_action:   { tag: 'NO FURTHER ACTION',    color: '#22c55e', fg: '#111' },
  incident_noted:      { tag: 'INCIDENT NOTED',       color: '#9ca3af', fg: '#111' },
  warning_issued:      { tag: 'WARNING',              color: '#f59e0b', fg: '#111' },
  penalty_served:      { tag: 'PENALTY SERVED',       color: '#22c55e', fg: '#111' },
};
const TIER = { 'drive-through': 'Drive-through', 'stop-go': 'Stop & go', time: 'Time penalty', 'eol-next-race': 'End of line · next race', 'grid-drop': 'Grid drop', 'license-points': 'Licence points', dsq: 'Disqualified', 'black-flag': 'Black flag' };

function lines(ev) {
  const d = ev.data || {};
  const cars = (d.cars || []).map((c) => `#${c.number} ${c.name}`).join('  ·  ') || d.driverNames || (d.carNumber ? `#${d.carNumber} ${d.driverName}` : d.driverName) || '';
  switch (ev.type) {
    case 'penalty_issued': {
      const who = d.carNumber ? `#${d.carNumber} ${d.driverName}` : cars;
      const what = `${TIER[d.penaltyType] || d.penaltyType || ''}${d.timeSeconds ? ` +${d.timeSeconds}s` : ''}${d.points ? ` · ${d.points} pts` : ''}`;
      return [who, what, d.reason || ''];
    }
    case 'penalty_served': return [d.carNumber ? `#${d.carNumber} ${d.driverName}` : d.driverName, TIER[d.penaltyType] || '', ''];
    default: return [cars, d.reason || d.note || '', d.lap != null ? `Lap ${d.lap}` : ''];
  }
}

const S = {
  stack: { position: 'fixed', left: 40, bottom: 48, display: 'flex', flexDirection: 'column', gap: 10, fontFamily: '"Barlow Condensed", "Arial Narrow", Impact, sans-serif' },
  card: { display: 'flex', alignItems: 'stretch', minWidth: 520, maxWidth: 820, background: 'rgba(8,9,14,0.92)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', transform: 'skewX(-8deg)', overflow: 'hidden', animation: 'rcIn 0.35s ease-out' },
  tag: (k) => ({ background: k.color, color: k.fg, fontWeight: 800, fontSize: 22, letterSpacing: '1.5px', padding: '10px 18px', display: 'flex', alignItems: 'center', textTransform: 'uppercase', whiteSpace: 'nowrap' }),
  body: { padding: '8px 18px 8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', transform: 'skewX(8deg)' },
  who: { color: '#fff', fontWeight: 700, fontSize: 26, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '0.5px' },
  what: { color: '#e5e7eb', fontWeight: 600, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 },
  why: { color: '#9ca3af', fontWeight: 500, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.5px' },
  slashes: { width: 14, background: 'repeating-linear-gradient(135deg, #e5404e 0 6px, transparent 6px 12px)' },
};

export function RaceControlOverlay({ max = 3, hold = 12 }) {
  const [cards, setCards] = useState([]);
  useEffect(() => {
    const unsub = wsClient.on('event', (ev) => {
      if (!ev || !KINDS[ev.type]) return;
      const id = ev.id ?? `${ev.type}-${ev.timestamp}`;
      const ttl = (ev.type === 'penalty_issued' ? Math.max(hold, 18) : hold) * 1000;
      setCards((prev) => [{ ...ev, _id: id, _until: Date.now() + ttl }, ...prev.filter((c) => c._id !== id)].slice(0, max));
    });
    const timer = setInterval(() => setCards((prev) => prev.filter((c) => c._until > Date.now())), 500);
    return () => { unsub(); clearInterval(timer); };
  }, [max, hold]);
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&display=swap'); @keyframes rcIn { from { opacity: 0; transform: skewX(-8deg) translateX(-30px); } to { opacity: 1; transform: skewX(-8deg) translateX(0); } }`}</style>
      <div style={S.stack}>
        {cards.map((ev) => {
          const k = KINDS[ev.type];
          const [who, what, why] = lines(ev);
          return (
            <div key={ev._id} style={S.card}>
              <div style={S.slashes} />
              <div style={S.tag(k)}>{k.tag}</div>
              <div style={S.body}>
                <div style={S.who}>{who}</div>
                {what && <div style={S.what}>{what}</div>}
                {why && <div style={S.why}>{why}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
