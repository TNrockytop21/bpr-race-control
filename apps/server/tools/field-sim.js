#!/usr/bin/env node
/**
 * Field feed simulator — stands in for `irsdk-bridge.exe feed` so the
 * server and the steward app can be exercised without iRacing.
 *
 *   node apps/server/tools/field-sim.js [--url ws://localhost:8080/ws/steward] [--speed 1] [--name SIM]
 *
 * Connects as a steward (legacy hello, no token), then streams the same
 * `session` / `frame` lines the real bridge emits for a 28-car LMP2/GT3
 * field with a scripted set of incidents:
 *   t≈45s  #913 and #702 each gain 4x at the same spot  -> one contact incident
 *   t≈70s  #38 gains 1x                                  -> off-track (hidden by default)
 *   t≈95s  #23 gains 2x                                  -> loss of control, #250 nearby
 *   t≈120s #913 black-flagged, serves it in the pits at t≈150s
 * Session lines go out once a second, frames four times a second.
 */
import WebSocket from 'ws';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'ws://localhost:8080/ws/steward');
const SPEED = Number(opt('--speed', '1'));
const NAME = opt('--name', 'SIM');

const LMP2 = [['913', 'Dalton M Dudley'], ['702', 'David Turnbull'], ['11', 'Alan Aguilar'], ['824', 'Thomas Gruber'], ['242', 'Adden Bethell'], ['789', 'Andrew Espenes'], ['530', 'Arden Green'], ['33', 'Sammy Hendrix'], ['01', 'Jacobb Sheridan'], ['41', 'Andrew B Fabian'], ['27', 'Harrison Holliday'], ['37', 'Owen Kizak']];
const GT3 = [['23', 'James A Pearce'], ['250', 'Alexander Cortez'], ['53', 'Joseph Crawford'], ['54', 'Daniel Leeth'], ['338', 'Anthony Mazzella'], ['000', 'Zach Houston'], ['212', 'Pawel Kaska'], ['15', 'Timothy Schaefer'], ['001', 'Paul Basson'], ['25', 'Randy Olivo'], ['93', 'Mark Samad'], ['380', 'Walker Morgan'], ['29', 'John Voigt'], ['619', 'Christopher Grondin'], ['517', 'Josh Mann'], ['38', 'Lorenzo Araujo']];

const cars = [];
let idx = 0;
for (const [num, name] of LMP2) cars.push({ carIdx: idx++, number: num, name, classId: 2708, classShort: 'LMP2', car: 'Dallara P217', lapTime: 110 + Math.random() * 2, pct: 0, lap: 0, inc: 0, onPit: false, flags: 0 });
for (const [num, name] of GT3) cars.push({ carIdx: idx++, number: num, name, classId: 4011, classShort: 'GT3', car: 'GT3', lapTime: 122 + Math.random() * 2.5, pct: 0, lap: 0, inc: 0, onPit: false, flags: 0 });
// stagger the grid
cars.forEach((c, i) => { c.pct = ((1 - i * 0.004) + 1) % 1; c.lap = 0; });
const byNum = (n) => cars.find((c) => c.number === n);

const FLAG_BLACK = 0x00010000;
let sessionTime = 0;
const SESSION_NUM = 2;
const ws = new WebSocket(URL);
const send = (type, payload) => ws.readyState === 1 && ws.send(JSON.stringify({ type, payload }));

