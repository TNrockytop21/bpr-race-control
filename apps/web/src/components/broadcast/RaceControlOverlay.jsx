/**
 * Race Control overlay — OBS browser source for the broadcast crew.
 * Shows steward calls the moment they're published from the steward app:
 * "UNDER INVESTIGATION", penalties, and the no-action outcomes.
 * Cards stack (newest on top) and auto-dismiss.
 *
 *   /overlay/racecontrol            bottom-left lower-third stack
 *   /overlay/racecontrol?max=2      at most 2 cards on screen
 *   /overlay/racecontrol?hold=15    seconds a card stays (default 12, penalties 18)
 *   /overlay/racecontrol?demo=1     plays sample calls on a loop — use it to place and size the source in OBS
 *   /overlay/racecontrol?pos=br     corner: bl (default) | br | tl | tr — cards grow away from the corner
 *   /overlay/racecontrol?scale=0.8  shrink or enlarge the cards
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
  stack: { position: 'fixed', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: '"Barlow Condensed", "Arial Narrow", Impact, sans-serif' },
  card: { display: 'flex', alignItems: 'stretch', minWidth: 520, maxWidth: 1100, background: 'rgba(8,9,14,0.92)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', transform: 'skewX(-8deg)', overflow: 'hidden', animation: 'rcIn 0.35s ease-out' },
  tag: (k) => ({ background: k.color, color: k.fg, fontWeight: 800, fontSize: 22, letterSpacing: '1.5px', padding: '10px 18px', display: 'flex', alignItems: 'center', textTransform: 'uppercase', whiteSpace: 'nowrap' }),
  body: { padding: '8px 18px 8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', transform: 'skewX(8deg)' },
  who: { color: '#fff', fontWeight: 700, fontSize: 26, lineHeight: 1.05, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' },
  what: { color: '#e5e7eb', fontWeight: 600, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 },
  why: { color: '#9ca3af', fontWeight: 500, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.5px' },
  slashes: { width: 14, background: 'repeating-linear-gradient(135deg, #e5404e 0 6px, transparent 6px 12px)' },
};

// Sample calls for ?demo=1 (positioning the source in OBS, previews)
const DEMO = [
  { type: 'under_investigation', data: { cars: [{ number: '913', name: 'Dalton M Dudley' }, { number: '702', name: 'David Turnbull' }], lap: 12, note: 'Contact at The Chase' } },
  { type: 'penalty_issued', data: { carNumber: '15', driverName: 'Timothy Schaefer', penaltyType: 'drive-through', reason: 'Avoidable contact', lap: 4 } },
  { type: 'racing_incident', data: { cars: [{ number: '23', name: 'James A Pearce' }, { number: '250', name: 'Alexander Cortez' }], reason: 'Racing incident, no further action', lap: 18 } },
  { type: 'penalty_issued', data: { carNumber: '25', driverName: 'Randy Olivo', penaltyType: 'time', timeSeconds: 15, reason: 'Avoidable contact', lap: 31 } },
  { type: 'penalty_served', data: { carNumber: '15', driverName: 'Timothy Schaefer', penaltyType: 'drive-through' } },
  { type: 'no_further_action', data: { cars: [{ number: '38', name: 'Lorenzo Araujo' }], reason: 'No further action', lap: 22 } },
  { type: 'warning_issued', data: { cars: [{ number: '001', name: 'Paul Basson' }], reason: 'Track limits', lap: 9 } },
];

const POS = {
  bl: { left: 40, bottom: 48, alignItems: 'flex-start', flexDirection: 'column' },
  br: { right: 40, bottom: 48, alignItems: 'flex-end', flexDirection: 'column' },
  tl: { left: 40, top: 40, alignItems: 'flex-start', flexDirection: 'column-reverse' },
  tr: { right: 40, top: 40, alignItems: 'flex-end', flexDirection: 'column-reverse' },
};

export function RaceControlOverlay({ max = 3, hold = 12, demo = false, still = false, pos = 'bl', scale = 1 }) {
  const [cards, setCards] = useState([]);
  useEffect(() => {
    if (!demo) return undefined;
    let i = 0;
    const push = () => {
      const ev = { ...DEMO[i % DEMO.length], id: `demo-${i}`, timestamp: Date.now() };
      i += 1;
      const ttl = (ev.type === 'penalty_issued' ? Math.max(hold, 18) : hold) * 1000;
      setCards((prev) => [{ ...ev, _id: ev.id, _until: Date.now() + ttl }, ...prev].slice(0, max));
    };
    push(); push();
    const t = setInterval(push, 6000);
    const sweep = setInterval(() => setCards((prev) => prev.filter((c) => c._until > Date.now())), 500);
    return () => { clearInterval(t); clearInterval(sweep); };
  }, [demo, max, hold]);
  useEffect(() => {
    if (demo) return undefined;
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
      <div style={{ ...S.stack, ...(POS[pos] || POS.bl), transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: pos.includes('r') ? (pos.includes('t') ? 'top right' : 'bottom right') : (pos.includes('t') ? 'top left' : 'bottom left') }}>
        {cards.map((ev) => {
          const k = KINDS[ev.type];
          const [who, what, why] = lines(ev);
          return (
            <div key={ev._id} style={{ ...S.card, animation: still ? 'none' : S.card.animation }}>
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
