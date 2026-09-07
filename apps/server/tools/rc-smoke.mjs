// Smoke test for Race Control v2: run the server on PORT (default 8091) and the field simulator at --speed 8, then `node apps/server/tools/rc-smoke.mjs`.
import WebSocket from 'ws';
const PORT = process.env.PORT || 8091;
const log = (...a) => console.log('[test]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(path, hello) {
  const ws = new WebSocket(`ws://localhost:${PORT}${path}`);
  const got = [];
  ws.on('message', (raw) => { try { got.push(JSON.parse(raw)); } catch {} });
  return new Promise((res) => ws.on('open', () => { if (hello) ws.send(JSON.stringify(hello)); res({ ws, got, send: (type, payload) => ws.send(JSON.stringify({ type, payload })) }); }));
}
const steward = await client('/ws/steward', { type: 'steward:hello', payload: { name: 'Jason', role: 'MAIN' } });
const mike = await client('/ws/steward', { type: 'steward:hello', payload: { name: 'Mike', role: 'SUPPORT' } });
const viewer = await client('/ws/viewer', { type: 'subscribe:all', payload: {} });
await sleep(500);
const snap = steward.got.find((m) => m.type === 'rc:snapshot');
log('snapshot on auth:', !!snap, 'incidents', snap?.payload?.incidents?.length);
// wait for the sim's contact incident (t≈45s at speed 8 -> ~6s)
let contact = null;
for (let i = 0; i < 40 && !contact; i++) { await sleep(500); contact = steward.got.map((m) => m.payload?.incident).find((inc) => inc && inc.category === 'contact' && inc.cars.length === 2); }
if (!contact) { log('FAIL: no merged contact incident'); process.exit(1); }
log('contact incident:', contact.cars.map((c) => `#${c.number} ${c.name} +${c.delta}x`).join(' & '), 'lap', contact.lap, 'nearby', contact.nearby.map((n) => '#' + n.number).join(','));
const field = steward.got.filter((m) => m.type === 'rc:fieldState').pop();
log('field cars:', field?.payload?.cars?.length, 'source:', field?.payload?.source?.name);
// Mike claims, Jason tries too -> denied
mike.send('rc:claim', { incidentId: contact.id }); await sleep(300);
steward.send('rc:claim', { incidentId: contact.id }); await sleep(300);
const denied = steward.got.find((m) => m.type === 'rc:error');
log('second claim denied:', !!denied, denied?.payload?.error, 'by', denied?.payload?.by?.name);
// Jason takes over, announces, decides a drive-through
steward.send('rc:claim', { incidentId: contact.id, force: true }); await sleep(200);
steward.send('rc:publish', { incidentId: contact.id, what: 'investigation' }); await sleep(200);
steward.send('rc:decide', { incidentId: contact.id, decision: { type: 'penalty', tier: 'drive-through', carIdx: contact.cars[0].carIdx, reason: 'Avoidable contact', notes: 'turned in on him' } }); await sleep(400);
const latest = steward.got.map((m) => m.payload?.incident).filter((i) => i && i.id === contact.id).pop();
log('after decide: status', latest.status, 'claimedBy', latest.claimedBy?.name, 'decision', latest.decision?.tier, 'by', latest.decision?.by?.name);
const evs = viewer.got.filter((m) => m.type === 'event').map((m) => m.payload.type);
log('viewer events:', evs.join(', '));
// share view
steward.send('rc:shareView', { sessionNum: 2, sessionTime: 40, carIdx: 0, carNumber: '913', camGroup: 11, camGroupName: 'TV1', speed: 1 }); await sleep(300);
const shared = mike.got.find((m) => m.type === 'rc:viewShared');
log('mike got shared view from', shared?.payload?.from?.name, 'car', shared?.payload?.view?.carNumber);
// remote desk: Mike (no sim) issues an in-sim command -> relayed to the feed source (SIM) -> applied report comes back
mike.send('rc:applyInSim', { incidentId: contact.id, command: `!black #${contact.cars[0].number}` }); await sleep(400);
const applied = mike.got.find((m) => m.type === 'rc:applied');
log('remote apply relayed:', applied ? `${applied.payload.command} ok=${applied.payload.ok} by ${applied.payload.by?.name}` : 'NOT SEEN');
mike.send('rc:applyInSim', { incidentId: contact.id, command: 'rm -rf' }); await sleep(300);
log('bad command rejected:', !!mike.got.find((m) => m.type === 'rc:error' && m.payload.error === 'unsupported command'));
// wait for the black flag to be served (sim t≈150 -> ~19s at speed 8)
let served = null;
for (let i = 0; i < 60 && !served; i++) { await sleep(500); served = steward.got.find((m) => m.type === 'rc:penaltyServed'); }
log('served:', served ? `#${served.payload.number} incident=${served.payload.incidentId ? 'linked' : 'unlinked'}` : 'NOT SEEN');
// off-track + loss-of-control present?
const cats = [...new Set(steward.got.map((m) => m.payload?.incident?.category).filter(Boolean))];
log('categories seen:', cats.join(', '));
const rest = await fetch(`http://localhost:${PORT}/api/rc/incidents`).then((r) => r.json());
log('REST ledger:', rest.sessionKey, rest.incidents.length, 'incidents; statuses', [...new Set(rest.incidents.map((i) => i.status))].join(','));
process.exit(served && applied?.payload?.ok && latest.status === 'published' && evs.includes('under_investigation') && evs.includes('penalty_issued') ? 0 : 2);