function sessionLine() {
  return {
    t: 'session', update: Math.floor(sessionTime),
    weekend: { TrackName: 'bathurst', TrackID: 219, TrackDisplayName: 'Mount Panorama Circuit', TrackLength: '6.21 km', SessionID: 260000001, SubSessionID: 88454474, LeagueID: 5555, SeasonID: 0 },
    sessions: [{ SessionNum: 0, SessionType: 'Practice', SessionName: 'PRACTICE' }, { SessionNum: 1, SessionType: 'Open Qualify', SessionName: 'QUALIFY' }, { SessionNum: 2, SessionType: 'Race', SessionName: 'RACE' }],
    drivers: cars.map((c) => ({ CarIdx: c.carIdx, UserName: c.name, UserID: 100000 + c.carIdx, CarNumber: c.number, CarClassID: c.classId, CarClassShortName: c.classShort, CarScreenNameShort: c.car, CarIsPaceCar: 0, IsSpectator: 0, CurDriverIncidentCount: c.inc, TeamIncidentCount: c.inc })),
    cameras: [{ GroupNum: 1, GroupName: 'Nose' }, { GroupNum: 5, GroupName: 'Chase' }, { GroupNum: 10, GroupName: 'Cockpit' }, { GroupNum: 11, GroupName: 'TV1' }, { GroupNum: 12, GroupName: 'TV2' }, { GroupNum: 13, GroupName: 'TV3' }, { GroupNum: 16, GroupName: 'Chopper' }],
  };
}
function frameLine() {
  const order = [...cars].sort((a, b) => (b.lap + b.pct) - (a.lap + a.pct));
  order.forEach((c, i) => { c.pos = i + 1; });
  const classPos = {};
  for (const c of order) { classPos[c.classId] = (classPos[c.classId] || 0) + 1; c.classPos = classPos[c.classId]; }
  return {
    t: 'frame', sessionNum: SESSION_NUM, sessionTime: Number(sessionTime.toFixed(2)), sessionState: 4, flags: 0x4,
    cam: { carIdx: 0, group: 11, camera: 1 }, replay: { sessionNum: SESSION_NUM, sessionTime: Number(sessionTime.toFixed(2)), speed: 1, playing: false, frame: Math.floor(sessionTime * 60) },
    cars: cars.map((c) => [c.carIdx, c.lap, Number(c.pct.toFixed(4)), c.pos, c.classPos, c.onPit ? 1 : 0, c.onPit ? 2 : 3, c.flags, Math.max(0, c.lap - 1)]),
  };
}

const fired = new Set();
function script() {
  const t = sessionTime;
  const once = (key, when, fn) => { if (t >= when && !fired.has(key)) { fired.add(key); fn(); console.log(`[sim] t=${t.toFixed(0)}s ${key}`); } };
  once('contact', 45, () => { const a = byNum('913'), b = byNum('702'); b.pct = a.pct - 0.003; b.lap = a.lap; a.inc += 4; b.inc += 4; });
  once('offtrack', 70, () => { byNum('38').inc += 1; });
  once('loss', 95, () => { const a = byNum('23'), b = byNum('250'); b.pct = a.pct + 0.006; b.lap = a.lap; a.inc += 2; });
  once('black', 120, () => { byNum('913').flags |= FLAG_BLACK; });
  once('pit-in', 140, () => { byNum('913').onPit = true; });
  once('served', 150, () => { const c = byNum('913'); c.flags &= ~FLAG_BLACK; c.onPit = false; });
}

ws.on('open', () => {
  console.log(`[sim] connected to ${URL} as ${NAME}`);
  send('steward:hello', { name: NAME, role: 'SUPPORT' });
  send('rc:field', { t: 'hello', feed: 1, sim: true });
  send('rc:field', sessionLine());
  let lastSession = 0;
  const step = 0.25 * SPEED;
  setInterval(() => {
    sessionTime += step;
    for (const c of cars) { const adv = step / c.lapTime * (c.onPit ? 0.4 : 1); c.pct += adv; if (c.pct >= 1) { c.pct -= 1; c.lap += 1; } }
    script();
    send('rc:field', frameLine());
    if (sessionTime - lastSession >= 1) { lastSession = sessionTime; send('rc:field', sessionLine()); }
  }, 250);
});
ws.on('message', (raw) => {
  try {
    const { type, payload } = JSON.parse(raw);
    if (type === 'rc:incident') console.log(`[sim] <- incident ${payload.incident.category} ${payload.incident.cars.map((c) => '#' + c.number).join('+')} status=${payload.incident.status}`);
    if (type === 'rc:penaltyServed') console.log(`[sim] <- served #${payload.number}`);
    if (type === 'rc:error') console.log('[sim] <- error', payload);
    // Stand in for the in-session steward PC: a remote steward's penalty arrives as an admin command to type
    if (type === 'rc:applyInSim') {
      console.log(`[sim] <- applyInSim from ${payload.from?.name}: ${payload.command} (typing it)`);
      send('rc:applied', { incidentId: payload.incidentId, command: payload.command, ok: true, error: null, requestedBy: payload.from });
    }
  } catch { /* ignore */ }
});
ws.on('close', () => { console.log('[sim] closed'); process.exit(0); });
ws.on('error', (e) => { console.error('[sim] error', e.message); });
